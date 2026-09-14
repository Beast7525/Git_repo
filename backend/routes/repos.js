const express = require("express");
const Repo = require("../models/Repo");
const User = require("../models/User");
const { initializeRepository } = require("../gitRepositoryService");

const router = express.Router();

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleIdentityRegex(value) {
  const parts = String(value || "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(escapeRegex);

  return parts.length ? new RegExp(`^${parts.join("[\\s_-]+")}$`, "i") : null;
}

// GET /api/repos
router.get("/", async (req, res) => {
  try {
    const ownerEmail = typeof req.query.ownerEmail === "string" ? req.query.ownerEmail.trim() : "";
    const owner = typeof req.query.owner === "string" ? req.query.owner.trim() : "";

    let filter = {};
    if (ownerEmail || owner) {
      const conditions = [];
      if (ownerEmail) {
        const escapedEmail = escapeRegex(ownerEmail);
        conditions.push({ ownerEmail: new RegExp(`^${escapedEmail}$`, "i") });
        conditions.push({ owner: new RegExp(`^${escapedEmail}$`, "i") });
      }
      if (owner) {
        const ownerRegex = flexibleIdentityRegex(owner);
        if (ownerRegex) {
          conditions.push({ owner: ownerRegex });
        }

        const matchingUser = await User.findOne({ username: ownerRegex }).select("gmail username");
        if (matchingUser?.gmail) {
          const escapedMatchedEmail = escapeRegex(matchingUser.gmail);
          conditions.push({ ownerEmail: new RegExp(`^${escapedMatchedEmail}$`, "i") });
        }
      }
      filter = { $or: conditions };
    }

    const repos = await Repo.find(filter).sort({ createdAt: -1 });
    res.status(200).json(repos);
  } catch (error) {
    res.status(500).json({ message: "Error fetching repositories: " + error.message });
  }
});

// POST /api/repos
router.post("/", async (req, res) => {
  try {
    const { repositoryName, name, description, visibility, ignoreGitignore, owner, ownerEmail } = req.body;
    const finalRepoName = (repositoryName || name || "").trim();

    if (!finalRepoName) {
      return res.status(400).json({ message: "Repository name is required." });
    }

    const existingRepo = await Repo.findOne({
      $or: [
        { repositoryName: finalRepoName.toLowerCase() },
        { name: finalRepoName.toLowerCase() }
      ]
    });

    if (existingRepo) {
      return res.status(409).json({ message: "Repository name already exists. Please choose a unique name." });
    }

    const newRepo = new Repo({
      repositoryName: finalRepoName,
      name: finalRepoName,
      description: description || "",
      visibility: visibility || "public",
      ignoreGitignore: !!ignoreGitignore,
      owner: owner || "Admin",
      ownerEmail: ownerEmail || "",
      contributors: 1,
      commits: 0,
      status: "Active"
    });

    await newRepo.save();
    res.status(201).json({ message: "Repository created successfully", repo: newRepo });
  } catch (error) {
    console.error("Error creating repository:", error);
    res.status(500).json({ message: "Error creating repository: " + error.message });
  }
});

// POST /api/repos/:id/upload - Store files, initialize git, commit, and optionally push to origin
router.post("/:id/upload", async (req, res) => {
  try {
    const { files, remoteUrl } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ message: "Please upload at least one file." });
    }

    const repo = await Repo.findById(req.params.id);
    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    if (repo.commits > 0 && repo.lastCommit?.hash) {
      return res.status(409).json({ message: "Repository already has an initial commit." });
    }

    const result = await initializeRepository(repo, files, typeof remoteUrl === "string" ? remoteUrl.trim() : "");
    repo.storagePath = result.repoDir;
    repo.files = result.files.map((file) => {
      const b2File = result.b2Files.find((uploaded) => uploaded.path === file.path);
      return { ...file, b2FileName: b2File?.b2FileName || "" };
    });
    repo.defaultBranch = "main";
    repo.remoteUrl = result.remoteUrl;
    repo.commits = 1;
    repo.lastCommit = result.commit;
    repo.pushStatus = result.pushStatus;
    repo.pushMessage = result.pushMessage;

    await repo.save();

    res.status(200).json({
      message: result.pushStatus === "failed"
        ? "Files committed locally, but push to origin failed."
        : "Files uploaded and initial commit created.",
      repo
    });
  } catch (error) {
    console.error("Error uploading repository files:", error);
    res.status(500).json({ message: "Error uploading repository files: " + error.message });
  }
});

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { b2, authorizeB2 } = require("../backblaze");

// POST /api/repos/find/:owner/:repoName/upload - Upload single/multiple files or folder to Backblaze B2
router.post("/find/:owner/:repoName/upload", upload.any(), async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { message } = req.body;
    const files = req.files || (req.file ? [req.file] : []);

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const ownerRegex = flexibleIdentityRegex(owner);
    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerConditions = ownerRegex ? [{ owner: ownerRegex }] : [];
    const matchingUser = ownerRegex ? await User.findOne({ username: ownerRegex }).select("gmail") : null;
    if (matchingUser?.gmail) {
      ownerConditions.push({ ownerEmail: new RegExp(`^${escapeRegex(matchingUser.gmail)}$`, "i") });
    }

    let repo = await Repo.findOne({
      $and: [
        { $or: ownerConditions.length ? ownerConditions : [{ owner: new RegExp(`^${escapeRegex(owner)}$`, "i") }] },
        {
          $or: [
            { name: repoRegex },
            { repositoryName: repoRegex }
          ]
        }
      ]
    });

    if (!repo) {
      repo = await Repo.findOne({
        $or: [
          { name: repoRegex },
          { repositoryName: repoRegex }
        ]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    // Backblaze B2 Upload logic
    let bucketName = process.env.B2_BUCKET_NAME || "GitRepo";
    let bucketId = null;
    try {
      await authorizeB2();
      const bucketRes = await b2.getBucket({ bucketName });
      bucketId = bucketRes.data?.buckets?.[0]?.bucketId;
    } catch (b2Err) {
      console.warn("Backblaze B2 auth notice:", b2Err.message);
    }

    repo.files = repo.files || [];
    let uploadedCount = 0;

    for (const file of files) {
      const fileName = file.originalname || file.filename || "file";
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const b2FileName = `repos/${repo._id}/${Date.now()}_${sanitizedFileName}`;
      let b2Url = "";

      if (bucketId) {
        try {
          const uploadUrlRes = await b2.getUploadUrl({ bucketId });
          const { uploadUrl, authorizationToken } = uploadUrlRes.data;
          await b2.uploadFile({
            uploadUrl,
            uploadAuthToken: authorizationToken,
            fileName: b2FileName,
            data: file.buffer,
          });
          b2Url = `https://f000.backblazeb2.com/file/${bucketName}/${b2FileName}`;
        } catch (uploadErr) {
          console.warn(`B2 upload notice for ${fileName}:`, uploadErr.message);
        }
      }

      const newFileObj = {
        path: fileName,
        size: file.size,
        contentType: file.mimetype,
        b2FileName: b2FileName,
        b2Url: b2Url,
        uploadedAt: new Date()
      };

      const existingIndex = repo.files.findIndex(f => f.path === fileName);
      if (existingIndex >= 0) {
        repo.files[existingIndex] = newFileObj;
      } else {
        repo.files.push(newFileObj);
      }
      uploadedCount++;
    }

    repo.commits = (repo.commits || 0) + 1;
    repo.lastCommit = {
      hash: Math.random().toString(36).substring(2, 9),
      message: message || `Uploaded ${uploadedCount} file${uploadedCount > 1 ? "s" : ""} to Backblaze B2`,
      branch: repo.defaultBranch || "main",
      committedAt: new Date()
    };

    await repo.save();
    res.status(200).json({ message: `Successfully uploaded ${uploadedCount} file(s) to Backblaze B2 cloud storage`, repo });
  } catch (error) {
    console.error("Error uploading file to repo:", error);
    res.status(500).json({ message: "Upload failed: " + error.message });
  }
});

// GET /api/repos/find/:owner/:repoName - Get repository details by owner username & repository name
router.get("/find/:owner/:repoName", async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const ownerRegex = flexibleIdentityRegex(owner);
    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerConditions = ownerRegex ? [{ owner: ownerRegex }] : [];
    const matchingUser = ownerRegex ? await User.findOne({ username: ownerRegex }).select("gmail") : null;
    if (matchingUser?.gmail) {
      ownerConditions.push({ ownerEmail: new RegExp(`^${escapeRegex(matchingUser.gmail)}$`, "i") });
    }

    let repo = await Repo.findOne({
      $and: [
        { $or: ownerConditions.length ? ownerConditions : [{ owner: new RegExp(`^${escapeRegex(owner)}$`, "i") }] },
        {
          $or: [
            { name: repoRegex },
            { repositoryName: repoRegex }
          ]
        }
      ]
    });

    if (!repo) {
      repo = await Repo.findOne({
        $or: [
          { name: repoRegex },
          { repositoryName: repoRegex }
        ]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    res.status(200).json(repo);
  } catch (error) {
    console.error("Error finding repository:", error);
    res.status(500).json({ message: "Error fetching repository: " + error.message });
  }
});

module.exports = router;
