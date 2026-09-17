const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { b2 } = require("./backblaze");

const execFileAsync = promisify(execFile);
const STORAGE_ROOT = process.env.REPOSITORY_STORAGE_ROOT || path.join(__dirname, "repositories");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "repository";
}

function safeRelativePath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const cleanPath = path.posix.normalize(normalized).replace(/^(\.\.\/)+/, "");

  if (!cleanPath || cleanPath === "." || cleanPath.startsWith("../") || path.isAbsolute(cleanPath)) {
    throw new Error(`Invalid upload path: ${filePath}`);
  }

  if (cleanPath.split("/").some((segment) => segment.toLowerCase() === ".git")) {
    throw new Error(`Invalid upload path: ${filePath}`);
  }

  return cleanPath;
}

async function runGit(args, cwd) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10
  });

  return `${stdout || ""}${stderr || ""}`.trim();
}

async function writeUploadedFiles(repoDir, files) {
  const writtenFiles = [];

  for (const file of files) {
    const relativePath = safeRelativePath(file.path || file.name);
    const absolutePath = path.resolve(repoDir, relativePath);

    if (!absolutePath.startsWith(path.resolve(repoDir) + path.sep)) {
      throw new Error(`Invalid upload path: ${relativePath}`);
    }

    const content = Buffer.from(file.content || "", "base64");
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content);
    writtenFiles.push({
      path: relativePath,
      size: content.length,
      contentType: file.type || "application/octet-stream"
    });
  }

  return writtenFiles;
}

async function uploadFilesToB2(repo, writtenFiles, repoDir) {
  const bucketId = process.env.B2_BUCKET_ID;
  if (!bucketId || !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY) {
    return [];
  }

  try {
    const uploadUrlResponse = await b2.getUploadUrl({ bucketId });
    const uploadUrl = uploadUrlResponse.data.uploadUrl;
    const uploadAuthToken = uploadUrlResponse.data.authorizationToken;
    const uploaded = [];

    for (const file of writtenFiles) {
      const data = await fs.readFile(path.join(repoDir, file.path));
      const sha1 = crypto.createHash("sha1").update(data).digest("hex");
      const fileName = `${repo._id}/${file.path}`;

      await b2.uploadFile({
        uploadUrl,
        uploadAuthToken,
        fileName,
        data,
        contentType: file.contentType,
        hash: sha1
      });

      uploaded.push({ ...file, b2FileName: fileName });
    }

    return uploaded;
  } catch (error) {
    console.warn("Backblaze B2 upload skipped:", error.message);
    return [];
  }
}

async function commitFileChange(repoDir, filePath, content, message) {
  const relativePath = safeRelativePath(filePath);
  const absolutePath = path.resolve(repoDir, relativePath);

  if (!absolutePath.startsWith(path.resolve(repoDir) + path.sep)) {
    throw new Error(`Invalid upload path: ${relativePath}`);
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, Buffer.from(content || "", "utf-8"));

  await runGit(["add", "-A"], repoDir);
  await runGit(
    ["-c", "user.name=Gitrepo", "-c", "user.email=gitrepo@example.com", "commit", "-m", message || "Update file"],
    repoDir
  );

  const hash = await runGit(["rev-parse", "HEAD"], repoDir);
  const committedAt = await runGit(["log", "-1", "--format=%cI"], repoDir);

  return { hash: hash.trim(), committedAt: committedAt.trim() };
}

async function initializeRepository(repo, files, remoteUrl) {
  const repoDir = path.join(STORAGE_ROOT, String(repo._id), slugify(repo.repositoryName || repo.name));
  await fs.mkdir(repoDir, { recursive: true });

  const writtenFiles = await writeUploadedFiles(repoDir, files);

  await runGit(["init"], repoDir);
  await runGit(["add", "."], repoDir);
  await runGit(["-c", "user.name=Gitrepo", "-c", "user.email=gitrepo@example.com", "commit", "-m", "Initial commit"], repoDir);
  await runGit(["branch", "-M", "main"], repoDir);

  let pushStatus = "not_configured";
  let pushMessage = "";
  if (remoteUrl) {
    await runGit(["remote", "remove", "origin"], repoDir).catch(() => "");
    await runGit(["remote", "add", "origin", remoteUrl], repoDir);

    try {
      pushMessage = await runGit(["push", "-u", "origin", "main"], repoDir);
      pushStatus = "pushed";
    } catch (error) {
      pushStatus = "failed";
      pushMessage = error.stderr || error.stdout || error.message;
    }
  }

  const commitHash = await runGit(["rev-parse", "HEAD"], repoDir);
  const committedAt = await runGit(["log", "-1", "--format=%cI"], repoDir);
  const b2Files = await uploadFilesToB2(repo, writtenFiles, repoDir);

  return {
    repoDir,
    files: writtenFiles,
    b2Files,
    commit: {
      hash: commitHash.trim(),
      message: "Initial commit",
      branch: "main",
      committedAt: committedAt.trim()
    },
    remoteUrl: remoteUrl || "",
    pushStatus,
    pushMessage
  };
}

module.exports = {
  initializeRepository,
  commitFileChange
};
