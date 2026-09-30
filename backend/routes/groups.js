const express = require("express");
const crypto = require("crypto");
const Group = require("../models/Group");
const Notification = require("../models/Notification");
const Repo = require("../models/Repo");
const User = require("../models/User");
const { optionalAuth, requireAuth } = require("../middleware/auth");

const router = express.Router();

// Helper to generate unique Group ID (e.g., GRP-7A9B3F)
function generateUniqueGroupId() {
  const hex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `GRP-${hex}`;
}

// The team owner (creator) is the only account allowed to manage memberships
function isTeamOwner(group, username, email) {
  const same = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
  return same(group.creator, username) || (Boolean(email) && same(group.creatorEmail, email));
}

// Identity can arrive in the body, in headers, or in the query string
function readRequester(req) {
  const body = req.body || {};
  const query = req.query || {};
  const pick = (...values) => {
    for (const value of values) {
      const clean = String(value == null ? "" : value).trim();
      if (clean) return clean;
    }
    return "";
  };

  return {
    username: pick(
      body.requester,
      body.requesterUsername,
      body.owner,
      req.get("x-user-name"),
      req.get("x-username"),
      query.requester,
      query.username
    ),
    email: pick(
      body.requesterEmail,
      body.ownerEmail,
      req.get("x-user-email"),
      req.get("x-user-gmail"),
      query.requesterEmail,
      query.email
    ),
  };
}

// Tell the caller who actually owns the team, otherwise the 403 looks like a bug
function ownerOnlyMessage(group, action, requester) {
  const owner = `${group.creator}${group.creatorEmail ? ` <${group.creatorEmail}>` : ""}`;
  const who = requester.username || requester.email || "an unidentified account";
  return `Only the team owner ${owner} can ${action}. You are signed in as ${who}. Sign in as the team owner and try again.`;
}

// Strip the admin-only unique groupId before sending a group to the client
function sanitizeGroup(group) {
  const obj = group.toObject ? group.toObject() : { ...group };
  delete obj.groupId;
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
        obj.members = (obj.members || []).filter((m) => requesterIsCreator || m.status !== "declined");
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

// DELETE /api/groups/:id - Delete a team group while keeping its repositories
router.delete("/:id", optionalAuth, requireAuth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id).catch(() => null);
    if (!group) {
      return res.status(404).json({ message: "Team not found or already deleted." });
    }

    const requester = {
      username: req.authUser.username,
      email: req.authUser.gmail,
    };
    if (!isTeamOwner(group, requester.username, requester.email)) {
      return res.status(403).json({ message: ownerOnlyMessage(group, "delete this team", requester) });
    }

    await Repo.updateMany(
      { $or: [{ group: group._id }, { groupId: group.groupId }, { groupName: group.name }] },
      { $set: { group: null, groupId: "", groupName: "" } }
    );
    await Group.deleteOne({ _id: group._id });

    res.status(200).json({ message: `Group "${group.name}" deleted. Its repositories were kept and detached.` });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ message: "Error deleting group: " + error.message });
  }
});


// POST /api/groups/:id/members - Team owner invites a member, who accepts it from their
// own notifications. Nobody is added to the team until that invitation is accepted.
router.post("/:id/members", async (req, res) => {
  try {
    const { username, email, identifier, role } = req.body;
    const targetInput = (identifier || username || email || "").trim();

    if (!targetInput) {
      return res.status(400).json({ message: "Username or email is required to invite a member." });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: "Team not found." });
    }

    const requester = readRequester(req);
    if (!isTeamOwner(group, requester.username, requester.email)) {
      return res.status(403).json({ message: ownerOnlyMessage(group, "add members to this team", requester) });
    }

    // The invitation is delivered in the recipient's notification centre, so the recipient
    // must already have an account.
    const escapedInput = targetInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const invitee = await User.findOne({
      $or: [
        { username: new RegExp(`^${escapedInput}$`, "i") },
        { gmail: new RegExp(`^${escapedInput}$`, "i") }
      ]
    });

    if (!invitee) {
      return res.status(404).json({
        message: `No registered Gitrepo account matches "${targetInput}". Invitations are delivered in-app, so the person must already have an account.`
      });
    }

    if (
      String(invitee.username).toLowerCase() === String(group.creator).toLowerCase() ||
      (group.creatorEmail && String(invitee.gmail || "").toLowerCase() === String(group.creatorEmail).toLowerCase())
    ) {
      return res.status(409).json({ message: "The team owner is already a member of this team." });
    }

    // Only a real member blocks a new invitation. Rows left pending or declined by the old
    // email flow are reusable: accepting the new invitation upgrades them in place.
    const alreadyMember = (group.members || []).some(
      (m) =>
        m.status === "accepted" &&
        (String(m.username || "").toLowerCase() === String(invitee.username).toLowerCase() ||
          (Boolean(m.email) && String(m.email).toLowerCase() === String(invitee.gmail || "").toLowerCase()))
    );

    if (alreadyMember) {
      return res.status(409).json({ message: `User "${invitee.username}" is already a member of this team.` });
    }

    const openInvitation = await Notification.findOne({
      receiver_id: invitee._id,
      project_id: group._id,
      type: "MEMBER_INVITATION",
      status: "PENDING"
    });
    if (openInvitation) {
      return res.status(409).json({
        message: `"${invitee.username}" already has a pending invitation to this team.`
      });
    }

    // The notification must point back at the owner account, so resolve the owner from the
    // group itself (the requester has already been checked as the owner above).
    const ownerInput = String(group.creator || requester.email || requester.username || "").trim();
    const ownerEscaped = ownerInput.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sender = await User.findOne({
      $or: [{ username: new RegExp(`^${ownerEscaped}$`, "i") }, { gmail: new RegExp(`^${ownerEscaped}$`, "i") }]
    });

    if (!sender) {
      return res.status(409).json({
        message: "The team owner no longer has a Gitrepo account, so invitations cannot be sent."
      });
    }

    const notification = await Notification.create({
      type: "MEMBER_INVITATION",
      sender_id: sender._id,
      receiver_id: invitee._id,
      project_id: group._id,
      sender_name: group.creator || sender.username || "",
      project_name: group.name,
      role: role === "creator" ? "creator" : "editor",
      status: "PENDING",
      message: `${group.creator || "A team owner"} invited you to join the team "${group.name}" on Gitrepo. Accept to join the team, or reject to skip it.`,
      created_at: new Date()
    });

    console.log(`ðŸ”” Invitation created for ${invitee.username} -> team "${group.name}"`);

    res.status(200).json({
      message: `Invitation created for ${invitee.username}. They join the team "${group.name}" by accepting it in their notifications.`,
      notificationId: String(notification._id),
      invitationCreated: true,
      invited: { username: invitee.username, email: invitee.gmail, status: "PENDING" },
      group: sanitizeGroup(group)
    });
  } catch (error) {
    console.error("Error inviting member to group:", error);
    res.status(500).json({ message: "Error inviting member: " + error.message });
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
      return res.status(403).json({ message: ownerOnlyMessage(group, "change member roles", requester) });
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
      return res.status(403).json({ message: ownerOnlyMessage(group, "remove members or cancel verifications", requester) });
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
