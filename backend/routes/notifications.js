const express = require("express");
const Group = require("../models/Group");
const Notification = require("../models/Notification");
const { optionalAuth, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(optionalAuth);

function isPending(notification) {
  return notification && notification.type === "MEMBER_INVITATION" && notification.status === "PENDING";
}

function describeNotification(notification) {
  const obj = notification.toObject ? notification.toObject() : { ...notification };
  obj.project_id = obj.project_id ? String(obj.project_id) : null;
  obj.receiver_id = obj.receiver_id ? String(obj.receiver_id) : null;
  obj.sender_id = obj.sender_id ? String(obj.sender_id) : null;
  return obj;
}

// GET /api/notifications - everything addressed to the signed-in user, newest first
router.get("/", requireAuth, async (req, res) => {
  try {
    const filter = { receiver_id: req.authUser._id };
    const status = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";
    if (status) filter.status = status;

    const notifications = await Notification.find(filter).sort({ created_at: -1 }).limit(200);
    res.status(200).json(notifications.map(describeNotification));
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Error fetching notifications: " + error.message });
  }
});

// Shared body of the accept / reject endpoints.
//
// The decision is recorded with a single conditional update that only matches while the
// invitation is still PENDING. That makes exactly one of several simultaneous clicks win,
// so a double click, a retried request or a stale tab can never apply a decision twice.
async function respondToInvitation(req, res, decision) {
  try {
    const notification = await Notification.findById(req.params.id).catch(() => null);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    if (String(notification.receiver_id) !== String(req.authUser._id)) {
      return res.status(403).json({ message: "This notification was sent to another user." });
    }

    if (notification.type !== "MEMBER_INVITATION") {
      return res.status(400).json({ message: "This notification does not support that action." });
    }

    if (!isPending(notification)) {
      return res.status(409).json({
        message: `This invitation was already ${String(notification.status).toLowerCase()}.`,
        status: notification.status
      });
    }

    const group = await Group.findById(notification.project_id);

    if (decision === "ACCEPTED" && !group) {
      // The team was deleted while the invitation was waiting, so it can never be accepted
      await Notification.updateOne(
        { _id: notification._id, status: "PENDING" },
        { $set: { status: "REJECTED", responded_at: new Date() } }
      );
      return res.status(404).json({
        message: `The team "${notification.project_name || "invitation"}" no longer exists, so the invitation was closed.`,
        status: "REJECTED"
      });
    }

    // Claim the invitation. If this returns null another request decided it first.
    const respondedAt = new Date();
    const claimed = await Notification.findOneAndUpdate(
      { _id: notification._id, receiver_id: req.authUser._id, type: "MEMBER_INVITATION", status: "PENDING" },
      { $set: { status: decision, responded_at: respondedAt } },
      { returnDocument: "after" }
    );
    if (!claimed) {
      const current = await Notification.findById(req.params.id).catch(() => null);
      return res.status(409).json({
        message: `This invitation was already ${String(current ? current.status : "decided").toLowerCase()}.`,
        status: current ? current.status : null
      });
    }

    const username = req.authUser.username || "";
    const email = req.authUser.gmail || "";
    const lower = (value) => String(value || "").trim().toLowerCase();
    const sameUser = (value) => {
      const clean = lower(value);
      if (!clean) return false;
      return clean === lower(username) || (Boolean(email) && clean === lower(email));
    };

    // Invitations created before this feature left pending / declined rows in members.
    // Reuse that row on accept, and drop it on reject, instead of adding the person twice.
    const memberIndex = (group.members || []).findIndex((m) => sameUser(m.username) || sameUser(m.email));
    const member = memberIndex === -1 ? null : group.members[memberIndex];

    if (decision === "ACCEPTED") {
      if (member && member.status !== "accepted") {
        member.status = "accepted";
        if (email) member.email = email;
        member.role = claimed.role === "creator" ? "creator" : member.role || "editor";
        member.invitedBy = member.invitedBy || group.creator;
        member.joinedAt = member.joinedAt || respondedAt;
      } else if (!member) {
        group.members.push({
          username,
          email,
          role: claimed.role === "creator" ? "creator" : "editor",
          status: "accepted",
          invitedBy: group.creator,
          joinedAt: respondedAt
        });
      }
    } else if (member && member.status !== "accepted") {
      group.members.splice(memberIndex, 1);
    }

    if (group.isModified("members")) {
      try {
        await group.save();
      } catch (saveError) {
        // Undo the claim so the invitation can be tried again instead of silently
        // recording an acceptance that never made it onto the team.
        await Notification.updateOne(
          { _id: claimed._id, status: decision, responded_at: respondedAt },
          { $set: { status: "PENDING" }, $unset: { responded_at: 1 } }
        );
        throw saveError;
      }
    }

    console.log(
      `${decision === "ACCEPTED" ? "✅" : "❌"} Invitation ${decision.toLowerCase()}: ` +
      `${req.authUser.username} -> "${group ? group.name : notification.project_name}"`
    );

    res.status(200).json({
      message: decision === "ACCEPTED"
        ? `You joined the team "${notification.project_name}".`
        : `You declined the invitation to "${notification.project_name}".`,
      status: claimed.status,
      project_id: notification.project_id ? String(notification.project_id) : null,
      project_name: notification.project_name || "",
      group: group ? { _id: String(group._id), name: group.name, members: (group.members || []).length } : null
    });
  } catch (error) {
    console.error(`Error recording invitation ${decision}:`, error);
    res.status(500).json({ message: `Error recording the invitation: ${error.message}` });
  }
}

// POST /api/notifications/:id/accept - join the team
router.post("/:id/accept", requireAuth, (req, res) => respondToInvitation(req, res, "ACCEPTED"));

// POST /api/notifications/:id/reject - decline, and stay out of the team
router.post("/:id/reject", requireAuth, (req, res) => respondToInvitation(req, res, "REJECTED"));

module.exports = router;
