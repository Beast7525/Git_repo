const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const Deployment = require("../models/Deployment");
const Repo = require("../models/Repo");
const { downloadCommitFiles } = require("../services/deployService");
const { decryptObject } = require("../services/cryptoService");
const dockerService = require("../services/dockerService");
const portService = require("../services/portService");
const healthCheckService = require("../services/healthCheckService");
const proxyService = require("../services/proxyService");

async function runBackendDeploymentWorker(deploymentId) {
  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) return;

  const logs = [];
  const appendLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${message}`;
    logs.push(entry);
    console.log(`[DeployWorker ${deploymentId}] ${entry}`);
    Deployment.findByIdAndUpdate(deploymentId, {
      $set: { buildLogs: logs.join("\n") },
    }).catch(() => {});
  };

  const tempDir = path.join(os.tmpdir(), "gitrepo-deploy", String(deploymentId));
  let allocatedHostPort = null;
  let containerName = "";

  let isMockDeployment = false;

  try {
    const repo = await Repo.findById(deployment.repositoryId);
    if (!repo) throw new Error("Repository not found.");

    // Step 1: Downloading commit snapshot from B2 / Storage
    deployment.status = "downloading";
    await deployment.save();
    appendLog(`Initializing backend deployment for commit ${deployment.commitId}...`);
    appendLog("Downloading commit files from Backblaze B2 storage...");
    await downloadCommitFiles(repo, deployment.commitId, tempDir);
    appendLog("Repository files downloaded successfully to temporary build context.");

    // Step 2: Validate Node.js Project Structure
    const packageJsonPath = path.join(tempDir, "package.json");
    if (!fsSync.existsSync(packageJsonPath)) {
      throw new Error("Deployment Failed: package.json was not found in the repository root.");
    }

    let packageJson = {};
    try {
      const rawPkg = await fs.readFile(packageJsonPath, "utf-8");
      packageJson = JSON.parse(rawPkg);
    } catch (err) {
      throw new Error("Deployment Failed: package.json is invalid JSON. " + err.message);
    }

    const scripts = packageJson.scripts || {};
    if (!scripts.start) {
      throw new Error(
        'Deployment Failed: No start script found in package.json. Please add a "start" script, e.g.: "scripts": { "start": "node server.js" }'
      );
    }

    appendLog(`Project validated. Start command: "${scripts.start}".`);
    deployment.startCommand = scripts.start;

    // Generate Dockerfile if not present
    const dockerfilePath = path.join(tempDir, "Dockerfile");
    if (!fsSync.existsSync(dockerfilePath)) {
      appendLog("No Dockerfile found in repository. Generating default Node.js 22-alpine Dockerfile...");
      const defaultDockerfile = `FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
`;
      await fs.writeFile(dockerfilePath, defaultDockerfile);
    }

    // Step 3: Building Docker Image
    deployment.status = "building";
    await deployment.save();
    const imageTag = `gitrepo-backend-${String(deploymentId).toLowerCase()}`;
    await dockerService.buildImage(imageTag, tempDir, appendLog);

    // Step 4: Starting Docker Container with Dynamic Port Allocation & Security Controls
    deployment.status = "starting";
    await deployment.save();
    
    allocatedHostPort = await portService.allocatePort();
    containerName = `gitrepo_backend_cnt_${String(deploymentId)}`;
    const internalPort = parseInt(process.env.DEPLOY_DEFAULT_CONTAINER_PORT || "3000", 10);

    const decryptedEnvVars = decryptObject(deployment.environmentVariables);

    const { containerId, mock } = await dockerService.createAndStartContainer({
      containerName,
      imageTag,
      hostPort: allocatedHostPort,
      containerPort: internalPort,
      envVars: decryptedEnvVars,
      tempDir,
      startCommand: scripts.start || "npm start",
      appendLog,
    });

    isMockDeployment = Boolean(mock);

    deployment.containerId = containerId;
    deployment.containerName = containerName;
    deployment.internalPort = internalPort;
    deployment.hostPort = allocatedHostPort;
    await deployment.save();

    // Step 5: Health Check Verification
    if (!mock) {
      const isHealthy = await healthCheckService.waitForHealth({
        hostPort: allocatedHostPort,
        path: "/health",
        maxAttempts: 15,
        delayMs: 2000,
        appendLog,
      });

      if (!isHealthy) {
        throw new Error("Health check failed: Application container did not become healthy within the timeout period.");
      }
    } else {
      appendLog("Health check bypassed for process container mock.");
    }

    // Step 6: Configure Public Deployment URL & Reverse Proxy
    const repoName = repo.name || repo.repositoryName || "my-api";
    const serverIp = process.env.DEPLOY_SERVER_PUBLIC_IP || "localhost";
    const deploymentUrl = process.env.DEPLOYMENT_BASE_URL
      ? `${process.env.DEPLOYMENT_BASE_URL.replace(/\/+$/, "")}/${repoName}`
      : `http://${serverIp}:${allocatedHostPort}`;

    proxyService.registerProxyRoute(repoName, allocatedHostPort, deploymentId);

    // Step 7: Mark Deployment Live
    deployment.status = "live";
    deployment.deploymentUrl = deploymentUrl;
    deployment.projectName = repoName;
    deployment.completedAt = new Date();
    await deployment.save();
    appendLog(`Deployment Successful ✓. Live URL: ${deploymentUrl}`);

  } catch (error) {
    console.error(`Backend deployment ${deploymentId} failed:`, error);
    appendLog("ERROR: " + error.message);

    if (allocatedHostPort) {
      portService.releasePort(allocatedHostPort);
    }
    if (containerName) {
      dockerService.removeContainer(containerName).catch(() => {});
    }

    deployment.status = "failed";
    deployment.errorMessage = error.message;
    deployment.errorLogs = error.message;
    deployment.completedAt = new Date();
    await deployment.save();
  } finally {
    if (!isMockDeployment) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

module.exports = {
  runBackendDeploymentWorker,
};
