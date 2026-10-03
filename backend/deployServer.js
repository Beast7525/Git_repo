const express = require("express");
const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const net = require("net");

const app = express();
app.use(express.json({ limit: "50mb" }));

const PORT = parseInt(process.env.DEPLOY_SERVER_PORT || "5001", 10);
const SERVER_TOKEN = process.env.DEPLOY_SERVER_TOKEN || "gitrepo_secure_deploy_token_2026";
const PUBLIC_IP = process.env.DEPLOY_SERVER_PUBLIC_IP || "localhost";
const MEMORY_LIMIT = process.env.DEPLOY_CONTAINER_MEMORY || "512m";
const CPU_LIMIT = process.env.DEPLOY_CONTAINER_CPUS || "1";
const PIDS_LIMIT = process.env.DEPLOY_CONTAINER_PIDS || "100";
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || "bridge";

// Bearer Token Authentication Middleware
function authenticateDeployServer(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== SERVER_TOKEN) {
    return res.status(401).json({ success: false, message: "Unauthorized: Invalid DEPLOY_SERVER_TOKEN" });
  }
  next();
}

app.use(authenticateDeployServer);

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

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

async function findAvailablePort(startPort = 30001, endPort = 32000) {
  for (let p = startPort; p <= endPort; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error("No free deployment ports available on host server.");
}

// POST /deploy - Deploy a backend project inside Docker container
app.post("/deploy", async (req, res) => {
  const { deploymentId, files, environmentVariables = {}, commitId } = req.body || {};
  if (!deploymentId || !Array.isArray(files)) {
    return res.status(400).json({ success: false, message: "deploymentId and files array are required." });
  }

  const buildDir = path.join(os.tmpdir(), "gitrepo-deploy-agent", String(deploymentId));
  const containerName = `gitrepo_cnt_${String(deploymentId)}`;
  const imageTag = `gitrepo-img-${String(deploymentId).toLowerCase()}`;

  try {
    await fs.mkdir(buildDir, { recursive: true });

    for (const f of files) {
      const relPath = path.normalize(f.path || f.name).replace(/^(\.\.[\/\\])+/, "");
      const fullPath = path.join(buildDir, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      const content = Buffer.isBuffer(f.content)
        ? f.content
        : Buffer.from(f.content || "", f.isBase64 ? "base64" : "utf-8");
      await fs.writeFile(fullPath, content);
    }

    // Check package.json & start script
    const packageJsonPath = path.join(buildDir, "package.json");
    if (!(await fs.stat(packageJsonPath).catch(() => null))) {
      throw new Error("package.json not found in deployment package.");
    }
    const pkgRaw = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(pkgRaw);
    if (!pkg.scripts || !pkg.scripts.start) {
      throw new Error("No 'start' script found in package.json.");
    }

    // Generate Dockerfile if missing
    const dockerfilePath = path.join(buildDir, "Dockerfile");
    if (!(await fs.stat(dockerfilePath).catch(() => null))) {
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

    // Build Docker image
    await execFilePromise("docker", ["build", "-t", imageTag, "."], {
      cwd: buildDir,
      timeout: 300000
    });

    // Remove existing container with same name if any
    try { await execFilePromise("docker", ["rm", "-f", containerName]); } catch (_) {}

    const hostPort = await findAvailablePort();
    const dockerArgs = [
      "run", "-d",
      "--name", containerName,
      "-p", `${hostPort}:3000`,
      "--memory", MEMORY_LIMIT,
      "--cpus", CPU_LIMIT,
      "--pids-limit", PIDS_LIMIT,
      "--network", DOCKER_NETWORK,
      "-e", "PORT=3000"
    ];

    for (const [k, v] of Object.entries(environmentVariables)) {
      if (k && typeof v === "string") {
        dockerArgs.push("-e", `${k}=${v}`);
      }
    }
    dockerArgs.push(imageTag);

    const runRes = await execFilePromise("docker", dockerArgs, { timeout: 60000 });
    const containerId = runRes.stdout.trim();

    const deploymentUrl = `http://${PUBLIC_IP}:${hostPort}`;

    res.status(200).json({
      success: true,
      containerId,
      containerName,
      hostPort,
      deploymentUrl,
      status: "live"
    });
  } catch (err) {
    const errorMsg = err.stderr || err.stdout || err.message || "Deployment execution failed";
    res.status(500).json({ success: false, message: errorMsg });
  } finally {
    try { await fs.rm(buildDir, { recursive: true, force: true }); } catch (_) {}
  }
});

// POST /container/:id/stop
app.post("/container/:id/stop", async (req, res) => {
  try {
    await execFilePromise("docker", ["stop", req.params.id]);
    res.status(200).json({ success: true, status: "stopped" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.stderr || err.message });
  }
});

// POST /container/:id/restart
app.post("/container/:id/restart", async (req, res) => {
  try {
    await execFilePromise("docker", ["restart", req.params.id]);
    res.status(200).json({ success: true, status: "live" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.stderr || err.message });
  }
});

// GET /container/:id/logs
app.get("/container/:id/logs", async (req, res) => {
  try {
    const logRes = await execFilePromise("docker", ["logs", "--tail", "200", req.params.id]);
    const output = (logRes.stdout || "") + "\n" + (logRes.stderr || "");
    res.status(200).json({ success: true, logs: output.split("\n").filter(Boolean) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.stderr || err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 GitRepo Docker Deployment Agent listening on port ${PORT}`);
  console.log(`   Public IP: ${PUBLIC_IP}`);
  console.log(`   Auth Token: ${SERVER_TOKEN.substring(0, 8)}...`);
});
