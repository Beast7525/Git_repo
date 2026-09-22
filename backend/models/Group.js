const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, default: "", trim: true },
  role: { 
    type: String, 
    enum: ["creator", "editor"], 
    default: "editor" 
  },
  status: {
    type: String,
    enum: ["pending", "accepted"],
    default: "accepted"
  },
  inviteToken: { type: String },
  joinedAt: { type: Date, default: Date.now }
}, { _id: true });

const groupSchema = new mongoose.Schema(
  {
    groupId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ""
    },
    creator: {
      type: String,
      required: true,
      trim: true
    },
    creatorEmail: {
      type: String,
      default: ""
    },
    members: [memberSchema],
    repositories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Repo"
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Group", groupSchema, "groups");
