const mongoose = require("mongoose");

// One collection backs every kind of in-app message. Right now MEMBER_INVITATION is the only
// type, but new notification kinds (mentions, review requests) belong here too rather than in
// a separate model per feature.
const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["MEMBER_INVITATION"],
      default: "MEMBER_INVITATION"
    },
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    // Snapshots so the Notifications page can render a row without extra lookups
    sender_name: { type: String, default: "", trim: true },
    project_name: { type: String, default: "", trim: true },
    role: { type: String, enum: ["creator", "editor"], default: "editor" },
    status: { type: String, enum: ["PENDING", "ACCEPTED", "REJECTED"], default: "PENDING" },
    message: { type: String, default: "" },
    created_at: { type: Date, default: Date.now },
    responded_at: { type: Date, default: null }
  }
);

notificationSchema.index({ receiver_id: 1, created_at: -1 });
notificationSchema.index({ receiver_id: 1, project_id: 1, status: 1 });

module.exports = mongoose.model("Notification", notificationSchema, "notifications");
