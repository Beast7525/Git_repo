const express = require("express");
const Repo = require("../models/Repo");

const router = express.Router();

// GET /api/repos
router.get("/", async (req, res) => {
  try {
    const ownerEmail = typeof req.query.ownerEmail === "string" ? req.query.ownerEmail.trim() : "";
    const owner = typeof req.query.owner === "string" ? req.query.owner.trim() : "";

    let filter = {};
    if (ownerEmail || owner) {
      const conditions = [];
      if (ownerEmail) {
        conditions.push({ ownerEmail: new RegExp(`^${ownerEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      }
      if (owner) {
        conditions.push({ owner: new RegExp(`^${owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
      }
      filter = { $or: conditions };
    } else {
      filter = { visibility: { $in: ["public", "Public"] } };
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
      commits: 1,
      status: "Active"
    });

    await newRepo.save();
    res.status(201).json({ message: "Repository created successfully", repo: newRepo });
  } catch (error) {
    console.error("Error creating repository:", error);
    res.status(500).json({ message: "Error creating repository: " + error.message });
  }
});

// GET /api/repos/find/:owner/:repoName - Get repository details by owner username & repository name
router.get("/find/:owner/:repoName", async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const ownerRegex = new RegExp(`^${owner.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const repoRegex = new RegExp(`^${repoName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

    const repo = await Repo.findOne({
      $and: [
        { owner: ownerRegex },
        {
          $or: [
            { name: repoRegex },
            { repositoryName: repoRegex }
          ]
        }
      ]
    });

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
