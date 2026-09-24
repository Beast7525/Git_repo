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

// GET /api/groups/my-groups - Get groups for current user (hides unique groupId for non-admin)
router.get("/my-groups", async (req, res) => {
  try {
    const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";

    if (!username && !email) {
      return res.status(400).json({ message: "Username or email is required to fetch user groups." });
    }

    const query = {
      $or: [
        { creator: new RegExp(`^${username}$`, "i") },
        { creatorEmail: new RegExp(`^${email}$`, "i") },
        { "members.username": new RegExp(`^${username}$`, "i") },
        { "members.email": new RegExp(`^${email}$`, "i") }
      ]
    };

    const groups = await Group.find(query).populate("repositories").sort({ createdAt: -1 });

    // Privacy filter: Hide raw groupId for standard user view
    const safeGroups = groups.map((g) => {
      const obj = g.toObject();
      delete obj.groupId; // Only visible to admin
      return obj;
    });

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
    const resObj = newGroup.toObject();
    delete resObj.groupId;

    res.status(201).json({ message: "Group created successfully", group: resObj });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ message: "Error creating group: " + error.message });
  }
});

const { sendGroupInvitationEmail } = require("../mailer");

// POST /api/groups/accept-invite - Accept team group member invitation via token
router.post("/accept-invite", async (req, res) => {
  try {
    const { token } = req.body || {};
    const inviteToken = (token || "").trim();

    if (!inviteToken) {
      return res.status(400).json({ message: "Invitation token is required." });
    }

    const group = await Group.findOne({ "members.inviteToken": inviteToken });
    if (!group) {
      return res.status(404).json({ message: "Invalid or expired invitation token." });
    }

    const member = group.members.find((m) => m.inviteToken === inviteToken);
    if (!member) {
      return res.status(404).json({ message: "Invitation member record not found." });
    }

    member.status = "accepted";
    member.inviteToken = undefined;
    await group.save();

    res.status(200).json({
      message: `Invitation accepted successfully! You are now an active member of group "${group.name}".`,
      groupName: group.name,
      username: member.username
    });
  } catch (error) {
    console.error("Error accepting group invitation:", error);
    res.status(500).json({ message: "Error accepting invitation: " + error.message });
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
      if (existingMember.status === "pending") {
        // Refresh token and resend invitation email
        existingMember.inviteToken = inviteToken;
        if (finalEmail) existingMember.email = finalEmail;
        await group.save();

        const requestHeaderOrigin = req.get("origin") || req.get("referer") || "http://localhost:5173";
        const cleanOrigin = requestHeaderOrigin.replace(/\/+$/, "").replace(/\/teams.*$/, "");
        const acceptUrl = `${cleanOrigin}/accept-invite?token=${inviteToken}`;

        let emailStatus = "queued";
        if (finalEmail) {
          const sent = await sendGroupInvitationEmail(finalEmail, finalUsername, group.name, group.creator, acceptUrl);
          emailStatus = sent ? "sent" : "could not be sent (check backend console for the SMTP error)";
        }

        const resObj = group.toObject();
        delete resObj.groupId;

        return res.status(200).json({
          message: `Invitation email ${emailStatus} to ${finalEmail || finalUsername}.`,
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

    // Construct accept verification URL
    const requestHeaderOrigin = req.get("origin") || req.get("referer") || "http://localhost:5173";
    const cleanOrigin = requestHeaderOrigin.replace(/\/+$/, "").replace(/\/teams.*$/, "");
    const acceptUrl = `${cleanOrigin}/accept-invite?token=${inviteToken}`;

    let emailStatus = "queued";
    if (finalEmail) {
      const sent = await sendGroupInvitationEmail(finalEmail, finalUsername, group.name, group.creator, acceptUrl);
      emailStatus = sent ? "sent" : "could not be sent (check backend console for the SMTP error)";
      if (!sent) {
        console.warn(`⚠️ Invitation email for ${finalEmail} could NOT be sent.`);
      }
    }

    const resObj = group.toObject();
    delete resObj.groupId;

    res.status(200).json({
      message: emailStatus === "sent"
        ? `Invitation email sent to ${finalEmail}. They will become an active member upon accepting the invitation.`
        : `Invitation email ${emailStatus} to ${finalEmail || finalUsername}.`,
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

    const resObj = group.toObject();
    delete resObj.groupId;

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

    const resObj = group.toObject();
    delete resObj.groupId;

    res.status(200).json({ message: "Member removed successfully", group: resObj });
  } catch (error) {
    console.error("Error removing group member:", error);
    res.status(500).json({ message: "Error removing group member: " + error.message });
  }
});

module.exports = router;
