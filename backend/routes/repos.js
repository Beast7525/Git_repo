const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const Repo = require("../models/Repo");
const User = require("../models/User");
const Group = require("../models/Group");
const Issue = require("../models/Issue");
const { initializeRepository, commitFileChange } = require("../gitRepositoryService");
const { parseGitignore, isIgnored, isGitignoreFile, normalizeRelPath } = require("../gitignore");
const { isGroupMember, isPublicRepo, isRepoOwner, optionalAuth, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(optionalAuth);

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleIdentityRegex(value) {
  const parts = String(value || "")
    .trim()
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map(escapeRegex);

  return parts.length ? new RegExp(`^${parts.join("[\\s\\-_]+")}$`, "i") : null;
}

// Same idea as flexibleIdentityRegex, but it also matches the joined-together spelling
// ("alexwright"), which is what the signed-in account's own username resolves to.
function tolerantIdentityRegex(value) {
  const parts = String(value || "")
    .trim()
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map(escapeRegex);

  if (!parts.length) return null;
  if (parts.length === 1) return new RegExp(`^${parts[0]}$`, "i");
  return new RegExp(`^${parts.join("[\\s\\-_]*")}$`, "i");
}

function isObjectIdLike(value) {
  return typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
}

// Which repositories are shared with the signed-in account through a team it belongs to.
// Identity comes from the verified token, never from a query string, and membership is
// restricted to accepted invitations.
async function teamReposForUser(user) {
  if (!user) return { groupIds: [], repoIds: [] };

  const usernameRegex = tolerantIdentityRegex(user.username);
  const emailRegex = user.gmail ? new RegExp(`^${escapeRegex(user.gmail)}$`, "i") : null;

  const conditions = [];
  if (usernameRegex) {
    conditions.push({ creator: usernameRegex });
    // $elemMatch keeps the status check on the SAME member row as the username, which a
    // pair of sibling conditions on one array cannot guarantee.
    conditions.push({ members: { $elemMatch: { status: "accepted", username: usernameRegex } } });
  }
  if (emailRegex) {
    conditions.push({ creatorEmail: emailRegex });
    conditions.push({ members: { $elemMatch: { status: "accepted", email: emailRegex } } });
  }
  if (!conditions.length) return { groupIds: [], repoIds: [] };

  const groups = await Group.find({ $or: conditions }).select("_id repositories");
  return {
    groupIds: groups.map((g) => g._id),
    repoIds: groups.flatMap((g) => g.repositories || []).filter(Boolean)
  };
}

// Same lookup as teamReposForUser, but for an arbitrary set of group match conditions
// (used when browsing someone else's profile).
async function teamReposForGroups(groupSearchConditions) {
  const groups = await Group.find({ $or: groupSearchConditions }).select("_id repositories");
  return {
    groupIds: groups.map((g) => g._id),
    repoIds: groups.flatMap((g) => g.repositories || []).filter(Boolean)
  };
}

function teamRepoConditions({ groupIds, repoIds }) {
  const conditions = [];
  if (groupIds && groupIds.length) conditions.push({ group: { $in: groupIds } });
  if (repoIds && repoIds.length) conditions.push({ _id: { $in: repoIds } });
  return conditions.length ? [{ $or: conditions }] : [];
}

// Single source of truth for "may this account look at this repository".
// A repository is readable when it is public, owned by the caller, or shared with a
// team the caller has accepted an invitation to.
async function canViewRepo(repo, user) {
  if (!repo) return false;
  if (isPublicRepo(repo)) return true;
  if (!user) return false;
  if (isRepoOwner(repo, user)) return true;

  // The association is written to both sides (Repo.group and Group.repositories), and the
  // two can disagree after older writes, so accept either one.
  const references = [repo.group, repo.groupId, repo.groupName, repo._id]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => String(value));

  const candidates = [];
  const objectIdRefs = references.filter(isObjectIdLike).map((value) => new mongoose.Types.ObjectId(value));
  if (objectIdRefs.length) candidates.push({ _id: { $in: objectIdRefs } });
  candidates.push({ groupId: { $in: references } });
  candidates.push({ name: { $in: references } });
  candidates.push({ repositories: repo._id });

  const groups = await Group.find({ $or: candidates });
  return groups.some((group) => isGroupMember(group, user));
}

// ===== Branch merge (pull) helpers =====
async function resolveRepoByOwnerName(owner, repoName) {
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
      { $or: [{ name: repoRegex }, { repositoryName: repoRegex }] }
    ]
  });

  if (!repo) {
    repo = await Repo.findOne({ $or: [{ name: repoRegex }, { repositoryName: repoRegex }] });
  }
  return repo || null;
}

async function requireRepoOwner(req, res, next) {
  const repo = await resolveRepoByOwnerName(req.params.owner, req.params.repoName);
  if (!isRepoOwner(repo, req.authUser)) {
    return res.status(404).json({ message: "Repository not found" });
  }
  req.repo = repo;
  next();
}

async function requireRepoAccess(req, res, next) {
  const repo = await resolveRepoByOwnerName(req.params.owner, req.params.repoName);
  if (!(await canViewRepo(repo, req.authUser))) {
    return res.status(404).json({ message: "Repository not found" });
  }
  req.repo = repo;
  next();
}

async function requireRepoOwnerById(req, res, next) {
  const repo = await Repo.findById(req.params.id).catch(() => null);
  if (!isRepoOwner(repo, req.authUser)) {
    return res.status(404).json({ message: "Repository not found" });
  }
  req.repo = repo;
  next();
}

function hasStarredByUser(repo, user) {
  if (!repo || !user) return false;
  const userId = String(user._id);
  return (repo.starredBy || []).some((entry) => String(entry.userId) === userId);
}

// The write guards keep repeated clicks idempotent, and the counter is recomputed from the
// star list so "stars" can never drift away from who actually starred the repository.
async function setRepoStarred(repo, user, starred) {
  const userId = user._id;

  if (starred) {
    await Repo.updateOne(
      { _id: repo._id, "starredBy.userId": { $ne: userId } },
      { $push: { starredBy: { userId, starredAt: new Date() } } }
    );
  } else {
    await Repo.updateOne(
      { _id: repo._id, "starredBy.userId": userId },
      { $pull: { starredBy: { userId } } }
    );
  }

  await Repo.updateOne(
    { _id: repo._id },
    [{ $set: { stars: { $size: { $ifNull: ["$starredBy", []] } } } }],
    { updatePipeline: true }
  );

  const updated = await Repo.findById(repo._id).select("starredBy").lean();
  const count = Array.isArray(updated?.starredBy) ? updated.starredBy.length : 0;
  return { stars: count, starred };
}

async function fetchFileText(repo, fileObj) {
  if (!fileObj) return null;
  if (typeof fileObj.content === "string" && fileObj.content.length > 0) return fileObj.content;

  if (repo.storagePath && fileObj.path) {
    try {
      const safePath = path.normalize(fileObj.path).replace(/^(\.\.[\/\\])+/, "");
      const fullPath = path.resolve(repo.storagePath, safePath);
      if (fullPath.startsWith(path.resolve(repo.storagePath))) {
        return await fs.readFile(fullPath, "utf-8");
      }
    } catch (_) {}
  }

  if (fileObj.b2Url) {
    try {
      const resp = await fetch(fileObj.b2Url);
      if (resp.ok) return await resp.text();
    } catch (_) {}
  }

  if (fileObj.b2FileName) {
    try {
      await authorizeB2();
      const bucketName = process.env.B2_BUCKET_NAME || "GitRepo";
      const resp = await b2.downloadFileByName({ bucketName, fileName: fileObj.b2FileName, responseType: "text" });
      if (resp && resp.data) {
        return typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data, null, 2);
      }
    } catch (_) {}
  }

  return null;
}

function isConflictedContent(ours, theirs, ourSize, theirSize) {
  const oursKnown = ours !== null;
  const theirsKnown = theirs !== null;
  if (oursKnown && theirsKnown) return ours !== theirs;
  return (ourSize || 0) !== (theirSize || 0);
}

function buildBranchFileMaps(repo, targetBranch, sourceBranch) {
  const files = repo.files || [];
  const defaultBranch = repo.defaultBranch || "main";
  const targetMap = new Map();
  const sourceMap = new Map();
  for (const f of files) {
    const b = (f.branch || defaultBranch).toLowerCase();
    if (b === targetBranch.toLowerCase()) targetMap.set(f.path, f);
    else if (b === sourceBranch.toLowerCase()) sourceMap.set(f.path, f);
  }
  return { targetMap, sourceMap };
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

      // Repositories of a team the *queried* profile belongs to, so browsing someone's
      // profile shows what that profile can see. Access is still enforced below.
      const groupSearchConditions = [];
      if (owner) {
        const ownerRegex = tolerantIdentityRegex(owner);
        if (ownerRegex) {
          groupSearchConditions.push({ creator: ownerRegex });
          groupSearchConditions.push({ members: { $elemMatch: { status: "accepted", username: ownerRegex } } });
        }
      }
      if (ownerEmail) {
        const escapedEmail = escapeRegex(ownerEmail);
        groupSearchConditions.push({ creatorEmail: new RegExp(`^${escapedEmail}$`, "i") });
        groupSearchConditions.push({ members: { $elemMatch: { status: "accepted", email: new RegExp(`^${escapedEmail}$`, "i") } } });
      }

      if (groupSearchConditions.length > 0) {
        conditions.push(...teamRepoConditions(await teamReposForGroups(groupSearchConditions)));
      }

      filter = { $or: conditions };
    }

    const visibleToUser = [
      { visibility: /^public$/i },
      { visibility: { $exists: false } },
      { visibility: null },
    ];
    if (req.authUser) {
      const ownerRegex = flexibleIdentityRegex(req.authUser.username);
      if (req.authUser.gmail) {
        const emailRegex = new RegExp(`^${escapeRegex(req.authUser.gmail)}$`, "i");
        visibleToUser.push({ ownerEmail: emailRegex });
        const legacyOwnerMatches = [{ owner: emailRegex }];
        if (ownerRegex) legacyOwnerMatches.push({ owner: ownerRegex });
        visibleToUser.push({
          $and: [
            { $or: [{ ownerEmail: { $exists: false } }, { ownerEmail: "" }, { ownerEmail: null }] },
            { $or: legacyOwnerMatches },
          ],
        });
      } else if (ownerRegex) {
        visibleToUser.push({ owner: ownerRegex });
      }

      // Repositories shared with the signed-in account's teams. This is added on BOTH sides
      // of the final $and so a team repository is returned even when ?owner names someone
      // else (profile browsing) or is missing entirely.
      const ownTeamConditions = teamRepoConditions(await teamReposForUser(req.authUser));
      visibleToUser.push(...ownTeamConditions);
      if (Object.keys(filter).length && ownTeamConditions.length) {
        filter = { $or: [...(filter.$or || []), ...ownTeamConditions] };
      }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : (typeof req.query.q === "string" ? req.query.q.trim() : "");
    const accessFilter = { $or: visibleToUser };
    let combinedFilter = Object.keys(filter).length ? { $and: [filter, accessFilter] } : accessFilter;

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");
      const searchCondition = {
        $or: [
          { name: searchRegex },
          { repositoryName: searchRegex },
          { description: searchRegex },
          { owner: searchRegex }
        ]
      };
      combinedFilter = { $and: [combinedFilter, searchCondition] };
    }

    const repos = await Repo.find(combinedFilter).sort({ createdAt: -1 });
    res.status(200).json(repos);
  } catch (error) {
    res.status(500).json({ message: "Error fetching repositories: " + error.message });
  }
});

// GET /api/repos/starred - repositories the signed-in user has starred
router.get("/starred", requireAuth, async (req, res) => {
  try {
    const repos = await Repo.find({ "starredBy.userId": req.authUser._id })
      .select("-files -commitHistory -storagePath -reports")
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json(
      repos.map((repo) => ({
        ...repo,
        stars: Array.isArray(repo.starredBy) ? repo.starredBy.length : 0,
        starred: true,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Error fetching starred repositories: " + error.message });
  }
});

// POST /api/repos
router.post("/", requireAuth, async (req, res) => {
  try {
    const { repositoryName, name, description, visibility, ignoreGitignore, groupId } = req.body;
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

    let groupRef = null;
    let groupNameStr = "";
    if (groupId) {
      const groupDoc = await Group.findById(groupId).catch(() => null);
      // A repository can only be placed in a team its creator has actually joined, which
      // is the same rule the settings endpoint applies when sharing an existing repository.
      if (groupDoc && !isGroupMember(groupDoc, req.authUser)) {
        return res.status(403).json({ message: "You must be an accepted member of the selected team." });
      }
      if (groupDoc) {
        groupRef = groupDoc._id;
        groupNameStr = groupDoc.name;
      }
    }

    const newRepo = new Repo({
      repositoryName: finalRepoName,
      name: finalRepoName,
      description: description || "",
      visibility: visibility || "public",
      ignoreGitignore: !!ignoreGitignore,
      owner: req.authUser.username,
      ownerEmail: req.authUser.gmail,
      group: groupRef,
      groupId: groupId || "",
      groupName: groupNameStr,
      contributors: 1,
      commits: 0,
      status: "Active"
    });

    await newRepo.save();

    if (groupRef) {
      await Group.findByIdAndUpdate(groupRef, {
        $addToSet: { repositories: newRepo._id }
      });
    }

    res.status(201).json({ message: "Repository created successfully", repo: newRepo });
  } catch (error) {
    console.error("Error creating repository:", error);
    res.status(500).json({ message: "Error creating repository: " + error.message });
  }
});

// POST /api/repos/:id/upload - Store files, initialize git, commit, and optionally push to origin
router.post("/:id/upload", requireAuth, requireRepoOwnerById, async (req, res) => {
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
router.post("/find/:owner/:repoName/upload", requireAuth, requireRepoOwner, upload.any(), async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { message, branch } = req.body || {};
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

    const targetBranch = (typeof branch === "string" && branch.trim()) ? branch.trim() : (repo.defaultBranch || "main");

    repo.branches = repo.branches || ["main"];
    if (!repo.branches.includes(targetBranch)) {
      repo.branches.push(targetBranch);
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

    // --- .gitignore filtering ---
    // Gather gitignore rules from all uploaded & stored .gitignore files
    let gitignoreContent = "";
    for (const f of files) {
      const relName = normalizeRelPath(f.originalname || f.filename || f.path || "");
      if (isGitignoreFile(relName) && Buffer.isBuffer(f.buffer)) {
        gitignoreContent += "\n" + f.buffer.toString("utf-8");
      }
    }
    const storedGitignoreFiles = (repo.files || []).filter((f) => isGitignoreFile(f.path) && typeof f.content === "string");
    for (const sg of storedGitignoreFiles) {
      gitignoreContent += "\n" + sg.content;
    }

    const customRules = parseGitignore(gitignoreContent);
    const filesToUpload = [];
    let ignoredCount = 0;

    for (const f of files) {
      const rel = normalizeRelPath(f.originalname || f.filename || f.path || "");
      if (!rel) continue;
      // Completely exclude .gitignore files themselves AND any files matched by .gitignore patterns
      if (isGitignoreFile(rel) || (!repo.ignoreGitignore && isIgnored(rel, customRules))) {
        ignoredCount++;
        continue;
      }
      filesToUpload.push(f);
    }

    let uploadedCount = 0;

    for (const file of filesToUpload) {
      const fileName = file.originalname || file.filename || file.path || "file";
      if (isGitignoreFile(fileName)) continue;
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
        branch: targetBranch,
        uploadedAt: new Date()
      };

      const existingIndex = repo.files.findIndex(f => f.path === fileName && (f.branch || "main") === targetBranch);
      if (existingIndex >= 0) {
        repo.files[existingIndex] = newFileObj;
      } else {
        repo.files.push(newFileObj);
      }
      uploadedCount++;
    }

    // Filter out .gitignore files themselves and ignored files from stored repo.files list
    repo.files = (repo.files || []).filter(
      (f) => !isGitignoreFile(f.path || "") && (repo.ignoreGitignore ? true : !isIgnored(f.path || "", customRules))
    );

    const commitHash = Math.random().toString(36).substring(2, 9);
    const commitMsg = message && message.trim() ? message.trim() : `Uploaded ${uploadedCount} file${uploadedCount > 1 ? "s" : ""} to ${targetBranch}`;
    const authorName = owner || repo.owner || "Developer";

    repo.commits = (repo.commits || 0) + 1;
    repo.lastCommit = {
      hash: commitHash,
      message: commitMsg,
      branch: targetBranch,
      committedAt: new Date()
    };

    repo.commitHistory = repo.commitHistory || [];
    repo.commitHistory.unshift({
      hash: commitHash,
      message: commitMsg,
      branch: targetBranch,
      author: authorName,
      committedAt: new Date(),
      snapshotFiles: JSON.parse(JSON.stringify(repo.files || []))
    });

    await repo.save();
    res.status(200).json({ message: `Successfully uploaded ${uploadedCount} file(s) to ${targetBranch} branch`, repo });
  } catch (error) {
    console.error("Error uploading file to repo:", error);
    res.status(500).json({ message: "Upload failed: " + error.message });
  }
});

// POST /api/repos/find/:owner/:repoName/branches - Create a new branch
router.post("/find/:owner/:repoName/branches", requireAuth, requireRepoOwner, async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { branchName } = req.body || {};

    const cleanBranch = (typeof branchName === "string" ? branchName : "").trim();
    if (!cleanBranch) {
      return res.status(400).json({ message: "Branch name is required." });
    }

    if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(cleanBranch)) {
      return res.status(400).json({ message: "Invalid branch name format. Use letters, numbers, hyphens, and slashes." });
    }

    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerRegex = flexibleIdentityRegex(owner);
    const ownerConditions = ownerRegex ? [{ owner: ownerRegex }] : [];
    const matchingUser = ownerRegex ? await User.findOne({ username: ownerRegex }).select("gmail") : null;
    if (matchingUser?.gmail) {
      ownerConditions.push({ ownerEmail: new RegExp(`^${escapeRegex(matchingUser.gmail)}$`, "i") });
    }

    let repo = await Repo.findOne({
      $and: [
        { $or: ownerConditions.length ? ownerConditions : [{ owner: new RegExp(`^${escapeRegex(owner)}$`, "i") }] },
        { $or: [{ name: repoRegex }, { repositoryName: repoRegex }] }
      ]
    });

    if (!repo) {
      repo = await Repo.findOne({
        $or: [{ name: repoRegex }, { repositoryName: repoRegex }]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    repo.branches = repo.branches && repo.branches.length > 0 ? repo.branches : ["main"];

    if (repo.branches.some(b => b.toLowerCase() === cleanBranch.toLowerCase())) {
      return res.status(409).json({ message: `Branch "${cleanBranch}" already exists.` });
    }

    repo.branches.push(cleanBranch);
    await repo.save();

    res.status(201).json({
      message: `Branch "${cleanBranch}" created successfully.`,
      branches: repo.branches,
      repo
    });
  } catch (error) {
    console.error("Error creating branch:", error);
    res.status(500).json({ message: "Error creating branch: " + error.message });
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

    if (!(await canViewRepo(repo, req.authUser))) {
      return res.status(404).json({ message: "Repository not found" });
    }

    // Ensure full commitHistory timeline is preserved for the graph
    repo.commitHistory = repo.commitHistory || [];

    if (repo.lastCommit && repo.lastCommit.hash && !repo.commitHistory.some(c => c.hash === repo.lastCommit.hash)) {
      repo.commitHistory.unshift({
        hash: repo.lastCommit.hash,
        message: repo.lastCommit.message || `Commit update for ${repo.name}`,
        branch: repo.lastCommit.branch || repo.defaultBranch || "main",
        author: repo.owner || "Developer",
        committedAt: repo.lastCommit.committedAt || new Date(),
        snapshotFiles: JSON.parse(JSON.stringify(repo.files || []))
      });
    }

    const initialHash = "init_" + repo._id.toString().slice(-6);
    if (!repo.commitHistory.some(c => c.hash === initialHash || (c.message && c.message.toLowerCase().includes("initial repository creation")))) {
      repo.commitHistory.push({
        hash: initialHash,
        message: `Initial repository creation for ${repo.name || repo.repositoryName}`,
        branch: repo.defaultBranch || "main",
        author: repo.owner || "Developer",
        committedAt: repo.createdAt || new Date(),
        snapshotFiles: []
      });
      await repo.save().catch(err => console.warn("Repo commitHistory backfill save warning:", err.message));
    }

    // Filter out .gitignore files and ignored files from response
    if (Array.isArray(repo.files)) {
      repo.files = repo.files.filter(
        (f) => !isGitignoreFile(f.path || "") && (repo.ignoreGitignore ? true : !isIgnored(f.path || ""))
      );
    }

    const payload = typeof repo.toObject === "function" ? repo.toObject() : { ...repo };
    payload.starred = hasStarredByUser(repo, req.authUser);
    res.status(200).json(payload);
  } catch (error) {
    console.error("Error finding repository:", error);
    res.status(500).json({ message: "Error fetching repository: " + error.message });
  }
});

// POST /api/repos/find/:owner/:repoName/star - add the signed-in user to the star list
router.post("/find/:owner/:repoName/star", requireAuth, requireRepoAccess, async (req, res) => {
  try {
    res.status(200).json(await setRepoStarred(req.repo, req.authUser, true));
  } catch (error) {
    console.error("Error starring repository:", error);
    res.status(500).json({ message: "Error starring repository: " + error.message });
  }
});

// DELETE /api/repos/find/:owner/:repoName/star - remove the signed-in user from the star list
router.delete("/find/:owner/:repoName/star", requireAuth, requireRepoAccess, async (req, res) => {
  try {
    res.status(200).json(await setRepoStarred(req.repo, req.authUser, false));
  } catch (error) {
    console.error("Error unstarring repository:", error);
    res.status(500).json({ message: "Error unstarring repository: " + error.message });
  }
});

// GET /api/repos/find/:owner/:repoName/file-content - Get raw text content of a repository file
router.get("/find/:owner/:repoName/file-content", async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const filePath = typeof req.query.filePath === "string" ? req.query.filePath.trim() : "";

    if (!filePath) {
      return res.status(400).json({ message: "filePath is required" });
    }

    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerRegex = flexibleIdentityRegex(owner);
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
        $or: [{ name: repoRegex }, { repositoryName: repoRegex }]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    if (!(await canViewRepo(repo, req.authUser))) {
      return res.status(404).json({ message: "Repository not found" });
    }

    // 1. Find target file in repo.files metadata
    const targetFile = (repo.files || []).find(
      (f) => f.path === filePath || f.b2FileName === filePath || (f.path && f.path.toLowerCase().endsWith(filePath.toLowerCase()))
    );

    // 2. Check if file text content is stored directly in MongoDB document
    if (targetFile && targetFile.content) {
      return res.status(200).json({ content: targetFile.content, filePath });
    }

    // 3. Check local disk storagePath
    if (repo.storagePath) {
      const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
      const fullPath = path.resolve(repo.storagePath, safePath);

      if (fullPath.startsWith(path.resolve(repo.storagePath))) {
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          return res.status(200).json({ content, filePath });
        } catch (err) {
          // File not found locally
        }
      }
    }

    // 4. Try Backblaze B2 download using b2.downloadFileByName
    if (targetFile?.b2FileName || targetFile?.b2Url) {
      try {
        await authorizeB2();
        const bucketName = process.env.B2_BUCKET_NAME || "GitRepo";
        const fileNameToFetch = targetFile.b2FileName || targetFile.path;

        const b2Response = await b2.downloadFileByName({
          bucketName: bucketName,
          fileName: fileNameToFetch,
          responseType: "text"
        });

        if (b2Response && b2Response.data) {
          const content = typeof b2Response.data === "string" ? b2Response.data : JSON.stringify(b2Response.data, null, 2);
          return res.status(200).json({ content, filePath });
        }
      } catch (b2Err) {
        console.warn("b2.downloadFileByName notice:", b2Err.message);

        if (targetFile?.b2Url) {
          try {
            const rawRes = await fetch(targetFile.b2Url);
            if (rawRes.ok) {
              const content = await rawRes.text();
              return res.status(200).json({ content, filePath });
            }
          } catch (_) {}
        }
      }
    }

    // 5. Default Fallbacks for common repository files (.gitignore, README.md, etc.)
    const cleanFileName = filePath.toLowerCase().split("/").pop();
    if (cleanFileName === ".gitignore") {
      const defaultGitignore = `# Node dependencies\nnode_modules/\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\n\n# Environment variables\n.env\n.env.local\n.env.development.local\n.env.production.local\n\n# Build outputs\ndist/\nbuild/\n*.log`;
      return res.status(200).json({ content: defaultGitignore, filePath });
    }

    if (cleanFileName === "readme.md" || cleanFileName === "readme") {
      const defaultReadme = `# ${repo.name || repo.repositoryName}\n\n${repo.description || "Welcome to your repository on GitRepo."}\n\n## Getting Started\n\n- Main Branch: \`${repo.defaultBranch || "main"}\`\n- Visibility: \`${repo.visibility || "public"}\``;
      return res.status(200).json({ content: defaultReadme, filePath });
    }

    if (targetFile) {
      return res.status(200).json({
        content: `// File: ${targetFile.path || filePath}\n// Size: ${targetFile.size || 0} bytes\n// Status: Registered in repository metadata.`,
        filePath
      });
    }

    return res.status(404).json({ message: "File content not found or unreadable." });
  } catch (error) {
    console.error("Error reading file content:", error);
    res.status(500).json({ message: "Error reading file content: " + error.message });
  }
});

// GET /api/repos/find/:owner/:repoName/file-download - Download a repository file without text conversion
router.get("/find/:owner/:repoName/file-download", requireRepoAccess, async (req, res) => {
  try {
    const requestedPath = typeof req.query.filePath === "string" ? req.query.filePath.trim() : "";
    if (!requestedPath) {
      return res.status(400).json({ message: "filePath is required" });
    }

    const repo = req.repo;
    const targetFile = (repo.files || []).find(
      (file) => file.path === requestedPath || file.b2FileName === requestedPath
    );
    if (!targetFile) {
      return res.status(404).json({ message: "File not found in repository." });
    }

    let fileBuffer = null;
    if (typeof targetFile.content === "string") {
      fileBuffer = Buffer.from(targetFile.content, "utf8");
    }

    if (!fileBuffer && targetFile.b2FileName) {
      try {
        await authorizeB2();
        const bucketName = process.env.B2_BUCKET_NAME || "GitRepo";
        const b2Response = await b2.downloadFileByName({
          bucketName,
          fileName: targetFile.b2FileName,
          responseType: "arraybuffer",
        });
        if (b2Response?.data) fileBuffer = Buffer.from(b2Response.data);
      } catch (b2Error) {
        console.warn("B2 file download notice:", b2Error.message);
      }
    }

    if (!fileBuffer && targetFile.b2Url) {
      try {
        const response = await fetch(targetFile.b2Url);
        if (response.ok) fileBuffer = Buffer.from(await response.arrayBuffer());
      } catch (downloadError) {
        console.warn("Public file download notice:", downloadError.message);
      }
    }

    if (!fileBuffer && repo.storagePath && targetFile.path) {
      const basePath = path.resolve(repo.storagePath);
      const fullPath = path.resolve(basePath, targetFile.path);
      const relativePath = path.relative(basePath, fullPath);
      if (relativePath && !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath)) {
        try {
          fileBuffer = await fs.readFile(fullPath);
        } catch (_) {}
      }
    }

    if (!fileBuffer) {
      return res.status(404).json({ message: "File data is unavailable for download." });
    }

    const fileName = path.basename(targetFile.path || requestedPath);
    res.type(targetFile.contentType || "application/octet-stream");
    res.attachment(fileName);
    return res.status(200).send(fileBuffer);
  } catch (error) {
    console.error("Error downloading repository file:", error);
    return res.status(500).json({ message: "Error downloading file: " + error.message });
  }
});

// PUT /api/repos/find/:owner/:repoName/file-content - Edit file content and commit changes
router.put("/find/:owner/:repoName/file-content", requireAuth, requireRepoOwner, async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { filePath, content, message } = req.body || {};
    const trimmedPath = typeof filePath === "string" ? filePath.trim() : "";
    const commitMessage = (typeof message === "string" ? message : "").trim() || "Update file via editor";

    if (!trimmedPath) {
      return res.status(400).json({ message: "filePath is required" });
    }
    if (typeof content !== "string") {
      return res.status(400).json({ message: "content must be a string" });
    }

    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerRegex = flexibleIdentityRegex(owner);
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
        $or: [{ name: repoRegex }, { repositoryName: repoRegex }]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found" });
    }

    const targetFile = (repo.files || []).find(
      (f) => f.path === trimmedPath || f.b2FileName === trimmedPath || (f.path && f.path.toLowerCase().endsWith(trimmedPath.toLowerCase()))
    );

    if (!targetFile) {
      return res.status(404).json({ message: "File not found in repository." });
    }

    // 1. Always persist the latest content in MongoDB so reads return the edited version
    const byteLength = Buffer.byteLength(content, "utf-8");
    targetFile.content = content;
    targetFile.size = byteLength;

    // 2. Overwrite the object on Backblaze B2 (keeps the same fileName)
    if (targetFile.b2FileName) {
      try {
        await authorizeB2();
        const bucketName = process.env.B2_BUCKET_NAME || "GitRepo";
        const bucketRes = await b2.getBucket({ bucketName });
        const bucketId = bucketRes.data?.buckets?.[0]?.bucketId;
        if (bucketId) {
          const uploadUrlRes = await b2.getUploadUrl({ bucketId });
          const { uploadUrl, authorizationToken } = uploadUrlRes.data;
          await b2.uploadFile({
            uploadUrl,
            uploadAuthToken: authorizationToken,
            fileName: targetFile.b2FileName,
            data: Buffer.from(content, "utf-8"),
          });
          targetFile.b2Url = `https://f000.backblazeb2.com/file/${bucketName}/${targetFile.b2FileName}`;
        }
      } catch (b2Err) {
        console.warn("B2 update skipped:", b2Err.message);
      }
    }

    // 3. If the repo has a local git checkout, write the file and create a real commit
    let commitHash;
    if (repo.storagePath) {
      try {
        const result = await commitFileChange(repo.storagePath, targetFile.path || trimmedPath, content, commitMessage);
        commitHash = result.hash;
        repo.lastCommit = {
          hash: result.hash,
          message: commitMessage,
          branch: repo.defaultBranch || "main",
          committedAt: result.committedAt
        };
      } catch (gitErr) {
        console.warn("Local git commit skipped:", gitErr.message);
      }
    }

    repo.commits = (repo.commits || 0) + 1;
    repo.lastCommit = repo.lastCommit || {
      hash: commitHash || Math.random().toString(36).substring(2, 9),
      message: commitMessage,
      branch: repo.defaultBranch || "main",
      committedAt: new Date()
    };

    await repo.save();

    res.status(200).json({
      message: "File updated and committed successfully.",
      repo
    });
  } catch (error) {
    console.error("Error updating file content:", error);
    res.status(500).json({ message: "Error updating file content: " + error.message });
  }
});

// PUT /api/repos/find/:owner/:repoName/settings - Update repo settings (Name, Visibility, Group, Description)
router.put("/find/:owner/:repoName/settings", requireAuth, requireRepoOwner, async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { newName, visibility, groupId, description } = req.body;

    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerRegex = flexibleIdentityRegex(owner);
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
        $or: [{ name: repoRegex }, { repositoryName: repoRegex }]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    const visibilityByName = new Map([
      ["public", "public"],
      ["private", "private"],
      ["team member", "Team Member"],
    ]);
    const nextVisibility = visibilityByName.get(String(visibility ?? repo.visibility ?? "public").trim().toLowerCase());
    if (!nextVisibility) {
      return res.status(400).json({ message: "Choose Public, Private, or Team Member visibility." });
    }

    const currentVisibility = String(repo.visibility || "public").trim().toLowerCase();
    if (currentVisibility !== "public" && nextVisibility === "public") {
      return res.status(403).json({
        message: "A private or team-only repository cannot be changed back to public.",
      });
    }

    let nextGroup = null;
    if (nextVisibility === "Team Member") {
      const requestedGroupId = String(groupId ?? repo.group?._id ?? repo.groupId ?? "").trim();
      if (!requestedGroupId) {
        return res.status(400).json({ message: "Select a group for Team Member visibility." });
      }

      nextGroup = await Group.findById(requestedGroupId).catch(() => null);
      if (!nextGroup) {
        return res.status(400).json({ message: "The selected group could not be found. Choose another group." });
      }

      const usernameMatches = (value) => String(value || "").trim().toLowerCase() === req.authUser.username.toLowerCase();
      const emailMatches = (value) => String(value || "").trim().toLowerCase() === req.authUser.gmail.toLowerCase();
      const canUseGroup = usernameMatches(nextGroup.creator) || emailMatches(nextGroup.creatorEmail) ||
        nextGroup.members.some((member) => member.status === "accepted" &&
          (usernameMatches(member.username) || emailMatches(member.email)));
      if (!canUseGroup) {
        return res.status(403).json({ message: "You must be a verified member of the selected group." });
      }
    }

    // Rename check
    if (newName && newName.trim().toLowerCase() !== repo.name.toLowerCase()) {
      const trimmedNewName = newName.trim();
      const existing = await Repo.findOne({
        $or: [
          { name: new RegExp(`^${escapeRegex(trimmedNewName)}$`, "i") },
          { repositoryName: new RegExp(`^${escapeRegex(trimmedNewName)}$`, "i") }
        ],
        _id: { $ne: repo._id }
      });

      if (existing) {
        return res.status(409).json({ message: "A repository with that name already exists." });
      }

      repo.name = trimmedNewName;
      repo.repositoryName = trimmedNewName;
    }

    if (description !== undefined) {
      repo.description = description.trim();
    }

    repo.visibility = nextVisibility;

    const previousGroupId = repo.group?._id?.toString() || repo.group?.toString() || repo.groupId;
    const nextGroupId = nextGroup?._id.toString() || "";
    if (previousGroupId && previousGroupId !== nextGroupId) {
      await Group.findByIdAndUpdate(previousGroupId, { $pull: { repositories: repo._id } });
    }

    if (nextGroup) {
      repo.group = nextGroup._id;
      repo.groupId = nextGroupId;
      repo.groupName = nextGroup.name;
      await Group.findByIdAndUpdate(nextGroup._id, { $addToSet: { repositories: repo._id } });
    } else {
      repo.group = null;
      repo.groupId = "";
      repo.groupName = "";
    }

    await repo.save();
    res.status(200).json({ message: "Repository settings updated successfully.", repo });
  } catch (error) {
    console.error("Error updating repository settings:", error);
    res.status(500).json({ message: "Error updating repository settings: " + error.message });
  }
});

// DELETE /api/repos/find/:owner/:repoName - Delete repository
router.delete("/find/:owner/:repoName", requireAuth, requireRepoOwner, async (req, res) => {
  try {
    const { owner, repoName } = req.params;

    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerRegex = flexibleIdentityRegex(owner);
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
        $or: [{ name: repoRegex }, { repositoryName: repoRegex }]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    // Remove from group if associated
    if (repo.group) {
      await Group.findByIdAndUpdate(repo.group, {
        $pull: { repositories: repo._id }
      });
    }

    await Repo.findByIdAndDelete(repo._id);
    res.status(200).json({ message: "Repository deleted successfully." });
  } catch (error) {
    console.error("Error deleting repository:", error);
    res.status(500).json({ message: "Error deleting repository: " + error.message });
  }
});

// POST /api/repos/find/:owner/:repoName/revert - Revert repository to a specific commit & push to main
router.post("/find/:owner/:repoName/revert", requireAuth, requireRepoOwner, async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { commitHash, author } = req.body;

    if (!commitHash) {
      return res.status(400).json({ message: "Commit hash is required to revert changes." });
    }

    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerRegex = flexibleIdentityRegex(owner);
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
        $or: [{ name: repoRegex }, { repositoryName: repoRegex }]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    // Find targeted commit in history or generate snapshot
    const targetCommit = (repo.commitHistory || []).find((c) => c.hash === commitHash);

    // Create a new revert commit
    const newRevertHash = Math.random().toString(36).substring(2, 9);
    const revertMsg = `Revert to commit ${commitHash.slice(0, 7)}: ${targetCommit?.message || "Restored previous state"}`;
    const newCommitObj = {
      hash: newRevertHash,
      message: revertMsg,
      branch: repo.defaultBranch || "main",
      author: author || owner || "Developer",
      committedAt: new Date()
    };

    if (targetCommit?.snapshotFiles && Array.isArray(targetCommit.snapshotFiles)) {
      repo.files = targetCommit.snapshotFiles;
    }

    repo.commits = (repo.commits || 0) + 1;
    repo.lastCommit = {
      hash: newRevertHash,
      message: revertMsg,
      branch: repo.defaultBranch || "main",
      committedAt: new Date()
    };

    repo.commitHistory = repo.commitHistory || [];
    repo.commitHistory.unshift({
      ...newCommitObj,
      snapshotFiles: repo.files
    });

    await repo.save();

    res.status(200).json({
      message: `Successfully reverted repository to ${commitHash.slice(0, 7)} and pushed to ${repo.defaultBranch || "main"}.`,
      repo
    });
  } catch (error) {
    console.error("Error reverting repository:", error);
    res.status(500).json({ message: "Error reverting repository: " + error.message });
  }
});

// POST /api/repos/find/:owner/:repoName/report - Report repository with reason
router.post("/find/:owner/:repoName/report", requireRepoAccess, async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { reason, reportedBy, reporterEmail } = req.body || {};

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: "Reason for report is required." });
    }

    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerRegex = flexibleIdentityRegex(owner);
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
        $or: [{ name: repoRegex }, { repositoryName: repoRegex }]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    repo.reports = repo.reports || [];
    repo.reports.push({
      reportedBy: reportedBy || "Anonymous User",
      reporterEmail: reporterEmail || "",
      reason: reason.trim(),
      reportedAt: new Date()
    });

    await repo.save();
    res.status(200).json({ message: "Repository has been reported successfully to administrators.", repo });
  } catch (error) {
    console.error("Error reporting repository:", error);
    res.status(500).json({ message: "Error reporting repository: " + error.message });
  }
});

// POST /api/repos/find/:owner/:repoName/issues - Raise an issue for a repo (sent to the owner/team)
router.post("/find/:owner/:repoName/issues", requireRepoAccess, async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { title, description, author, reporterUserId } = req.body || {};

    if (!title || !title.trim() || !description || !description.trim() || !author || !author.trim()) {
      return res.status(400).json({ message: "Title, description, and author are required." });
    }

    const ownerRegex = flexibleIdentityRegex(owner);
    const repoRegex = new RegExp(`^${escapeRegex(repoName.trim())}$`, "i");
    const ownerConditions = ownerRegex ? [{ owner: ownerRegex }] : [];
    const matchingUser = ownerRegex ? await User.findOne({ username: ownerRegex }).select("gmail username") : null;
    if (matchingUser?.gmail) {
      ownerConditions.push({ ownerEmail: new RegExp(`^${escapeRegex(matchingUser.gmail)}$`, "i") });
    }

    let repo = await Repo.findOne({
      $and: [
        { $or: ownerConditions.length ? ownerConditions : [{ owner: new RegExp(`^${escapeRegex(owner)}$`, "i") }] },
        { $or: [{ name: repoRegex }, { repositoryName: repoRegex }] }
      ]
    });

    if (!repo) {
      repo = await Repo.findOne({
        $or: [{ name: repoRegex }, { repositoryName: repoRegex }]
      });
    }

    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    // Resolve the registered owner/team user so the issue lands on their Issues page
    let ownerUser = matchingUser;
    if (!ownerUser && repo.ownerEmail) {
      ownerUser = await User.findOne({ gmail: new RegExp(`^${escapeRegex(repo.ownerEmail)}$`, "i") }).select("gmail username");
    }
    if (!ownerUser) {
      ownerUser = await User.findOne({ username: new RegExp(`^${escapeRegex(repo.owner)}$`, "i") }).select("gmail username");
    }

    const assignedUserId =
      (ownerUser && ownerUser._id) ||
      (reporterUserId && mongoose.isValidObjectId(reporterUserId) ? reporterUserId : null);

    if (!assignedUserId) {
      return res.status(400).json({ message: "Could not determine the repository owner to assign this issue." });
    }

    const newIssue = new Issue({
      title: title.trim(),
      description: description.trim(),
      author: author.trim(),
      userId: assignedUserId,
      repository: repo.name || repo.repositoryName,
      repositoryOwner: repo.owner || owner,
    });

    await newIssue.save();
    res.status(201).json(newIssue);
  } catch (error) {
    console.error("Error creating repository issue:", error);
    res.status(500).json({ message: "Error creating repository issue: " + error.message });
  }
});

// POST /api/repos/find/:owner/:repoName/merge - Analyze pulling a source branch into the target branch
router.post("/find/:owner/:repoName/merge", requireAuth, requireRepoOwner, async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { sourceBranch, targetBranch } = req.body || {};

    const repo = await resolveRepoByOwnerName(owner, repoName);
    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    const defaultBranch = repo.defaultBranch || "main";
    const target = (typeof targetBranch === "string" && targetBranch.trim()) ? targetBranch.trim() : defaultBranch;
    const source = (typeof sourceBranch === "string" && sourceBranch.trim()) ? sourceBranch.trim() : "";

    if (!source) {
      return res.status(400).json({ message: "Source branch is required." });
    }
    if (source.toLowerCase() === target.toLowerCase()) {
      return res.status(400).json({ message: "Source and target branches must be different." });
    }

    const branches = repo.branches && repo.branches.length ? repo.branches : [defaultBranch];
    if (!branches.some((b) => b.toLowerCase() === source.toLowerCase())) {
      return res.status(404).json({ message: `Source branch "${source}" not found.` });
    }
    if (!branches.some((b) => b.toLowerCase() === target.toLowerCase())) {
      return res.status(404).json({ message: `Target branch "${target}" not found.` });
    }

    const { targetMap, sourceMap } = buildBranchFileMaps(repo, target, source);
    const allPaths = new Set([...targetMap.keys(), ...sourceMap.keys()]);

    const conflicts = [];
    const addedFiles = [];
    let identicalCount = 0;

    for (const p of allPaths) {
      const t = targetMap.get(p);
      const s = sourceMap.get(p);
      if (!t) {
        addedFiles.push(p);
        continue;
      }
      if (!s) {
        identicalCount++;
        continue;
      }
      const ours = await fetchFileText(repo, t);
      const theirs = await fetchFileText(repo, s);
      if (isConflictedContent(ours, theirs, t.size, s.size)) {
        conflicts.push({ path: p, ours, theirs, ourSize: t.size || 0, theirSize: s.size || 0 });
      } else {
        identicalCount++;
      }
    }

    res.status(200).json({
      sourceBranch: source,
      targetBranch: target,
      conflicts,
      addedFiles,
      identicalCount,
      conflictCount: conflicts.length,
      addedCount: addedFiles.length,
      message: conflicts.length
        ? `${conflicts.length} file(s) have merge conflicts. Choose how to resolve each one to complete the merge.`
        : addedFiles.length
          ? `Ready to merge: ${addedFiles.length} new file(s) from "${source}" will be added to "${target}".`
          : `Branches "${source}" and "${target}" are already in sync with no changes to merge.`
    });
  } catch (error) {
    console.error("Error merging branches:", error);
    res.status(500).json({ message: "Error merging branches: " + error.message });
  }
});

// POST /api/repos/find/:owner/:repoName/merge/resolve - Apply conflict resolutions and complete the merge
router.post("/find/:owner/:repoName/merge/resolve", requireAuth, requireRepoOwner, async (req, res) => {
  try {
    const { owner, repoName } = req.params;
    const { sourceBranch, targetBranch, resolutions } = req.body || {};

    const repo = await resolveRepoByOwnerName(owner, repoName);
    if (!repo) {
      return res.status(404).json({ message: "Repository not found." });
    }

    const defaultBranch = repo.defaultBranch || "main";
    const target = (typeof targetBranch === "string" && targetBranch.trim()) ? targetBranch.trim() : defaultBranch;
    const source = (typeof sourceBranch === "string" && sourceBranch.trim()) ? sourceBranch.trim() : "";

    if (!source || source.toLowerCase() === target.toLowerCase()) {
      return res.status(400).json({ message: "A valid source branch different from the target is required." });
    }

    const resolutionMap = new Map();
    for (const r of Array.isArray(resolutions) ? resolutions : []) {
      if (r && r.path && ["ours", "theirs", "combine"].includes(r.strategy)) {
        resolutionMap.set(r.path, r.strategy);
      }
    }

    const { targetMap, sourceMap } = buildBranchFileMaps(repo, target, source);
    const allPaths = new Set([...targetMap.keys(), ...sourceMap.keys()]);

    let addedCount = 0;
    let conflictedCount = 0;
    const resolvedPaths = [];

    for (const p of allPaths) {
      const t = targetMap.get(p);
      const s = sourceMap.get(p);

      if (!t) {
        const copy = { ...s, branch: target };
        copy.content = typeof s.content === "string" ? s.content : (await fetchFileText(repo, s)) || "";
        copy.size = copy.content ? Buffer.byteLength(copy.content, "utf-8") : (s.size || 0);
        repo.files.push(copy);
        resolvedPaths.push(p);
        addedCount++;
        continue;
      }
      if (!s) continue;

      const theirs = await fetchFileText(repo, s);
      const ours = typeof t.content === "string" && t.content.length ? t.content : await fetchFileText(repo, t);

      if (!isConflictedContent(ours, theirs, t.size, s.size)) continue;

      const strategy = resolutionMap.get(p) || "ours";
      let finalContent = ours;
      if (strategy === "theirs") {
        finalContent = theirs;
      } else if (strategy === "combine") {
        finalContent = `${ours || ""}${theirs ? `\n${theirs}` : ""}`;
      }

      t.content = finalContent || "";
      t.size = finalContent ? Buffer.byteLength(finalContent, "utf-8") : 0;
      resolvedPaths.push(p);
      conflictedCount++;
    }

    if (resolvedPaths.length === 0) {
      return res.status(200).json({
        message: `Branches "${source}" and "${target}" are already in sync. No merge needed.`,
        repo
      });
    }

    const mergeHash = Math.random().toString(36).substring(2, 9);
    const mergeMsg = `Merge branch '${source}' into '${target}'`;

    repo.commits = (repo.commits || 0) + 1;
    repo.lastCommit = { hash: mergeHash, message: mergeMsg, branch: target, committedAt: new Date() };
    repo.commitHistory = repo.commitHistory || [];
    repo.commitHistory.unshift({
      hash: mergeHash,
      message: mergeMsg,
      branch: target,
      author: repo.owner || "Developer",
      committedAt: new Date(),
      snapshotFiles: JSON.parse(JSON.stringify(repo.files || []))
    });

    await repo.save();

    res.status(200).json({
      message: `Merged branch '${source}' into '${target}'. ${addedCount} file(s) added, ${conflictedCount} conflict(s) resolved into '${target}'.`,
      repo
    });
  } catch (error) {
    console.error("Error resolving branch merge:", error);
    res.status(500).json({ message: "Error resolving merge: " + error.message });
  }
});

module.exports = router;
