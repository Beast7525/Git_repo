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
// "https://site.com/teams" still produce "https://site.com/teams/GRP-1234"
function toOrigin(value, fallback) {
  let raw = trimTrailingSlash(value);
  if (!raw) return fallback;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw.replace(/^\/+/, "")}`;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
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

// Links used by the team verification email.
//   acceptUrl / rejectUrl -> this API, which records the decision and redirects
//                            the member straight to their team page
//   teamUrl                -> the member's team page on the frontend
//   pageUrl                -> fallback page when the email buttons are not clickable
function buildVerificationLinks(req, group, inviteToken) {
  const frontendUrl = getFrontendUrl(req);
  const apiUrl = getApiUrl(req);
  const query = `token=${encodeURIComponent(inviteToken)}`;
  const groupId = group && group._id ? group._id.toString() : "";

  return {
    acceptUrl: `${apiUrl}/api/groups/verification?${query}&decision=accept`,
    rejectUrl: `${apiUrl}/api/groups/verification?${query}&decision=reject`,
    teamUrl: groupId ? `${frontendUrl}/teams/${groupId}` : `${frontendUrl}/teams`,
    pageUrl: `${frontendUrl}/accept-invite?${query}`,
  };
}

// The team owner (creator) is the only account allowed to manage memberships
function isTeamOwner(group, username, email) {
  const same = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
  return same(group.creator, username) || (Boolean(email) && same(group.creatorEmail, email));
}

function readRequester(req) {
  const source = req.body || {};
  return {
    username: String(source.requester || source.requesterUsername || source.owner || "").trim(),
    email: String(source.requesterEmail || source.ownerEmail || "").trim(),
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

// GET /api/groups/:id/team - Single team page data, used by the member's team page after ACCEPT
router.get("/:id/team", async (req, res) => {
  try {
    const { username, email } = req.query;
    const requesterName = typeof username === "string" ? username.trim() : "";
    const requesterEmail = typeof email === "string" ? email.trim() : "";

    if (!requesterName && !requesterEmail) {
      return res.status(400).json({ message: "Username or email is required to view a team." });
    }

    const group = await Group.findById(req.params.id).populate("repositories");
    if (!group) {
      return res.status(404).json({ message: "Team not found." });
    }

    const same = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
    const requesterIsCreator = same(group.creator, requesterName) || same(group.creatorEmail, requesterEmail);
    const requesterIsMember = group.members.some(
      (m) => same(m.username, requesterName) || (requesterEmail && same(m.email, requesterEmail))
    );

    if (!requesterIsCreator && !requesterIsMember) {
      return res.status(403).json({ message: "You are not a member of this team." });
    }

    const safe = sanitizeGroup(group);
    safe.members = (safe.members || []).filter((m) => requesterIsCreator || m.status !== "declined");

    res.status(200).json(safe);
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ message: "Error fetching team: " + error.message });
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

const { sendTeamVerificationEmail } = require("../mailer");

// Apply a team verification decision ("accept" | "reject") coming from the email buttons
async function verifyInvitation(token, decision) {
  const inviteToken = (token || "").trim();
  const isReject = decision === "reject" || decision === "rejected" || decision === "decline" || decision === "declined";
  const finalStatus = isReject ? "declined" : "accepted";

  if (!inviteToken) {
    return { ok: false, status: 400, message: "Invitation token is required." };
  }

  const group = await Group.findOne({ "members.inviteToken": inviteToken });
  if (!group) {
    return { ok: false, status: 404, message: "This verification link is invalid or has already been used." };
  }

  const member = group.members.find((m) => m.inviteToken === inviteToken);
  if (!member) {
    return { ok: false, status: 404, message: "This verification link no longer matches a pending member." };
  }

  member.status = finalStatus;
  member.inviteToken = undefined; // one-time link
  member.respondedAt = new Date();
  if (finalStatus === "accepted") member.verifiedAt = new Date();
  else member.verifiedAt = undefined;
  await group.save();

  console.log(
    `${finalStatus === "accepted" ? "✅" : "❌"} Team verification: ${member.username} ${finalStatus} "${group.name}"`
  );

  return {
    ok: true,
    status: 200,
    decision: finalStatus,
    memberUsername: member.username,
    memberEmail: member.email || "",
    groupId: group._id.toString(),
    groupName: group.name,
    ownerName: group.creator,
    message:
      finalStatus === "accepted"
        ? `Verification accepted. You are now a member of the team "${group.name}".`
        : `Verification rejected. You did not join the team "${group.name}".`,
  };
}

// GET /api/groups/verification - One-click handler behind the ACCEPT / REJECT email buttons.
// Accepting redirects the member straight to their own team page.
router.get("/verification", async (req, res) => {
  const frontendUrl = getFrontendUrl(req);
  const { token, decision } = req.query;

  const redirectToError = (message) =>
    res.redirect(
      `${frontendUrl}/accept-invite?token=${encodeURIComponent((token || "").trim())}&status=error&message=${encodeURIComponent(message)}`
    );

  try {
    const result = await verifyInvitation(token, decision);

    if (!result.ok) {
      return redirectToError(result.message);
    }

    const params = new URLSearchParams({
      invite: result.decision === "accepted" ? "accepted" : "rejected",
      member: result.memberUsername,
      group: result.groupName,
    });

    if (result.decision === "accepted") {
      // Accepted -> the member's own team page
      return res.redirect(`${frontendUrl}/teams/${result.groupId}?${params.toString()}`);
    }

    return res.redirect(`${frontendUrl}/teams?${params.toString()}`);
  } catch (error) {
    console.error("Error handling team verification:", error);
    return redirectToError("Error processing the verification: " + error.message);
  }
});

// POST /api/groups/accept-invite - Accept a team verification request from the fallback page
router.post("/accept-invite", async (req, res) => {
  try {
    const { token } = req.body || {};
    const result = await verifyInvitation(token, "accept");

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
    console.error("Error accepting team verification:", error);
    res.status(500).json({ message: "Error accepting verification: " + error.message });
  }
});

// POST /api/groups/decline-invite - Reject a team verification request from the fallback page
router.post("/decline-invite", async (req, res) => {
  try {
    const { token } = req.body || {};
    const result = await verifyInvitation(token, "reject");

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
    console.error("Error rejecting team verification:", error);
    res.status(500).json({ message: "Error rejecting verification: " + error.message });
  }
});

// POST /api/groups/:id/members - Team owner adds a member, who then verifies through the email
router.post("/:id/members", async (req, res) => {
  try {
    const { username, email, identifier, role } = req.body;
    const targetInput = (identifier || username || email || "").trim();

    if (!targetInput) {
      return res.status(400).json({ message: "Username or email is required to add a member." });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Team not found." });
    }

    const requester = readRequester(req);
    if (!isTeamOwner(group, requester.username, requester.email)) {
      return res.status(403).json({ message: "Only the team owner can add members to this team." });
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
        message: `No registered email address found for "${targetInput}". Please enter a valid email address (e.g., name@gmail.com) so the verification email can be sent.`
      });
    }

    if (
      finalUsername.toLowerCase() === String(group.creator).toLowerCase() ||
      (group.creatorEmail && finalEmail.toLowerCase() === String(group.creatorEmail).toLowerCase())
    ) {
      return res.status(409).json({ message: "The team owner is already a member of this team." });
    }

    // Check if user is already a member
    const existingMember = group.members.find(
      (m) => m.username.toLowerCase() === finalUsername.toLowerCase() ||
             (finalEmail && m.email && m.email.toLowerCase() === finalEmail.toLowerCase())
    );

    const inviteToken = crypto.randomBytes(24).toString("hex");
    const isResend = Boolean(
      existingMember && (existingMember.status === "pending" || existingMember.status === "declined")
    );

    if (existingMember && !isResend) {
      return res.status(409).json({ message: `User "${finalUsername}" is already a verified member of this team.` });
    }

    if (isResend) {
      // Re-send the verification email to a member who is pending or rejected the last one
      existingMember.inviteToken = inviteToken;
      existingMember.status = "pending";
      existingMember.respondedAt = undefined;
      existingMember.verifiedAt = undefined;
      existingMember.email = finalEmail;
      await group.save();
    } else {
      group.members.push({
        username: finalUsername,
        email: finalEmail,
        role: role === "creator" ? "creator" : "editor",
        status: "pending",
        inviteToken: inviteToken,
        invitedBy: group.creator,
        joinedAt: new Date()
      });
      await group.save();
    }

    // Send the verification email (ACCEPT / REJECT buttons) from gitrepo02@gmail.com to the member
    const links = buildVerificationLinks(req, group, inviteToken);
    const { sent, error } = await sendTeamVerificationEmail({
      to: finalEmail,
      memberUsername: finalUsername,
      teamName: group.name,
      ownerName: group.creator,
      ownerEmail: group.creatorEmail || requester.email,
      acceptUrl: links.acceptUrl,
      rejectUrl: links.rejectUrl,
      teamUrl: links.teamUrl,
    });

    if (sent) {
      console.log(`📧 Verification email -> ${finalEmail} | ACCEPT: ${links.acceptUrl}`);
      console.log(`📧 Verification email -> ${finalEmail} | REJECT: ${links.rejectUrl}`);
    } else {
      console.warn(`Verification email for ${finalEmail} could NOT be sent: ${error}`);
    }

    res.status(200).json({
      message: sent
        ? `Verification email sent to ${finalEmail}. They join the team "${group.name}" by clicking ACCEPT, or are skipped by clicking REJECT.`
        : `Member added, but the verification email could not be sent (${error}).`,
      emailSent: sent,
      emailError: sent ? null : error,
      resend: isResend,
      member: { username: finalUsername, email: finalEmail, status: "pending" },
      group: sanitizeGroup(group),
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
      return res.status(404).json({ message: "Team not found." });
    }

    const requester = readRequester(req);
    if (!isTeamOwner(group, requester.username, requester.email)) {
      return res.status(403).json({ message: "Only the team owner can change member roles." });
    }

    const member = group.members.id(req.params.memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found in team." });
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

// DELETE /api/groups/:id/members/:memberId - Team owner removes a member or cancels a pending verification
router.delete("/:id/members/:memberId", async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Team not found." });
    }

    const requester = readRequester(req);
    if (!isTeamOwner(group, requester.username, requester.email)) {
      return res.status(403).json({ message: "Only the team owner can remove members." });
    }

    const memberIndex = group.members.findIndex((m) => m._id.toString() === req.params.memberId);
    if (memberIndex === -1) {
      return res.status(404).json({ message: "Member not found in team." });
    }

    const wasPending = group.members[memberIndex].status === "pending";
    group.members.splice(memberIndex, 1);
    await group.save();

    res.status(200).json({
      message: wasPending ? "Pending verification cancelled." : "Member removed successfully.",
      group: sanitizeGroup(group),
    });
  } catch (error) {
    console.error("Error removing group member:", error);
    res.status(500).json({ message: "Error removing group member: " + error.message });
  }
});

module.exports = router;
