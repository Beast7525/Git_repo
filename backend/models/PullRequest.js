const mongoose = require("mongoose");

const prSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    repository: { type: String, required: true },
    createdBy: { type: String, required: true },
    targetBranch: { type: String, default: "main" },
    sourceBranch: { type: String, required: true },
    status: { type: String, enum: ["Pending", "Merged", "Rejected"], default: "Pending" },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    description: { type: String, default: "" },
    reviewNotes: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PullRequest", prSchema);
