const express = require("express");
const crypto = require("crypto");
const Group = require("../models/Group");
const Repo = require("../models/Repo");
const User = require("../models/User");

const router = express.Router();

// Helper to generate unique Group ID (e.g., GRP-7A9B3F)
function generateUniqueGroupId() {
  const hex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `GRP-${hex}`;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

// Keep only the origin of a configured base URL, so values such as
// "https://site.com/teams" still produce "https://site.com/accept-invite"
function toOrigin(value, fallback) {
  const raw = trimTrailingSlash(value);
  if (!raw) return fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/[^/]*$/, "");
  }
}

// Public base URL of the frontend site (used to build the links inside invitation emails)
function getFrontendUrl(req) {
  const fromEnv = toOrigin(process.env.FRONTEND_URL, "");
  if (fromEnv) return fromEnv;

  const origin = toOrigin(req.get("origin") || req.get("referer") || "", "");
  if (origin) return origin;

  return "http://localhost:5173";
}

// Public base URL of this API (email clients hit these links directly)
function getApiUrl(req) {
  const fromEnv = toOrigin(process.env.SERVER_URL, "");
  if (fromEnv) return fromEnv;

  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  return trimTrailingSlash(`${protocol}://${req.get("host")}`);
}

function buildInviteLinks(req, inviteToken) {
  const frontendUrl = getFrontendUrl(req);
  const apiUrl = getApiUrl(req);
  const query = `token=${encodeURIComponent(inviteToken)}`;

  return {
    acceptUrl: `${apiUrl}/api/groups/invite-response?${query}&response=accept`,
    declineUrl: `${apiUrl}/api/groups/invite-response?${query}&response=decline`,
    pageUrl: `${frontendUrl}/accept-invite?${query}`,
  };
}

// Strip admin-only and internal fields (unique groupId, invite tokens) before sending a group to the client
function sanitizeGroup(group) {
  const obj = group.toObject ? group.toObject() : { ...group };
  delete obj.groupId;
  obj.members = (obj.members || []).map((m) => {
    const member = m.toObject ? m.toObject() : { ...m };
    delete member.inviteToken;
    return member;
  });
  return obj;
}

// GET /api/groups/my-groups - Get groups for current user (hides unique groupId for non-admin)
router.get("/my-groups", async (req, res) => {
  try {
    const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";

    if (!username && !email) {
      return res.status(400).json({ message: "Username or email is required to fetch user groups." });
    }

    const exact = (value) => new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const query = {
      $or: [
        ...(username ? [{ creator: exact(username) }, { "members.username": exact(username) }] : []),
        ...(email ? [{ creatorEmail: exact(email) }, { "members.email": exact(email) }] : [])
      ]
    };

    const groups = await Group.find(query).populate("repositories").sort({ createdAt: -1 });

    const isSame = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
    const isCreatorOf = (obj) => isSame(obj.creator, username) || isSame(obj.creatorEmail, email);
    const isMemberOf = (member) => isSame(member.username, username) || isSame(member.email, email);

    // Privacy filter: hide the admin-only groupId and invitation tokens.
    // Members who declined are only listed for the group creator, so they can be re-invited.
    const safeGroups = groups
      .map((g) => {
        const obj = g.toObject();
        delete obj.groupId; // Only visible to admin

        const requesterIsCreator = isCreatorOf(obj);
        obj.members = (obj.members || [])
          .filter((m) => requesterIsCreator || m.status !== "declined")
          .map((m) => {
            delete m.inviteToken;
            return m;
          });
        return obj;
      })
      // A group the requester only declined must not show up in their team list
      .filter((obj) => isCreatorOf(obj) || (obj.members || []).some(isMemberOf));

    res.status(200).json(safeGroups);
  } catch (error) {
    console.error("Error fetching user groups:", error);
    res.status(500).json({ message: "Error fetching user groups: " + error.message });
  }
});

// POST /api/groups - Create a new team group
router.post("/", async (req, res) => {
  try {
    const { name, description, creator, creatorEmail } = req.body;
    const groupName = (name || "").trim();
    const creatorUser = (creator || "").trim();

    if (!groupName) {
      return res.status(400).json({ message: "Group name is required." });
    }
    if (!creatorUser) {
      return res.status(400).json({ message: "Creator username is required." });
    }

    const uniqueGroupId = generateUniqueGroupId();

    const newGroup = new Group({
      groupId: uniqueGroupId,
      name: groupName,
      description: description || "",
      creator: creatorUser,
      creatorEmail: creatorEmail || "",
      members: [
        {
          username: creatorUser,
          email: creatorEmail || "",
          role: "creator",
          joinedAt: new Date()
        }
      ],
      repositories: []
    });

    await newGroup.save();

    // Return safe object without groupId for standard creator response
    const resObj = sanitizeGroup(newGroup);

    res.status(201).json({ message: "Group created successfully", group: resObj });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Error creating group: " + error.message });
  }
});

const { sendGroupInvitationEmail } = require("../mailer");

// Apply an invitation response ("accept" | "decline") to a pending member
async function respondToInvitation(token, response) {
  const inviteToken = (token || "").trim();
  const decision = response === "decline" || response === "declined" ? "declined" : "accepted";

  if (!inviteToken) {
    return { ok: false, status: 400, message: "Invitation token is required." };
  }

  const group = await Group.findOne({ "members.inviteToken": inviteToken });
  if (!group) {
    return { ok: false, status: 404, message: "Invalid or expired invitation token." };
  }

  const member = group.members.find((m) => m.inviteToken === inviteToken);
  if (!member) {
    return { ok: false, status: 404, message: "Invitation member record not found." };
  }

  const isDecline = decision === "declined";
  member.status = decision;
  member.inviteToken = undefined;
  member.respondedAt = new Date();
  await group.save();

  return {
    ok: true,
    status: 200,
    decision,
    memberUsername: member.username,
    groupId: group._id.toString(),
    groupName: group.name,
    message: isDecline
      ? `Invitation declined. You did not join the group "${group.name}".`
      : `Invitation accepted successfully! You are now an active member of group "${group.name}".`,
  };
}

// GET /api/groups/invite-response - One-click handler behind the "I Agree" / "I Disagree" email buttons
router.get("/invite-response", async (req, res) => {
  const frontendUrl = getFrontendUrl(req);
  const { token, response } = req.query;

  try {
    const result = await respondToInvitation(token, response);

    if (!result.ok) {
      return res.redirect(
        `${frontendUrl}/accept-invite?token=${encodeURIComponent((token || "").trim())}&status=error&message=${encodeURIComponent(result.message)}`
      );
    }

    const params = new URLSearchParams({
      invite: result.decision,
      group: result.groupName,
      username: result.memberUsername,
    });
    if (result.decision === "declined") {
      params.append("declinedGroupId", result.groupId);
    }

    return res.redirect(`${frontendUrl}/teams?${params.toString()}`);
  } catch (error) {
    console.error("Error handling invitation response:", error);
    return res.redirect(
      `${frontendUrl}/accept-invite?token=${encodeURIComponent((token || "").trim())}&status=error&message=${encodeURIComponent("Error processing invitation: " + error.message)}`
    );
  }
});

// POST /api/groups/accept-invite - Accept team group member invitation via token
router.post("/accept-invite", async (req, res) => {
  try {
    const { token } = req.body || {};
    const result = await respondToInvitation(token, "accept");

    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    res.status(200).json({
      message: result.message,
      groupName: result.groupName,
      groupId: result.groupId,
      username: result.memberUsername,
    });
  } catch (error) {
    console.error("Error accepting group invitation:", error);
    res.status(500).json({ message: "Error accepting invitation: " + error.message });
  }
});

// POST /api/groups/decline-invite - Decline team group member invitation via token
router.post("/decline-invite", async (req, res) => {
  try {
    const { token } = req.body || {};
    const result = await respondToInvitation(token, "decline");

    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    res.status(200).json({
      message: result.message,
      groupName: result.groupName,
      groupId: result.groupId,
      username: result.memberUsername,
    });
  } catch (error) {
    console.error("Error declining group invitation:", error);
    res.status(500).json({ message: "Error declining invitation: " + error.message });
  }
});

// POST /api/groups/:id/members - Add a member to a group (by username or email) and send invitation email
router.post("/:id/members", async (req, res) => {
  try {
    const { username, email, identifier, role } = req.body;
    const targetInput = (identifier || username || email || "").trim();

    if (!targetInput) {
      return res.status(400).json({ message: "Username or email is required to add a member." });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    // Try finding registered user in database by username or email
    const escapedInput = targetInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const foundUser = await User.findOne({
      $or: [
        { username: new RegExp(`^${escapedInput}$`, "i") },
        { gmail: new RegExp(`^${escapedInput}$`, "i") }
      ]
    });

    const finalUsername = foundUser ? foundUser.username : (targetInput.includes("@") ? targetInput.split("@")[0] : targetInput);
    const finalEmail = foundUser ? foundUser.gmail : (targetInput.includes("@") ? targetInput : (email || ""));

    if (!finalEmail) {
      return res.status(400).json({
        message: `No registered email address found for "${targetInput}". Please enter a valid email address (e.g., name@gmail.com) so the invitation email can be sent.`
      });
    }

    // Check if user is already a member
    const existingMember = group.members.find(
      (m) => m.username.toLowerCase() === finalUsername.toLowerCase() ||
             (finalEmail && m.email && m.email.toLowerCase() === finalEmail.toLowerCase())
    );

    let inviteToken = crypto.randomBytes(24).toString("hex");

    if (existingMember) {
      if (existingMember.status === "pending" || existingMember.status === "declined") {
        // Refresh token and resend invitation email (re-inviting a declined member)
        existingMember.inviteToken = inviteToken;
        existingMember.status = "pending";
        existingMember.respondedAt = undefined;
        if (finalEmail) existingMember.email = finalEmail;
        await group.save();

        const links = buildInviteLinks(req, inviteToken);
        const { sent, error } = await sendGroupInvitationEmail(
          finalEmail, finalUsername, group.name, group.creator, links.acceptUrl, links.declineUrl
        );
        const emailStatus = sent ? "sent" : `could not be sent (${error})`;

        const resObj = sanitizeGroup(group);

        return res.status(200).json({
          message: `Invitation email ${emailStatus} to ${finalEmail || finalUsername}.`,
          emailSent: sent,
          emailError: sent ? null : error,
          group: resObj
        });
      }

      return res.status(409).json({ message: `User "${finalUsername}" is already an active member of this group.` });
    }

    const memberRole = role === "creator" ? "creator" : "editor";

    group.members.push({
      username: finalUsername,
      email: finalEmail,
      role: memberRole,
      status: "pending",
      inviteToken: inviteToken,
      joinedAt: new Date()
    });

    await group.save();

    // Build the "I Agree" / "I Disagree" links used by the invitation email
    const links = buildInviteLinks(req, inviteToken);
    console.log(`🔗 Invitation links for ${finalUsername} (${finalEmail}):`);
    console.log(`   I Agree   -> ${links.acceptUrl}`);
    console.log(`   I Disagree-> ${links.declineUrl}`);

    let emailStatus = "queued";
    let emailError = null;
    if (finalEmail) {
      const { sent, error } = await sendGroupInvitationEmail(
        finalEmail, finalUsername, group.name, group.creator, links.acceptUrl, links.declineUrl
      );
      emailStatus = sent ? "sent" : `could not be sent (${error})`;
      emailError = sent ? null : error;
      if (!sent) {
        console.warn(`Invitation email for ${finalEmail} could NOT be sent: ${error}`);
      }
    }

    const resObj = sanitizeGroup(group);

    res.status(200).json({
      message: emailStatus === "sent"
        ? `Invitation email sent to ${finalEmail}. They will become an active member upon clicking "I Agree", or be skipped upon clicking "I Disagree".`
        : `Invitation email ${emailStatus} to ${finalEmail || finalUsername}.`,
      emailSent: emailStatus === "sent",
      emailError,
      group: resObj
    });
  } catch (error) {
    console.error("Error adding member to group:", error);
    res.status(500).json({ message: "Error adding member: " + error.message });
  }
});

// PUT /api/groups/:id/members/:memberId/role - Update member role
router.put("/:id/members/:memberId/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!["creator", "editor"].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be 'creator' or 'editor'." });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    const member = group.members.id(req.params.memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found in group." });
    }

    member.role = role;
    await group.save();

    const resObj = sanitizeGroup(group);

    res.status(200).json({ message: "Member role updated successfully", group: resObj });
  } catch (error) {
    console.error("Error updating member role:", error);
    res.status(500).json({ message: "Error updating member role: " + error.message });
  }
});

// DELETE /api/groups/:id/members/:memberId - Remove member from group
router.delete("/:id/members/:memberId", async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    const memberIndex = group.members.findIndex((m) => m._id.toString() === req.params.memberId);
    if (memberIndex === -1) {
      return res.status(404).json({ message: "Member not found in group." });
    }

    group.members.splice(memberIndex, 1);
    await group.save();

    const resObj = sanitizeGroup(group);

    res.status(200).json({ message: "Member removed successfully", group: resObj });
  } catch (error) {
    console.error("Error removing group member:", error);
    res.status(500).json({ message: "Error removing group member: " + error.message });
  }
});

module.exports = router;
