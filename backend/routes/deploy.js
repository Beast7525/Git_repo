const express = require("express");
const Deployment = require("../models/Deployment");
const Repo = require("../models/Repo");
const { optionalAuth, requireAuth, isPublicRepo, isRepoOwner, isGroupMember } = require("../middleware/auth");
const { runDeploymentProcess } = require("../services/deployService");

const router = express.Router();
router.use(optionalAuth);

// Helper to check view/deploy access for a repository
async function canDeployRepo(repo, user) {
  if (!repo || !user) return false;
  if (isRepoOwner(repo, user)) return true;
  if (isPublicRepo(repo)) return true;

  // Group membership check for team repositories
  if (repo.group) {
    const Group = require("../models/Group");
    const groupDoc = await Group.findById(repo.group).catch(() => null);
    if (groupDoc && isGroupMember(groupDoc, user)) return true;
  }
  return false;
}

// POST /api/deploy - Start a new deployment
router.post("/", requireAuth, async (req, res) => {
  try {
    const { repositoryId, commitId } = req.body || {};

    if (!repositoryId || !commitId) {
      return res.status(400).json({ message: "repositoryId and commitId are required." });
    }

    const repo = await Repo.findById(repositoryId);
    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    // Access control check: user cannot deploy another user's private repository
    const allowed = await canDeployRepo(repo, req.authUser);
    if (!allowed) {
      return res.status(403).json({ message: "You are not authorized to deploy this repository." });
    }

    // Check if user has configured their Netlify Access Token
    const User = require("../models/User");
    const currentUser = await User.findById(req.authUser._id).select("netlifyToken");
    if (!currentUser?.netlifyToken || !currentUser.netlifyToken.trim()) {
      return res.status(400).json({
        message: "Please add your Netlify Personal Access Token in your Profile Settings before deploying.",
        needsNetlifyToken: true,
      });
    }

    const newDeployment = new Deployment({
      repositoryId: repo._id,
      userId: req.authUser._id,
      commitId: String(commitId).trim(),
      status: "pending",
      provider: "netlify",
      buildLogs: ["Deployment request queued..."],
    });

    await newDeployment.save();

    // Trigger background build & deploy worker asynchronously
    setImmediate(() => {
      runDeploymentProcess(newDeployment._id).catch((err) => {
        console.error("Unhandled error in deployment worker:", err);
      });
    });

    res.status(201).json({
      success: true,
      deploymentId: newDeployment._id,
      status: "pending",
    });
  } catch (error) {
    console.error("Error creating deployment:", error);
    res.status(500).json({ message: "Error starting deployment: " + error.message });
  }
});

// GET /api/deploy/:deploymentId - Get current status of a deployment
router.get("/:deploymentId", requireAuth, async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.deploymentId)
      .populate("repositoryId", "name repositoryName owner visibility")
      .lean();

    if (!deployment) {
      return res.status(404).json({ message: "Deployment not found." });
    }

    res.status(200).json({
      success: true,
      deployment,
    });
  } catch (error) {
    console.error("Error fetching deployment status:", error);
    res.status(500).json({ message: "Error fetching deployment: " + error.message });
  }
});

// GET /api/deploy/repo/:repositoryId - Fetch deployment history for a repository
router.get("/repo/:repositoryId", requireAuth, async (req, res) => {
  try {
    const deployments = await Deployment.find({ repositoryId: req.params.repositoryId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      deployments: deployments || [],
    });
  } catch (error) {
    console.error("Error fetching repository deployments:", error);
    res.status(500).json({ message: "Error fetching deployment history: " + error.message });
  }
});

module.exports = router;
