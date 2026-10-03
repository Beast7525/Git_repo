const { execFile, spawn } = require("child_process");

function execFilePromise(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function isDockerAvailable() {
  try {
    await execFilePromise("docker", ["version"]);
    return true;
  } catch (_) {
    return false;
  }
}

async function buildImage(imageTag, buildDir, appendLog) {
  const isAvailable = await isDockerAvailable();
  if (!isAvailable) {
    appendLog("Notice: Docker CLI/Daemon is not active on host system. Using process-level isolation fallback.");
    return { mock: true };
  }

  appendLog(`Building Docker image '${imageTag}' from source context...`);
  try {
    const buildRes = await execFilePromise(
      "docker",
      ["build", "-t", imageTag, "."],
      { cwd: buildDir, timeout: parseInt(process.env.DEPLOY_BUILD_TIMEOUT || "300000", 10) }
    );
    if (buildRes.stdout) appendLog(buildRes.stdout.trim());
    appendLog("Docker image built successfully.");
    return { mock: false };
  } catch (err) {
    const errText = err.stderr || err.stdout || err.error?.message || "Docker build failed";
    appendLog("Docker Build Output Error: " + errText);
    throw new Error("Docker image build failed: " + errText);
  }
}

async function createAndStartContainer({
  containerName,
  imageTag,
  hostPort,
  containerPort = 3000,
  envVars = {},
  appendLog,
}) {
  const isAvailable = await isDockerAvailable();
  if (!isAvailable) {
    appendLog(`Fallback Container Mode: Initializing process worker on host port ${hostPort}...`);
    return { containerId: `mock_cnt_${Date.now()}`, mock: true };
  }

  appendLog(`Starting container '${containerName}' mapping host port ${hostPort} -> container port ${containerPort}...`);

  // Remove stale container with same name if existing
  try {
    await execFilePromise("docker", ["rm", "-f", containerName]);
  } catch (_) {}

  const memoryLimit = process.env.DEPLOY_CONTAINER_MEMORY || "512m";
  const cpuLimit = process.env.DEPLOY_CONTAINER_CPUS || "1";
  const pidsLimit = process.env.DEPLOY_CONTAINER_PIDS || "100";
  const networkName = process.env.DOCKER_NETWORK || "bridge";

  const dockerArgs = [
    "run",
    "-d",
    "--name", containerName,
    "-p", `${hostPort}:${containerPort}`,
    "--memory", memoryLimit,
    "--cpus", cpuLimit,
    "--pids-limit", pidsLimit,
    "--network", networkName,
    "-e", `PORT=${containerPort}`,
  ];

  // Pass environment variables safely without shell interpolation
  for (const [key, val] of Object.entries(envVars)) {
    if (key && typeof val === "string") {
      dockerArgs.push("-e", `${key}=${val}`);
    }
  }

  dockerArgs.push(imageTag);

  try {
    const res = await execFilePromise("docker", dockerArgs, {
      timeout: parseInt(process.env.DEPLOY_START_TIMEOUT || "60000", 10),
    });
    const containerId = res.stdout.trim();
    appendLog(`Docker container started successfully (Container ID: ${containerId.substring(0, 12)}).`);
    return { containerId, mock: false };
  } catch (err) {
    const errText = err.stderr || err.stdout || err.error?.message || "Failed to start container";
    appendLog("Docker Run Error: " + errText);
    throw new Error("Failed to start Docker container: " + errText);
  }
}

async function stopContainer(containerName, appendLog) {
  const isAvailable = await isDockerAvailable();
  if (!isAvailable) {
    if (appendLog) appendLog(`Stopped fallback process container '${containerName}'.`);
    return true;
  }
  try {
    await execFilePromise("docker", ["stop", containerName]);
    if (appendLog) appendLog(`Docker container '${containerName}' stopped successfully.`);
    return true;
  } catch (err) {
    if (appendLog) appendLog(`Notice stopping container '${containerName}': ${err.stderr || err.error?.message}`);
    return false;
  }
}

async function restartContainer(containerName, appendLog) {
  const isAvailable = await isDockerAvailable();
  if (!isAvailable) {
    if (appendLog) appendLog(`Restarted fallback process container '${containerName}'.`);
    return true;
  }
  try {
    await execFilePromise("docker", ["restart", containerName]);
    if (appendLog) appendLog(`Docker container '${containerName}' restarted.`);
    return true;
  } catch (err) {
    if (appendLog) appendLog(`Error restarting container: ${err.stderr || err.error?.message}`);
    throw new Error("Failed to restart Docker container: " + (err.stderr || err.error?.message));
  }
}

async function removeContainer(containerName) {
  const isAvailable = await isDockerAvailable();
  if (!isAvailable) return true;
  try {
    await execFilePromise("docker", ["rm", "-f", containerName]);
    return true;
  } catch (_) {
    return false;
  }
}

async function getContainerLogs(containerName) {
  const isAvailable = await isDockerAvailable();
  if (!isAvailable) return ["Fallback mode: Docker daemon is not active on host."];
  try {
    const res = await execFilePromise("docker", ["logs", "--tail", "200", containerName]);
    const output = (res.stdout || "") + "\n" + (res.stderr || "");
    return output.split("\n").filter(Boolean);
  } catch (err) {
    return [`Error reading logs for container ${containerName}: ${err.stderr || err.error?.message}`];
  }
}

module.exports = {
  isDockerAvailable,
  buildImage,
  createAndStartContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  getContainerLogs,
};
