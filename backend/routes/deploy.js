const express = require("express");
const Deployment = require("../models/Deployment");
const Repo = require("../models/Repo");
const { optionalAuth, requireAuth, isPublicRepo, isRepoOwner, isGroupMember } = require("../middleware/auth");
const { encryptObject } = require("../services/cryptoService");
const { runBackendDeploymentWorker } = require("../workers/backendDeployWorker");
const dockerService = require("../services/dockerService");
const portService = require("../services/portService");
const healthCheckService = require("../services/healthCheckService");
const proxyService = require("../services/proxyService");

const router = express.Router();
router.use(optionalAuth);

// Helper to check view/deploy access for a repository
async function canDeployRepo(repo, user) {
  if (!repo || !user) return false;
  if (isRepoOwner(repo, user)) return true;
  if (isPublicRepo(repo)) return true;

  if (repo.group) {
    const Group = require("../models/Group");
    const groupDoc = await Group.findById(repo.group).catch(() => null);
    if (groupDoc && isGroupMember(groupDoc, user)) return true;
  }
  return false;
}

// Environment Variable Name Sanitizer
function validateEnvVarName(key) {
  if (typeof key !== "string") return false;
  const name = key.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
  // Block dangerous infrastructure keys
  const forbidden = ["DOCKER_HOST", "PATH", "LD_PRELOAD", "NODE_OPTIONS"];
  return !forbidden.includes(name.toUpperCase());
}

// POST /api/deploy/backend - Start a new Backend Docker Deployment
router.post("/backend", requireAuth, async (req, res) => {
  try {
    const { repositoryId, commitId, environmentVariables = {} } = req.body || {};

    if (!repositoryId || !commitId) {
      return res.status(400).json({ success: false, message: "repositoryId and commitId are required." });
    }

    const repo = await Repo.findById(repositoryId);
    if (!repo) {
      return res.status(404).json({ success: false, message: "Repository not found." });
    }

    const allowed = await canDeployRepo(repo, req.authUser);
    if (!allowed) {
      return res.status(403).json({ success: false, message: "You are not authorized to deploy this repository." });
    }

    // Validate environment variable keys
    const sanitizedEnv = {};
    if (typeof environmentVariables === "object" && environmentVariables !== null) {
      for (const [key, val] of Object.entries(environmentVariables)) {
        if (!key || !key.trim()) continue;
        if (!validateEnvVarName(key)) {
          return res.status(400).json({
            success: false,
            message: `Invalid or restricted environment variable name: "${key}". Must contain only letters, numbers, underscores, and cannot override system defaults.`,
          });
        }
        sanitizedEnv[key.trim()] = typeof val === "string" ? val : String(val || "");
      }
    }

    // Encrypt sensitive environment variables for storage
    const encryptedEnv = encryptObject(sanitizedEnv);
    const repoName = repo.name || repo.repositoryName || "my-api";

    const newDeployment = new Deployment({
      repositoryId: repo._id,
      userId: req.authUser._id,
      commitId: String(commitId).trim(),
      type: "backend",
      projectName: repoName,
      status: "queued",
      environmentVariables: encryptedEnv,
      buildLogs: `[${new Date().toLocaleTimeString()}] Deployment request queued...`,
    });

    await newDeployment.save();

    // Trigger background worker asynchronously
    setImmediate(() => {
      runBackendDeploymentWorker(newDeployment._id).catch((err) => {
        console.error("Unhandled error in backend deployment worker:", err);
      });
    });

    res.status(201).json({
      success: true,
      deploymentId: newDeployment._id,
      status: "queued",
      projectName: repoName,
    });
  } catch (error) {
    console.error("Error creating backend deployment:", error);
    res.status(500).json({ success: false, message: "Error starting backend deployment: " + error.message });
  }
});

// GET /api/deploy/:deploymentId - Get current status of a deployment
router.get("/:deploymentId", requireAuth, async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.deploymentId)
      .populate("repositoryId", "name repositoryName owner visibility")
      .lean();

    if (!deployment) {
      return res.status(404).json({ success: false, message: "Deployment not found." });
    }

    // Sanitize response: do NOT leak raw environment variable ciphertext/secrets to frontend
    const sanitizedDeployment = {
      ...deployment,
      id: deployment._id,
      environmentVariablesCount: deployment.environmentVariables?.data ? 1 : 0,
      environmentVariables: undefined, // Stripped for security
    };

    res.status(200).json({
      success: true,
      deployment: sanitizedDeployment,
    });
  } catch (error) {
    console.error("Error fetching deployment status:", error);
    res.status(500).json({ success: false, message: "Error fetching deployment: " + error.message });
  }
});

// GET /api/deploy/:deploymentId/logs - Get deployment build and runtime container logs
router.get("/:deploymentId/logs", requireAuth, async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.deploymentId);
    if (!deployment) {
      return res.status(404).json({ success: false, message: "Deployment not found." });
    }

    const buildLogsArray = (deployment.buildLogs || "")
      .split("\n")
      .filter(Boolean);

    let runtimeLogsArray = [];
    if (deployment.containerName) {
      runtimeLogsArray = await dockerService.getContainerLogs(deployment.containerName);
    }

    res.status(200).json({
      success: true,
      status: deployment.status,
      logs: [...buildLogsArray, ...runtimeLogsArray],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching deployment logs: " + error.message });
  }
});

// POST /api/deploy/:deploymentId/stop - Stop a live or running deployment container
router.post("/:deploymentId/stop", requireAuth, async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.deploymentId);
    if (!deployment) {
      return res.status(404).json({ success: false, message: "Deployment not found." });
    }

    if (deployment.containerName) {
      await dockerService.stopContainer(deployment.containerName);
    }

    if (deployment.hostPort) {
      portService.releasePort(deployment.hostPort);
    }

    if (deployment.deploymentUrl) {
      const subdomain = deployment.deploymentUrl.replace(/^https?:\/\//, "");
      proxyService.unregisterProxyRoute(subdomain);
      proxyService.unregisterProxyRoute(deployment.projectName);
    }

    deployment.status = "stopped";
    await deployment.save();

    res.status(200).json({
      success: true,
      status: "stopped",
      message: "Deployment container stopped successfully.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error stopping deployment: " + error.message });
  }
});

// POST /api/deploy/:deploymentId/restart - Restart a stopped deployment container
router.post("/:deploymentId/restart", requireAuth, async (req, res) => {
  try {
    const deployment = await Deployment.findById(req.params.deploymentId);
    if (!deployment) {
      return res.status(404).json({ success: false, message: "Deployment not found." });
    }

    if (deployment.status === "live") {
      return res.status(200).json({ success: true, status: "live", message: "Deployment is already live." });
    }

    deployment.status = "starting";
    await deployment.save();

    let restarted = false;
    if (deployment.containerName) {
      restarted = await dockerService.restartContainer(deployment.containerName).catch(() => false);
    }

    if (!restarted) {
      // Re-trigger build & deploy worker from stored commit if container no longer exists
      setImmediate(() => {
        runBackendDeploymentWorker(deployment._id).catch(() => {});
      });
      return res.status(200).json({
        success: true,
        status: "starting",
        message: "Container recreate process initiated.",
      });
    }

    if (deployment.hostPort) {
      const isHealthy = await healthCheckService.waitForHealth({
        hostPort: deployment.hostPort,
        path: "/health",
        maxAttempts: 10,
        delayMs: 1500,
        appendLog: () => {},
      });

      if (isHealthy && deployment.deploymentUrl) {
        const subdomain = deployment.deploymentUrl.replace(/^https?:\/\//, "");
        proxyService.registerProxyRoute(subdomain, deployment.hostPort, deployment._id);
        proxyService.registerProxyRoute(deployment.projectName, deployment.hostPort, deployment._id);
      }
    }

    deployment.status = "live";
    await deployment.save();

    res.status(200).json({
      success: true,
      status: "live",
      message: "Deployment container restarted and live.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error restarting deployment: " + error.message });
  }
});

// POST /api/deploy/:deploymentId/redeploy - Redeploy same commit
router.post("/:deploymentId/redeploy", requireAuth, async (req, res) => {
  try {
    const oldDeployment = await Deployment.findById(req.params.deploymentId);
    if (!oldDeployment) {
      return res.status(404).json({ success: false, message: "Deployment not found." });
    }

    const newDeployment = new Deployment({
      repositoryId: oldDeployment.repositoryId,
      userId: req.authUser._id,
      commitId: oldDeployment.commitId,
      type: "backend",
      projectName: oldDeployment.projectName,
      status: "queued",
      environmentVariables: oldDeployment.environmentVariables,
      buildLogs: `[${new Date().toLocaleTimeString()}] Redeployment request queued...`,
    });

    await newDeployment.save();

    setImmediate(() => {
      runBackendDeploymentWorker(newDeployment._id).catch((err) => {
        console.error("Unhandled error in backend redeployment worker:", err);
      });
    });

    res.status(201).json({
      success: true,
      deploymentId: newDeployment._id,
      status: "queued",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error triggering redeployment: " + error.message });
  }
});

// GET /api/deploy/repo/:repositoryId - Fetch deployment history for a repository
router.get("/repo/:repositoryId", requireAuth, async (req, res) => {
  try {
    const deployments = await Deployment.find({ repositoryId: req.params.repositoryId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const sanitizedDeployments = (deployments || []).map((d) => ({
      ...d,
      id: d._id,
      environmentVariables: undefined, // Omit sensitive secrets
    }));

    res.status(200).json({
      success: true,
      deployments: sanitizedDeployments,
    });
  } catch (error) {
    console.error("Error fetching repository deployments:", error);
    res.status(500).json({ success: false, message: "Error fetching deployment history: " + error.message });
  }
});

module.exports = router;
