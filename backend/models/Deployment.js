const mongoose = require("mongoose");

const deploymentSchema = new mongoose.Schema(
  {
    repositoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Repo",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    commitId: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      default: "netlify",
    },
    siteId: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "downloading", "installing", "building", "deploying", "success", "failed"],
      default: "pending",
      index: true,
    },
    buildCommand: {
      type: String,
      default: "",
    },
    outputDirectory: {
      type: String,
      default: "",
    },
    deploymentUrl: {
      type: String,
      default: "",
    },
    buildLogs: {
      type: [String],
      default: [],
    },
    errorMessage: {
      type: String,
      default: "",
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Deployment", deploymentSchema, "deployments");
