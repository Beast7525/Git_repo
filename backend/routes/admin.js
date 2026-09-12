const express = require("express");
const User = require("../models/User");
const Issue = require("../models/Issue");
const Repo = require("../models/Repo");
const PullRequest = require("../models/PullRequest");

const router = express.Router();

// GET /api/admin/stats - Derive platform stats from database models
router.get("/stats", async (req, res) => {
  try {
    const [userCount, repoCount, openIssuesCount, closedIssuesCount, pendingPRsCount, mergedPRsCount, rejectedPRsCount, commitTotals, recentUsers, recentRepos, recentIssues, recentPRs] = await Promise.all([
      User.countDocuments(),
      Repo.countDocuments(),
      Issue.countDocuments({ status: "open" }),
      Issue.countDocuments({ status: "closed" }),
      PullRequest.countDocuments({ status: "Pending" }),
      PullRequest.countDocuments({ status: "Merged" }),
      PullRequest.countDocuments({ status: "Rejected" }),
      Repo.aggregate([{ $group: { _id: null, total: { $sum: "$commits" } } }]),
      User.find().sort({ createdAt: -1 }).limit(3).select("username createdAt"),
      Repo.find().sort({ createdAt: -1 }).limit(3).select("owner name createdAt"),
      Issue.find().sort({ createdAt: -1 }).limit(3).select("title author status createdAt"),
      PullRequest.find().sort({ createdAt: -1 }).limit(3).select("title createdBy status createdAt")
    ]);

    const recentActivity = [
      ...recentUsers.map((user) => ({ id: `user-${user._id}`, user: user.username, action: "registered", target: "User account", time: user.createdAt, type: "user" })),
      ...recentRepos.map((repo) => ({ id: `repo-${repo._id}`, user: repo.owner, action: "created repository", target: repo.name, time: repo.createdAt, type: "repo" })),
      ...recentIssues.map((issue) => ({ id: `issue-${issue._id}`, user: issue.author, action: `created ${issue.status} issue`, target: issue.title, time: issue.createdAt, type: "issue" })),
      ...recentPRs.map((pullRequest) => ({ id: `pr-${pullRequest._id}`, user: pullRequest.createdBy, action: `created ${pullRequest.status.toLowerCase()} pull request`, target: pullRequest.title, time: pullRequest.createdAt, type: "pr" }))
    ]
      .sort((first, second) => new Date(second.time) - new Date(first.time))
      .slice(0, 6)
      .map((activity) => ({ ...activity, time: activity.time ? activity.time.toISOString() : null }));

    res.status(200).json({
      totalUsers: userCount || 0,
      totalRepos: repoCount || 0,
      totalCommits: commitTotals[0]?.total || 0,
      openIssues: openIssuesCount || 0,
      closedIssues: closedIssuesCount || 0,
      pendingPRs: pendingPRsCount || 0,
      mergedPRs: mergedPRsCount || 0,
      rejectedPRs: rejectedPRsCount || 0,
      recentActivity
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

// GET /api/admin/users - Derive users from database
router.get("/users", async (req, res) => {
  try {
    const dbUsers = await User.find().select("-password");
    const formatted = dbUsers.map(u => ({
      id: u._id.toString(),
      name: u.username || u.name || "User",
      email: u.gmail || u.email || "",
      role: u.gmail === "gitrepo02@gmail.com" ? "Admin" : "Developer",
      status: "Active",
      registrationDate: u.createdAt ? u.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${u.username || u._id}`,
      permissions: u.gmail === "gitrepo02@gmail.com" ? ["Full System Admin", "Manage Users", "Manage Repos"] : ["Push Code", "Create Issues"]
    }));
    res.status(200).json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Error fetching database users: " + error.message });
  }
});

// GET /api/admin/repos - Derive repos from database
router.get("/repos", async (req, res) => {
  try {
    const repos = await Repo.find();
    res.status(200).json(repos.map(r => ({
      id: r._id.toString(),
      name: r.name || r.repositoryName,
      repositoryName: r.repositoryName,
      owner: r.owner,
      ownerEmail: r.ownerEmail,
      visibility: r.visibility,
      status: r.status,
      description: r.description,
      ignoreGitignore: r.ignoreGitignore,
      contributors: r.contributors,
      commits: r.commits,
      creationDate: r.createdAt ? r.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
    })));
  } catch (error) {
    res.status(500).json({ message: "Error fetching repositories: " + error.message });
  }
});

// POST /api/admin/repos - Create repo in database
router.post("/repos", async (req, res) => {
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
      owner: owner || "Developer",
      ownerEmail: ownerEmail || "",
      contributors: 1,
      commits: 0,
      status: "Active"
    });

    await newRepo.save();
    console.log(`Repository "${newRepo.repositoryName}" owned by "${newRepo.owner}" saved to database collection 'repositories'`);
    res.status(201).json({ message: "Repository created successfully", repo: newRepo });
  } catch (error) {
    console.error("Error creating repo in admin route:", error);
    res.status(500).json({ message: "Error creating repo: " + error.message });
  }
});

// GET /api/admin/issues - Derive issues from database
router.get("/issues", async (req, res) => {
  try {
    const issues = await Issue.find().populate("userId", "username gmail");
    res.status(200).json(issues.map(i => ({
      id: i._id.toString(),
      title: i.title,
      description: i.description,
      repository: "main-repo",
      createdBy: i.author || (i.userId ? i.userId.username : "Unknown"),
      assignedUser: "Alexander Wright",
      status: i.status === "open" ? "Open" : "Closed",
      priority: "High",
      creationDate: i.createdAt ? i.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
    })));
  } catch (error) {
    res.status(500).json({ message: "Error fetching issues: " + error.message });
  }
});

// GET /api/admin/prs - Derive PRs from database
router.get("/prs", async (req, res) => {
  try {
    const prs = await PullRequest.find();
    res.status(200).json(prs.map(p => ({
      id: p._id.toString(),
      title: p.title,
      repository: p.repository,
      createdBy: p.createdBy,
      targetBranch: p.targetBranch,
      sourceBranch: p.sourceBranch,
      status: p.status,
      additions: p.additions,
      deletions: p.deletions,
      description: p.description,
      creationDate: p.createdAt ? p.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
    })));
  } catch (error) {
    res.status(500).json({ message: "Error fetching PRs: " + error.message });
  }
});

module.exports = router;
