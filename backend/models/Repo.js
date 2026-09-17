const mongoose = require("mongoose");

const repoSchema = new mongoose.Schema(
  {
    repositoryName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
      lowercase: true
    },
    name: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      lowercase: true
    },
    description: { type: String, default: "" },
    visibility: { type: String, default: "public" },
    ignoreGitignore: { type: Boolean, default: false }, // Option to ignore .gitignore
    owner: { type: String, default: "Admin" },
    ownerEmail: { type: String, default: "" },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
    groupId: { type: String, default: "" },
    groupName: { type: String, default: "" },
    status: { type: String, default: "Active" },
    contributors: { type: Number, default: 1 },
    commits: { type: Number, default: 0 },
    defaultBranch: { type: String, default: "main" },
    remoteUrl: { type: String, default: "" },
    storagePath: { type: String, default: "" },
    files: [
      {
        path: String,
        size: Number,
        contentType: String,
        b2FileName: String,
        b2Url: String,
        content: String
      }
    ],
    lastCommit: {
      hash: String,
      message: String,
      branch: String,
      committedAt: Date
    },
    pushStatus: {
      type: String,
      enum: ["pending", "not_configured", "pushed", "failed"],
      default: "pending"
    },
    pushMessage: { type: String, default: "" },
    stars: { type: Number, default: 0 },
    forks: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Map model to the explicit database collection named 'repositories'
module.exports = mongoose.model("Repo", repoSchema, "repositories");
