const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const archiver = require("archiver");
const Deployment = require("../models/Deployment");
const Repo = require("../models/Repo");
const User = require("../models/User");
const { b2, authorizeB2 } = require("../backblaze");

function execPromise(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// Zip directory content into a Buffer
function zipDirectoryToBuffer(sourceDir) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const buffers = [];

    archive.on("data", (data) => buffers.push(data));
    archive.on("end", () => resolve(Buffer.concat(buffers)));
    archive.on("error", (err) => reject(err));

    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// Fetch file text or binary buffer from Repo file object
async function fetchFileContent(repo, fileObj) {
  if (!fileObj) return null;
  if (typeof fileObj.content === "string" && fileObj.content.length > 0) {
    return fileObj.content;
  }

  if (repo.storagePath && fileObj.path) {
    try {
      const safePath = path.normalize(fileObj.path).replace(/^(\.\.[\/\\])+/, "");
      const fullPath = path.resolve(repo.storagePath, safePath);
      if (fullPath.startsWith(path.resolve(repo.storagePath))) {
        return await fs.readFile(fullPath);
      }
    } catch (_) {}
  }

  if (fileObj.b2Url) {
    try {
      const resp = await fetch(fileObj.b2Url);
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch (_) {}
  }

  if (fileObj.b2FileName) {
    try {
      await authorizeB2();
      const bucketName = process.env.B2_BUCKET_NAME || "GitRepo";
      const resp = await b2.downloadFileByName({ bucketName, fileName: fileObj.b2FileName, responseType: "arraybuffer" });
      if (resp && resp.data) {
        return Buffer.from(resp.data);
      }
    } catch (_) {}
  }

  return "";
}

// Download snapshot files for a specific commit into targetDir
async function downloadCommitFiles(repo, commitId, targetDir) {
  let filesToDownload = [];

  if (Array.isArray(repo.commitHistory) && repo.commitHistory.length > 0) {
    const matchedCommit = repo.commitHistory.find((c) => c.hash === commitId);
    if (matchedCommit && Array.isArray(matchedCommit.snapshotFiles) && matchedCommit.snapshotFiles.length > 0) {
      filesToDownload = matchedCommit.snapshotFiles;
    }
  }

  if (filesToDownload.length === 0) {
    filesToDownload = repo.files || [];
  }

  if (filesToDownload.length === 0) {
    throw new Error("No files found in repository for commit " + commitId);
  }

  for (const fileObj of filesToDownload) {
    const rawPath = fileObj.path || "";
    if (!rawPath) continue;

    const safeRelPath = path.normalize(rawPath).replace(/^(\.\.[\/\\])+/, "");
    const fullFilePath = path.join(targetDir, safeRelPath);

    await fs.mkdir(path.dirname(fullFilePath), { recursive: true });
    const content = await fetchFileContent(repo, fileObj);
    await fs.writeFile(fullFilePath, content || "");
  }
}

// Detect project type, install dependencies, and run build
async function detectAndBuildProject(targetDir, appendLog) {
  const packageJsonPath = path.join(targetDir, "package.json");
  const hasPackageJson = fsSync.existsSync(packageJsonPath);

  if (!hasPackageJson) {
    const indexHtmlPath = path.join(targetDir, "index.html");
    if (fsSync.existsSync(indexHtmlPath)) {
      appendLog("Detected Static HTML project (index.html found).");
      return { buildCommand: "static", outputDirectory: "." };
    }
    throw new Error("Invalid project structure: No package.json or index.html found.");
  }

  let packageJson = {};
  try {
    const raw = await fs.readFile(packageJsonPath, "utf-8");
    packageJson = JSON.parse(raw);
  } catch (err) {
    throw new Error("Invalid package.json file: " + err.message);
  }

  const scripts = packageJson.scripts || {};
  const hasBuildScript = typeof scripts.build === "string";

  if (!hasBuildScript) {
    if (fsSync.existsSync(path.join(targetDir, "index.html"))) {
      appendLog("No 'build' script found in package.json. Deploying static root directory.");
      return { buildCommand: "static", outputDirectory: "." };
    }
    throw new Error("package.json does not contain a 'build' script and no index.html was found.");
  }

  const buildCommand = "npm run build";
  appendLog("Installing project dependencies (npm install)...");

  try {
    const installRes = await execPromise("npm install --no-audit --no-fund", {
      cwd: targetDir,
      timeout: 180000,
      env: { ...process.env, PATH: process.env.PATH }
    });
    if (installRes.stdout) appendLog(installRes.stdout.trim());
  } catch (err) {
    const logMsg = (err.stderr || err.stdout || err.error?.message || "npm install failed");
    appendLog("npm install notice: " + logMsg);
  }

  appendLog(`Running build command: ${buildCommand}...`);

  try {
    const buildRes = await execPromise(buildCommand, {
      cwd: targetDir,
      timeout: 180000,
      env: { ...process.env, PATH: process.env.PATH }
    });
    if (buildRes.stdout) appendLog(buildRes.stdout.trim());
  } catch (err) {
    const errOutput = (err.stderr || err.stdout || err.error?.message || "npm run build failed");
    appendLog("Build error output: " + errOutput);
    throw new Error("Project build failed: " + errOutput);
  }

  // Detect output directory
  const candidateDirs = ["dist", "build", "public", "out"];
  let detectedOutDir = "";
  for (const dir of candidateDirs) {
    if (fsSync.existsSync(path.join(targetDir, dir))) {
      detectedOutDir = dir;
      break;
    }
  }

  if (!detectedOutDir) {
    if (fsSync.existsSync(path.join(targetDir, "index.html"))) {
      detectedOutDir = ".";
    } else {
      throw new Error("Build succeeded but output directory (dist or build) was not generated.");
    }
  }

  appendLog(`Detected output directory: ${detectedOutDir}`);
  return { buildCommand, outputDirectory: detectedOutDir };
}

// Deploy output directory to Netlify using user's Netlify REST API Personal Access Token
async function deployToNetlify(sourceDir, siteId, userToken, appendLog) {
  const token = typeof userToken === "string" ? userToken.trim() : "";
  if (!token) {
    throw new Error("Netlify Access Token missing. Please save your Netlify Access Token in Profile settings before deploying.");
  }

  let targetSiteId = siteId;

  // Create Netlify site if siteId does not exist yet
  if (!targetSiteId) {
    appendLog("Creating new site on Netlify account...");
    const siteName = `gitrepo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    const createResp = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: siteName }),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      throw new Error("Failed to create Netlify site on user account: " + errText);
    }

    const siteData = await createResp.json();
    targetSiteId = siteData.id || siteData.site_id;
    appendLog(`Netlify site created successfully (ID: ${targetSiteId}).`);
  }

  appendLog("Compressing build artifacts...");
  const zipBuffer = await zipDirectoryToBuffer(sourceDir);

  appendLog("Uploading deployment package to Netlify...");
  const deployResp = await fetch(`https://api.netlify.com/api/v1/sites/${targetSiteId}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/zip",
    },
    body: zipBuffer,
  });

  if (!deployResp.ok) {
    const errText = await deployResp.text();
    throw new Error("Netlify deployment upload failed: " + errText);
  }

  const deployData = await deployResp.json();
  const liveUrl = deployData.ssl_url || deployData.url || deployData.deploy_url || `https://${deployData.name}.netlify.app`;

  appendLog(`Website deployed successfully! Live URL: ${liveUrl}`);
  return { siteId: targetSiteId, deploymentUrl: liveUrl };
}

// Main background worker loop
async function runDeploymentProcess(deploymentId) {
  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) return;

  const logs = [];
  const appendLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${message}`;
    logs.push(entry);
    console.log(`[Deploy ${deploymentId}] ${entry}`);
    Deployment.findByIdAndUpdate(deploymentId, { buildLogs: logs }).catch(() => {});
  };

  const tempDir = path.join(os.tmpdir(), `gitrepo_deploy_${deploymentId}`);

  try {
    const repo = await Repo.findById(deployment.repositoryId);
    if (!repo) throw new Error("Repository not found.");

    // Fetch user's Netlify token
    const user = await User.findById(deployment.userId).select("netlifyToken");
    const userToken = user?.netlifyToken ? user.netlifyToken.trim() : "";
    if (!userToken) {
      throw new Error("No Netlify Personal Access Token found for your account. Please add your Netlify Access Token in Profile Settings before deploying.");
    }

    // Step 1: Downloading
    deployment.status = "downloading";
    await deployment.save();
    appendLog(`Starting deployment for commit ${deployment.commitId}...`);
    appendLog("Downloading commit files from storage...");
    await downloadCommitFiles(repo, deployment.commitId, tempDir);
    appendLog("Repository files downloaded successfully.");

    // Step 2: Installing & Building
    deployment.status = "building";
    await deployment.save();
    const { buildCommand, outputDirectory } = await detectAndBuildProject(tempDir, appendLog);
    deployment.buildCommand = buildCommand;
    deployment.outputDirectory = outputDirectory;
    await deployment.save();

    // Step 3: Deploying to Netlify
    deployment.status = "deploying";
    await deployment.save();
    const targetOutputDir = path.join(tempDir, outputDirectory);
    const { siteId, deploymentUrl } = await deployToNetlify(targetOutputDir, repo.siteId || deployment.siteId, userToken, appendLog);

    // Save siteId to Repo if not present
    if (siteId && !repo.siteId) {
      repo.siteId = siteId;
      await repo.save().catch(() => {});
    }

    // Step 4: Success
    deployment.status = "success";
    deployment.siteId = siteId;
    deployment.deploymentUrl = deploymentUrl;
    deployment.completedAt = new Date();
    await deployment.save();
    appendLog("Deployment completed successfully!");

  } catch (error) {
    console.error(`Deployment ${deploymentId} failed:`, error);
    appendLog("ERROR: " + error.message);
    deployment.status = "failed";
    deployment.errorMessage = error.message;
    deployment.completedAt = new Date();
    await deployment.save();
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

module.exports = {
  downloadCommitFiles,
  detectAndBuildProject,
  deployToNetlify,
  runDeploymentProcess,
};
