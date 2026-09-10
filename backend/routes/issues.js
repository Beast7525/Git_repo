const express = require("express");
const Issue = require("../models/Issue");
const router = express.Router();

// GET /api/issues - Fetch all issues with optional filtering (status, search)
router.get("/", async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const issues = await Issue.find(filter).sort({ createdAt: -1 });
    res.status(200).json(issues);
  } catch (error) {
    console.error("Get issues error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

// GET /api/issues/:id - Fetch issue details by ID
router.get("/:id", async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(444).json({ message: "Issue not found" });
    }
    res.status(200).json(issue);
  } catch (error) {
    console.error("Get issue detail error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

// POST /api/issues - Create a new issue
router.post("/", async (req, res) => {
  try {
    const { title, description, author, userId } = req.body;

    if (!title || !description || !author || !userId) {
      return res.status(400).json({ message: "Title, description, author, and userId are required" });
    }

    const newIssue = new Issue({
      title,
      description,
      author,
      userId,
    });

    await newIssue.save();
    res.status(201).json(newIssue);
  } catch (error) {
    console.error("Create issue error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

// PUT /api/issues/:id/status - Update issue status
router.put("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !["open", "closed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value. Must be 'open' or 'closed'" });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    issue.status = status;
    await issue.save();

    res.status(200).json(issue);
  } catch (error) {
    console.error("Update issue status error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

// POST /api/issues/:id/comments - Add a comment to an issue
router.post("/:id/comments", async (req, res) => {
  try {
    const { author, body } = req.body;

    if (!author || !body) {
      return res.status(400).json({ message: "Comment author and body are required" });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    issue.comments.push({ author, body });
    await issue.save();

    res.status(201).json(issue);
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

module.exports = router;
