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
      index: true,
    },
    commitId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["backend"],
      default: "backend",
    },
    projectName: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: [
        "queued",
        "pending",
        "downloading",
        "installing",
        "building",
        "starting",
        "deploying",
        "live",
        "success",
        "failed",
        "stopped",
      ],
      default: "queued",
      index: true,
    },
    containerId: {
      type: String,
      default: "",
    },
    containerName: {
      type: String,
      default: "",
    },
    internalPort: {
      type: Number,
      default: 3000,
    },
    hostPort: {
      type: Number,
      default: 0,
    },
    deploymentUrl: {
      type: String,
      default: "",
    },
    buildCommand: {
      type: String,
      default: "",
    },
    startCommand: {
      type: String,
      default: "",
    },
    environmentVariables: {
      type: Object,
      default: {},
    },
    buildLogs: {
      type: String,
      default: "",
    },
    runtimeLogs: {
      type: String,
      default: "",
    },
    errorLogs: {
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
