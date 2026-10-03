import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import JSZip from "jszip";
import User_header from "./User_header";
import defaultProfile from "./assert/profile.png";
import NotFound from "./NotFound";
import "./style/GitHubRepo.css";
import { useLoading } from "../context/LoadingContext";
import { apiFetch } from "../auth/apiFetch";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

const GRAPH_BRANCH_COLORS = ["#0098ff", "#21ba45", "#d29922", "#bc8cff", "#f778ba", "#f85149", "#39c5cf"];

function getCommitTooltip(commit, olderCommit, ownerName, defaultBranch) {
  const date = commit.committedAt ? new Date(commit.committedAt).toLocaleString() : "Recently";
  const details = [
    commit.message || "Commit update",
    `Author: ${commit.author || ownerName}`,
    `When: ${date}`,
    `Branch: ${commit.branch || defaultBranch || "main"}`,
  ];

  if (!Array.isArray(commit.snapshotFiles)) {
    details.push("Files changed: unavailable");
    return details.join("\n");
  }

  if (!Array.isArray(olderCommit?.snapshotFiles)) {
    details.push(`Files in snapshot: ${commit.snapshotFiles.length}`);
    return details.join("\n");
  }

  const before = new Map(olderCommit.snapshotFiles.map((file) => [file.path, file]));
  const after = new Map(commit.snapshotFiles.map((file) => [file.path, file]));
  const changedFiles = [];

  for (const [filePath, file] of after) {
    const previous = before.get(filePath);
    if (!previous || previous.size !== file.size || previous.content !== file.content) {
      changedFiles.push(filePath);
    }
  }
  for (const filePath of before.keys()) {
    if (!after.has(filePath)) changedFiles.push(`${filePath} (deleted)`);
  }

  details.push(
    changedFiles.length
      ? `Files changed: ${changedFiles.slice(0, 8).join(", ")}${changedFiles.length > 8 ? `, +${changedFiles.length - 8} more` : ""}`
      : "Files changed: none detected"
  );
  return details.join("\n");
}

function getFileCommitMessage(file, history, defaultBranch) {
  const filePath = file.path || file.b2FileName;
  const fileBranch = String(file.branch || defaultBranch || "main").toLowerCase();
  const findSnapshot = (snapshot) => snapshot.find((entry) =>
    (entry.path || entry.b2FileName) === filePath &&
    String(entry.branch || defaultBranch || "main").toLowerCase() === fileBranch
  );

  for (let index = 0; index < history.length; index++) {
    const currentSnapshot = history[index].snapshotFiles;
    if (!Array.isArray(currentSnapshot)) continue;

    const currentFile = findSnapshot(currentSnapshot);
    if (!currentFile) continue;

    const olderSnapshot = history[index + 1]?.snapshotFiles;
    const olderFile = Array.isArray(olderSnapshot) ? findSnapshot(olderSnapshot) : null;
    const changed = !olderFile || ["size", "content", "contentType", "b2FileName", "b2Url"]
      .some((key) => currentFile[key] !== olderFile[key]);

    if (changed) return history[index].message || "File updated";
  }

  return "Repository file";
}

async function extractFilesFromDataTransfer(dataTransfer) {
  const files = [];

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const items = Array.from(dataTransfer.items);
    const queue = [];

    for (const item of items) {
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          queue.push({ entry, path: "" });
        } else {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    async function readEntry({ entry, path }) {
      if (!entry) return;
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file(
            (file) => {
              if (file) {
                const fullRelativePath = path ? `${path}${file.name}` : file.name;
                try {
                  Object.defineProperty(file, "webkitRelativePath", {
                    value: fullRelativePath,
                    writable: false,
                    configurable: true
                  });
                } catch (_) {}
                files.push(file);
              }
              resolve();
            },
            (err) => {
              console.warn("Could not read file entry:", err);
              resolve();
            }
          );
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        return new Promise((resolve) => {
          const readEntries = () => {
            dirReader.readEntries(
              async (entries) => {
                if (!entries || entries.length === 0) {
                  resolve();
                } else {
                  for (const childEntry of entries) {
                    await readEntry({ entry: childEntry, path: `${path}${entry.name}/` });
                  }
                  readEntries();
                }
              },
              () => resolve()
            );
          };
          readEntries();
        });
      }
    }

    for (const item of queue) {
      await readEntry(item);
    }
  } else if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      if (file && file.name) files.push(file);
    }
  }

  return files.filter((f) => f && f.name && typeof f.size === "number");
}

const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".env",
  ".env.local",
  ".ds_store",
  "dist",
  "build",
  "coverage",
  "*.log"
];

function escapeRegexChar(char) {
  return char.replace(/[.+^${}()|]/g, "\\$&");
}

function globToRegexStr(pattern) {
  let re = "";
  let i = 0;
  const s = pattern;
  while (i < s.length) {
    const c = s[i];
    if (c === "*") {
      if (s[i + 1] === "*") {
        if (s[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else if (c === "[") {
      const close = s.indexOf("]", i + 1);
      if (close === -1) {
        re += "\\[";
        i += 1;
      } else {
        const cls = s.slice(i + 1, close).replace(/\\/g, "\\\\").replace(/\//g, "\\/");
        re += `[${cls}]`;
        i = close + 1;
      }
    } else if (c === "\\") {
      re += `\\${s[i + 1] || ""}`;
      i += 2;
    } else {
      re += escapeRegexChar(c);
      i += 1;
    }
  }
  return re;
}

function parseGitignore(content) {
  const rules = [];
  const lines = String(content || "").replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const rawLine of lines) {
    let line = rawLine.replace(/\s+$/, "");
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("\\#")) line = line.slice(1);
    if (line.startsWith("\\!")) line = line.slice(1);

    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    if (!line) continue;

    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }

    let anchored = false;
    if (line.startsWith("/")) {
      anchored = true;
      line = line.slice(1);
    }

    if (!line) continue;

    const baseNameOnly = !anchored && !line.includes("/");
    rules.push({
      line,
      negated,
      dirOnly,
      anchored,
      baseNameOnly,
      regex: new RegExp(`^${globToRegexStr(line)}$`)
    });
  }

  return rules;
}

function isGitignoreFile(relPath) {
  const norm = String(relPath || "").replace(/\\/g, "/").toLowerCase();
  return norm === ".gitignore" || norm.endsWith("/.gitignore");
}

function patternMatches(rule, relPath) {
  const normPath = String(relPath || "").replace(/\\/g, "/").toLowerCase();
  const normLine = rule.line.toLowerCase();
  const segments = normPath.split("/");
  const basename = segments[segments.length - 1];

  if (rule.baseNameOnly || rule.dirOnly) {
    if (segments.some((segment) => rule.regex.test(segment) || segment === normLine)) {
      return true;
    }
  }

  for (let i = 0; i < segments.length; i++) {
    const subPath = segments.slice(i).join("/");
    if (subPath === normLine || subPath.startsWith(`${normLine}/`)) {
      return true;
    }
    if (rule.regex.test(subPath)) {
      return true;
    }
  }

  return false;
}

function isIgnoredPath(relPath, customRules = []) {
  const normPath = String(relPath || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!normPath) return false;

  if (isGitignoreFile(normPath)) return false;

  const defaultRules = parseGitignore(DEFAULT_IGNORE_PATTERNS.join("\n"));
  const allRules = [...defaultRules, ...(Array.isArray(customRules) ? customRules : [])];

  let ignored = false;
  for (const rule of allRules) {
    if (patternMatches(rule, normPath)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

async function filterFilesWithGitignore(files) {
  let gitignoreContent = "";

  for (const file of files) {
    const relPath = file.webkitRelativePath || file.name || "";
    if (isGitignoreFile(relPath)) {
      try {
        const text = await file.text();
        gitignoreContent += "\n" + text;
      } catch (_) {}
    }
  }

  const customRules = parseGitignore(gitignoreContent);

  const filtered = files.filter((file) => {
    const relPath = file.webkitRelativePath || file.name || "";
    if (isGitignoreFile(relPath)) return true;
    return !isIgnoredPath(relPath, customRules);
  });

  // If all filtered files share the same top-level dropped folder prefix (e.g., "temp/"),
  // strip the top wrapper folder prefix so the project files sit directly at the repository root.
  if (filtered.length > 0) {
    const samplePath = String(filtered[0].webkitRelativePath || filtered[0].name || "").replace(/\\/g, "/");
    if (samplePath.includes("/")) {
      const firstSegment = samplePath.split("/")[0] + "/";
      const allSharePrefix = filtered.every((f) => {
        const p = String(f.webkitRelativePath || f.name || "").replace(/\\/g, "/");
        return p.startsWith(firstSegment);
      });

      if (allSharePrefix) {
        filtered.forEach((f) => {
          const p = String(f.webkitRelativePath || f.name || "").replace(/\\/g, "/");
          const clean = p.slice(firstSegment.length);
          Object.defineProperty(f, "cleanPath", { value: clean, writable: true, configurable: true });
        });
      }
    }
  }

  return filtered;
}

const RESERVED_KEYWORDS = [
  "login",
  "admin",
  "dashboard",
  "repository",
  "teams",
  "stars",
  "issue",
  "forgotpassword",
  "all_repository",
  "user_profile",
  "user"
];

function RepoDetail() {
  const { username, repoName } = useParams();
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();

  const [repo, setRepo] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedFileForPreview, setSelectedFileForPreview] = useState(null);
  const [fileContent, setFileContent] = useState("");
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [fileContentError, setFileContentError] = useState("");
  const [downloadingFile, setDownloadingFile] = useState(false);

  // Commit Graph & Revert States
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [reverting, setReverting] = useState(false);
  const [revertMessage, setRevertMessage] = useState("");
  const [revertError, setRevertError] = useState(false);

  // Interactive UI States
  const [activeTab, setActiveTab] = useState("code");
  const [graphBranchFilter, setGraphBranchFilter] = useState("all");
  const [isStarred, setIsStarred] = useState(false);
  const [starCount, setStarCount] = useState(0);
  const [showCodeDropdown, setShowCodeDropdown] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Settings Form States
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    visibility: "public",
    groupId: "",
    description: ""
  });
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsError, setSettingsError] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingRepo, setDeletingRepo] = useState(false);

  // File Upload & Drag and Drop States
  const [filesToUpload, setFilesToUpload] = useState([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  // Report Modal States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState(false);

  // Issue Modal States
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [issueMessage, setIssueMessage] = useState("");
  const [issueError, setIssueError] = useState(false);
  const [openIssueCount, setOpenIssueCount] = useState(0);

  // Branch Management States
  const [selectedBranch, setSelectedBranch] = useState("");
  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false);
  const [newBranchInput, setNewBranchInput] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [branchError, setBranchError] = useState("");

  // Branch Merge (Pull) States
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSource, setMergeSource] = useState("");
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeMessage, setMergeMessage] = useState("");
  const [mergeError, setMergeError] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState([]);
  const [addedFilesList, setAddedFilesList] = useState([]);
  const [resolutions, setResolutions] = useState({});

  // Deployment Feature States
  const [deployments, setDeployments] = useState([]);
  const [activeDeployment, setActiveDeployment] = useState(null);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployCommitId, setDeployCommitId] = useState("");
  const [isStartingDeploy, setIsStartingDeploy] = useState(false);
  const [deployErrorMessage, setDeployErrorMessage] = useState("");
  const [showBuildLogs, setShowBuildLogs] = useState(false);
  const [deployEnvVars, setDeployEnvVars] = useState([{ name: "NODE_ENV", value: "production" }]);
  const [logContent, setLogContent] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const modalFileInputRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const loggedInUsername = localStorage.getItem("username") || currentUser.username || currentUser.name || "Developer";

  const isOwner = React.useMemo(() => {
    if (!repo) return false;
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const uName = localStorage.getItem("username") || user.username || user.name || "";
    const uEmail = user.gmail || user.email || "";

    const rOwner = repo.owner || "";
    const rEmail = repo.ownerEmail || "";

    const normalizeStr = (str) => String(str || "").trim().toLowerCase().replace(/[\s-_]+/g, "");

    if (rEmail && uEmail && normalizeStr(rEmail) === normalizeStr(uEmail)) return true;
    if (rOwner && uName && normalizeStr(rOwner) === normalizeStr(uName)) return true;
    if (rOwner && uEmail && normalizeStr(rOwner) === normalizeStr(uEmail)) return true;

    return false;
  }, [repo]);

  const fetchDeployments = async () => {
    if (!repo || !repo._id) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/deploy/repo/${repo._id}`);
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments || []);
      }
    } catch (err) {
      console.error("Error fetching deployments:", err);
    }
  };

  useEffect(() => {
    if (repo && repo._id) {
      fetchDeployments();
    }
  }, [repo]);

  // Poll active deployment if status is queued/downloading/building/starting
  useEffect(() => {
    if (!activeDeployment || !activeDeployment._id) return;
    const isFinished = ["live", "success", "failed", "stopped"].includes(activeDeployment.status);
    if (isFinished) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/deploy/${activeDeployment._id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.deployment) {
            setActiveDeployment(data.deployment);
            if (["live", "success", "failed", "stopped"].includes(data.deployment.status)) {
              fetchDeployments();
            }
          }
        }
      } catch (err) {
        console.error("Error polling deployment status:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeDeployment]);

  const handleAddEnvVar = () => {
    setDeployEnvVars((prev) => [...prev, { name: "", value: "" }]);
  };

  const handleUpdateEnvVar = (index, field, value) => {
    setDeployEnvVars((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveEnvVar = (index) => {
    setDeployEnvVars((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartDeployment = async () => {
    if (!repo || !repo._id) return;
    const targetCommit = deployCommitId || repo.lastCommit?.hash || (rawHistory && rawHistory[0] ? rawHistory[0].hash : "main");
    if (!targetCommit) {
      setDeployErrorMessage("No commit available to deploy.");
      return;
    }

    setIsStartingDeploy(true);
    setDeployErrorMessage("");

    const envObj = {};
    for (const item of deployEnvVars) {
      if (item.name && item.name.trim()) {
        envObj[item.name.trim()] = item.value || "";
      }
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/deploy/backend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryId: repo._id,
          commitId: targetCommit,
          environmentVariables: envObj,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to initiate backend deployment.");
      }

      setShowDeployModal(false);
      setActiveDeployment({ _id: data.deploymentId, status: "queued", commitId: targetCommit, projectName: data.projectName });
      setActiveTab("deploy");
      fetchDeployments();
    } catch (err) {
      setDeployErrorMessage(err.message || "Error starting deployment.");
    } finally {
      setIsStartingDeploy(false);
    }
  };

  const handleStopDeployment = async (depId) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/deploy/${depId}/stop`, { method: "POST" });
      if (res.ok) {
        fetchDeployments();
        if (activeDeployment && (activeDeployment._id === depId || activeDeployment.id === depId)) {
          setActiveDeployment((prev) => prev ? { ...prev, status: "stopped" } : null);
        }
      }
    } catch (err) {
      console.error("Error stopping deployment:", err);
    }
  };

  const handleRestartDeployment = async (depId) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/deploy/${depId}/restart`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        fetchDeployments();
        if (activeDeployment && (activeDeployment._id === depId || activeDeployment.id === depId)) {
          setActiveDeployment((prev) => prev ? { ...prev, status: data.status || "starting" } : null);
        }
      }
    } catch (err) {
      console.error("Error restarting deployment:", err);
    }
  };

  const handleRedeployDeployment = async (depId) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/deploy/${depId}/redeploy`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        fetchDeployments();
        setActiveDeployment({ _id: data.deploymentId, status: "queued" });
      }
    } catch (err) {
      console.error("Error triggering redeployment:", err);
    }
  };

  const handleFetchLogs = async (depId) => {
    setLogLoading(true);
    setShowBuildLogs(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/deploy/${depId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogContent(data.logs || []);
      }
    } catch (err) {
      console.error("Error fetching deployment logs:", err);
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    if (!username || !repoName || RESERVED_KEYWORDS.includes(username.toLowerCase())) {
      setNotFound(true);
      return;
    }

    async function loadRepoDetails() {
      try {
        startLoading();
        setNotFound(false);

        const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`);
        if (res.ok) {
          const data = await res.json();
          setRepo(data);
          setStarCount(data.stars || 0);
          setIsStarred(Boolean(data.starred));
          setSettingsForm({
            name: data.name || data.repositoryName || "",
            visibility: data.visibility || "public",
            groupId: data.groupId || (data.group ? (typeof data.group === "object" ? data.group._id : data.group) : ""),
            description: data.description || ""
          });

          // Fetch open issue count for the Issues button badge
          try {
            const issueRes = await fetch(`${API_BASE_URL}/api/issues?repository=${encodeURIComponent(data.name || data.repositoryName || repoName)}`);
            if (issueRes.ok) {
              const issueData = await issueRes.json();
              setOpenIssueCount(Array.isArray(issueData) ? issueData.filter((i) => i.status === "open").length : 0);
            }
          } catch (_) {}
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error("Error loading repository detail:", err);
        setNotFound(true);
      } finally {
        stopLoading();
      }
    }

    async function fetchUserGroups() {
      const storedEmail = currentUser.gmail || currentUser.email || "";
      if (!loggedInUsername && !storedEmail) return;

      try {
        const params = new URLSearchParams();
        if (loggedInUsername) params.append("username", loggedInUsername);
        if (storedEmail) params.append("email", storedEmail);
        const res = await fetch(`${API_BASE_URL}/api/groups/my-groups?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setUserGroups(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Error fetching user groups:", err);
      }
    }

    loadRepoDetails();
    fetchUserGroups();
  }, [username, repoName]);

  async function handleOpenFile(file) {
    setSelectedFileForPreview(file);
    setFileContent("");
    setFileContentLoading(true);
    setFileContentError("");

    const targetPath = file.path || file.b2FileName;

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/file-content?filePath=${encodeURIComponent(targetPath)}`);
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content || "");
      } else {
        const errData = await res.json().catch(() => ({}));
        setFileContentError(errData.message || "Unable to load file content.");
      }
    } catch (err) {
      console.error("Error fetching file content:", err);
      setFileContentError("Failed to fetch file content from server.");
    } finally {
      setFileContentLoading(false);
    }
  }

  async function handleDownloadPreviewFile() {
    if (!selectedFileForPreview || fileContentLoading || fileContentError || downloadingFile) return;

    setDownloadingFile(true);
    try {
      const filePath = selectedFileForPreview.path || selectedFileForPreview.b2FileName;
      const response = await apiFetch(
        `${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/file-download?filePath=${encodeURIComponent(filePath)}`
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Could not download this file.");
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = (selectedFileForPreview.path || filePath).split(/[\\/]/).filter(Boolean).pop() || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      setFileContentError(error.message || "Could not download this file.");
    } finally {
      setDownloadingFile(false);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    if (settingsForm.visibility === "Team Member" && !settingsForm.groupId) {
      setSettingsError(true);
      setSettingsMsg("Select a group before saving Team Member visibility.");
      return;
    }

    setSavingSettings(true);
    setSettingsMsg("");
    setSettingsError(false);

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newName: settingsForm.name,
          visibility: settingsForm.visibility,
          groupId: settingsForm.visibility === "Team Member" ? settingsForm.groupId : "",
          description: settingsForm.description
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setRepo(data.repo);
      setSettingsForm({
        name: data.repo.name || data.repo.repositoryName || "",
        visibility: data.repo.visibility || "public",
        groupId: data.repo.groupId || (data.repo.group?._id || data.repo.group || ""),
        description: data.repo.description || "",
      });
      setSettingsMsg("Repository settings saved successfully!");

      const newRepoName = data.repo.name || settingsForm.name;
      if (newRepoName.toLowerCase() !== repoName.toLowerCase()) {
        const ownerSlug = username.trim().replace(/\s+/g, "-").toLowerCase();
        navigate(`/${ownerSlug}/${encodeURIComponent(newRepoName)}`, { replace: true });
      }
    } catch (err) {
      console.error("Error saving repository settings:", err);
      setSettingsError(true);
      setSettingsMsg(err.message || "Failed to update repository settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleDeleteRepository() {
    setDeletingRepo(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`, {
        method: "DELETE"
      });

      if (res.ok) {
        navigate("/User", { replace: true });
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Failed to delete repository.");
        setDeletingRepo(false);
      }
    } catch (err) {
      console.error("Error deleting repository:", err);
      alert("Error deleting repository: " + err.message);
      setDeletingRepo(false);
    }
  }

  async function handleRevertCommit(commitHash) {
    setReverting(true);
    setRevertMessage("");
    setRevertError(false);

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitHash, author: loggedInUsername })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setRepo(data.repo);
      setRevertMessage(data.message || "Reverted changes successfully and pushed to main.");
      setTimeout(() => setSelectedCommit(null), 1800);
    } catch (err) {
      console.error("Revert error:", err);
      setRevertError(true);
      setRevertMessage(err.message || "Failed to revert commit.");
    } finally {
      setReverting(false);
    }
  }

  // Handle Drag & Drop events
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    try {
      const droppedFiles = await extractFilesFromDataTransfer(e.dataTransfer);
      if (droppedFiles && droppedFiles.length > 0) {
        const filteredFiles = await filterFilesWithGitignore(droppedFiles);
        if (filteredFiles && filteredFiles.length > 0) {
          setFilesToUpload(filteredFiles);
          setUploadMessage("");
          setUploadError(false);
          setCommitMessage(`Add ${filteredFiles.length} file(s) via upload`);
          setShowUploadModal(true);
        } else {
          setUploadError(true);
          setUploadMessage("All files in the dropped folder were ignored by .gitignore.");
        }
      }
    } catch (err) {
      console.error("Error extracting dropped files:", err);
      setUploadError(true);
      setUploadMessage("Could not read dropped files or folder.");
    }
  }

  async function handleFileSelectChange(e) {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const filteredFiles = await filterFilesWithGitignore(selectedFiles);
      if (filteredFiles && filteredFiles.length > 0) {
        setFilesToUpload(filteredFiles);
        setUploadMessage("");
        setUploadError(false);
        setCommitMessage(`Add ${filteredFiles.length} file(s) via upload`);
        setShowUploadModal(true);
      } else {
        setUploadError(true);
        setUploadMessage("All selected files were ignored by .gitignore.");
      }
    }
  }

  async function executeFileUpload(filesToSubmit, defaultMsg = "") {
    const filesArr = filesToSubmit || filesToUpload;
    if (!filesArr || filesArr.length === 0) {
      setUploadError(true);
      setUploadMessage("Please select or drop files to upload.");
      return;
    }

    const finalCommitMsg = (commitMessage || defaultMsg || "").trim();
    if (!finalCommitMsg) {
      setUploadError(true);
      setUploadMessage("Commit message is required so this commit can be recorded in the graph and reverted if needed.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadMessage("");
    setUploadError(false);

    try {
      const formData = new FormData();
      filesArr.forEach((file) => {
        const filePath = file.cleanPath || file.webkitRelativePath || file.name;
        formData.append("files", file, filePath);
      });
      formData.append("message", finalCommitMsg);
      formData.append("branch", selectedBranch || repo?.defaultBranch || "main");

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText || "{}");
              setRepo(data.repo);
              setFilesToUpload([]);
              setCommitMessage("");
              setUploadError(false);
              setUploadMessage(data.message || `Successfully uploaded ${filesArr.length} file(s) and recorded commit.`);
              setUploadProgress(100);
              setTimeout(() => {
                setShowUploadModal(false);
                setUploadProgress(0);
              }, 1500);
              resolve();
            } catch (err) {
              reject(new Error("Invalid server response format."));
            }
          } else {
            let data = {};
            try { data = JSON.parse(xhr.responseText); } catch (_) {}
            reject(new Error(data.message || `Upload failed with status code ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Upload failed. Please check network connection."));
        xhr.onabort = () => reject(new Error("Upload was aborted."));

        xhr.open("POST", `${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/upload`);
        const token = localStorage.getItem("authToken");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.send(formData);
      });
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError(true);
      setUploadMessage(error.message || "Upload failed. Please check network connection.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadZip() {
    if (!repoFiles || repoFiles.length === 0) {
      alert("No files in repository to download.");
      return;
    }
    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`${repoName || "repository"}-main`);

      for (const fileObj of repoFiles) {
        const filePath = fileObj.path || "file";
        if (typeof fileObj.content === "string") {
          folder.file(filePath, fileObj.content);
        } else if (fileObj.b2Url) {
          try {
            const resp = await fetch(fileObj.b2Url);
            const blob = await resp.blob();
            folder.file(filePath, blob);
          } catch {
            folder.file(filePath, `// File: ${filePath}`);
          }
        } else {
          try {
            const resp = await apiFetch(
              `${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/file-content?filePath=${encodeURIComponent(filePath)}`
            );
            if (resp.ok) {
              const data = await resp.json();
              folder.file(filePath, data.content || "");
            } else {
              folder.file(filePath, `// File: ${filePath}`);
            }
          } catch {
            folder.file(filePath, `// File: ${filePath}`);
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${repoName || "repository"}-main.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Error creating ZIP download:", err);
      alert("Error generating ZIP download: " + err.message);
    } finally {
      setDownloadingZip(false);
    }
  }

  async function handleReportRepo(e) {
    e.preventDefault();
    if (!reportReason.trim()) {
      setReportError(true);
      setReportMessage("Please enter a valid reason for reporting this repository.");
      return;
    }

    setReporting(true);
    setReportMessage("");
    setReportError(false);

    try {
      const currentUserObj = JSON.parse(localStorage.getItem("user") || "{}");
      const reporterEmail = currentUserObj.gmail || currentUserObj.email || "";

      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reportReason.trim(),
          reportedBy: loggedInUsername,
          reporterEmail: reporterEmail
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReportError(false);
        setReportMessage(data.message || "Repository reported successfully.");
        setReportReason("");
        setTimeout(() => {
          setShowReportModal(false);
          setReportMessage("");
        }, 1800);
      } else {
        setReportError(true);
        setReportMessage(data.message || "Failed to report repository.");
      }
    } catch (err) {
      setReportError(true);
      setReportMessage("Error reporting repository: " + err.message);
    } finally {
      setReporting(false);
    }
  }

  async function handleCreateIssue(e) {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDescription.trim()) {
      setIssueError(true);
      setIssueMessage("Please enter both a title and a description for the issue.");
      return;
    }
    setCreatingIssue(true);
    setIssueMessage("");
    setIssueError(false);
    try {
      const currentUserObj = JSON.parse(localStorage.getItem("user") || "{}");
      const reporterUserId = localStorage.getItem("userId") || currentUserObj.id || "";
      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issueTitle.trim(),
          description: issueDescription.trim(),
          author: loggedInUsername,
          reporterUserId
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }
      setIssueError(false);
      setIssueMessage(`Issue #${data.number || ""} raised successfully. The repository owner/team has been notified.`);
      setIssueTitle("");
      setIssueDescription("");
      setOpenIssueCount((prev) => prev + 1);
      setTimeout(() => {
        setShowIssueModal(false);
        setIssueMessage("");
      }, 2400);
    } catch (err) {
      setIssueError(true);
      setIssueMessage(err.message || "Failed to create issue.");
    } finally {
      setCreatingIssue(false);
    }
  }

  async function handleCreateBranch(e) {
    e.preventDefault();
    const cleanName = newBranchInput.trim();
    if (!cleanName) {
      setBranchError("Branch name is required.");
      return;
    }
    setCreatingBranch(true);
    setBranchError("");

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchName: cleanName })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setRepo(data.repo);
      setSelectedBranch(cleanName);
      setNewBranchInput("");
      setBranchError("");
      setShowCreateBranchModal(false);
    } catch (err) {
      console.error("Create branch error:", err);
      setBranchError(err.message || "Failed to create branch.");
    } finally {
      setCreatingBranch(false);
    }
  }

  async function refreshRepoDetails() {
    const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`);
    if (res.ok) {
      const data = await res.json();
      setRepo(data);
    }
  }

  function openMergeModal() {
    setPendingConflicts([]);
    setAddedFilesList([]);
    setResolutions({});
    setMergeMessage("");
    setMergeError(false);
    const targetLabel = (repo.defaultBranch || "main").toLowerCase();
    const candidates = repoBranches.filter((b) => b.toLowerCase() !== targetLabel);
    setMergeSource(candidates[0] || repoBranches[0] || "");
    setShowMergeModal(true);
  }

  async function handleMergeBranches() {
    if (!mergeSource) return;
    setMergeLoading(true);
    setMergeMessage("");
    setMergeError(false);

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBranch: mergeSource, targetBranch: repo.defaultBranch || "main" })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setAddedFilesList(data.addedFiles || []);

      if (data.conflicts && data.conflicts.length > 0) {
        setPendingConflicts(data.conflicts);
        const defaults = {};
        data.conflicts.forEach((c) => { defaults[c.path] = "theirs"; });
        setResolutions(defaults);
      } else {
        setPendingConflicts([]);
        await runMergeResolution([]);
      }
    } catch (err) {
      console.error("Merge error:", err);
      setMergeError(true);
      setMergeMessage(err.message || "Merge failed.");
    } finally {
      setMergeLoading(false);
    }
  }

  async function runMergeResolution(resolutionList) {
    setMergeLoading(true);
    setMergeMessage("");
    setMergeError(false);

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/merge/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceBranch: mergeSource,
          targetBranch: repo.defaultBranch || "main",
          resolutions: resolutionList
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setPendingConflicts([]);
      setResolutions({});
      setMergeMessage(data.message || "Merge completed successfully.");
      await refreshRepoDetails();
      setTimeout(() => {
        setMergeMessage("");
        setShowMergeModal(false);
      }, 2600);
    } catch (err) {
      console.error("Resolve merge error:", err);
      setMergeError(true);
      setMergeMessage(err.message || "Failed to complete the merge.");
    } finally {
      setMergeLoading(false);
    }
  }

  // Optimistic toggle: the button reacts immediately, then the server confirms the new
  // count so the Stars page and this counter can never disagree.
  async function toggleStar() {
    const nextStarred = !isStarred;
    setIsStarred(nextStarred);
    setStarCount((prev) => Math.max(0, prev + (nextStarred ? 1 : -1)));

    try {
      const res = await apiFetch(
        `${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/star`,
        { method: nextStarred ? "POST" : "DELETE" }
      );
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!res.ok) {
        throw new Error((data && data.message) || `Request failed with status ${res.status}`);
      }
      if (typeof data?.stars === "number") setStarCount(data.stars);
      if (typeof data?.starred === "boolean") setIsStarred(data.starred);
    } catch (err) {
      setIsStarred(!nextStarred);
      setStarCount((prev) => Math.max(0, prev + (nextStarred ? -1 : 1)));
      console.error("Failed to update star:", err);
      alert(err.message || "Could not update the star. Please try again.");
    }
  }

  if (notFound) {
    return (
      <NotFound
        title="Repository Not Found"
        message={`The repository "${username}/${repoName}" was not found.`}
      />
    );
  }

  if (!repo) {
    return null;
  }

  const visibility = String(repo.visibility || "public").trim().toLowerCase();
  const isPublic = visibility === "public";
  const isTeamOnly = visibility === "team member" || visibility === "team";
  const repoFiles = repo.files || [];
  const activeBranch = selectedBranch || repo.defaultBranch || "main";
  const repoBranches = Array.isArray(repo.branches) && repo.branches.length > 0 ? repo.branches : [repo.defaultBranch || "main"];
  const currentBranchFiles = repoFiles.filter(
    (f) => (f.branch || repo.defaultBranch || "main") === activeBranch
  );
  const ownerName = repo.owner || username;
  const cloneUrl = repo.remoteUrl || `${API_BASE_URL}/${username}/${repo.name}.git`;
  const avatarUrl = defaultProfile;

  // Synthesize history list for VS Code style Git Graph containing ALL previous commits
  const rawHistory = (() => {
    let history = Array.isArray(repo.commitHistory) && repo.commitHistory.length > 0 ? [...repo.commitHistory] : [];

    // Make sure repo.lastCommit is included if present
    if (repo.lastCommit && repo.lastCommit.hash && !history.some((c) => c.hash === repo.lastCommit.hash)) {
      history.unshift({
        hash: repo.lastCommit.hash,
        message: repo.lastCommit.message || `Commit update for ${repo.name}`,
        branch: repo.lastCommit.branch || repo.defaultBranch || "main",
        author: ownerName,
        committedAt: repo.lastCommit.committedAt || new Date()
      });
    }

    // Make sure initial repository creation commit is at the base of the history list
    const initialHash = "init_" + (repo._id ? repo._id.toString().slice(-6) : "001");
    if (!history.some((c) => c.hash === initialHash || (c.message && c.message.toLowerCase().includes("initial repository creation")))) {
      history.push({
        hash: initialHash,
        message: `Initial repository creation for ${repo.name || repoName}`,
        branch: repo.defaultBranch || "main",
        author: ownerName,
        committedAt: repo.createdAt || new Date()
      });
    }

    return history;
  })();
  const graphBranches = [...new Set([
    repo.defaultBranch || "main",
    ...rawHistory.map((commit) => commit.branch || repo.defaultBranch || "main"),
  ])];
  const visibleGraphHistory = rawHistory
    .map((commit, historyIndex) => ({ commit, historyIndex }))
    .filter(({ commit }) => graphBranchFilter === "all" ||
      (commit.branch || repo.defaultBranch || "main") === graphBranchFilter);
  const graphRowHeight = 56;
  const graphLaneWidth = Math.max(76, graphBranches.length * 34 + 16);
  const graphHeight = Math.max(graphRowHeight, visibleGraphHistory.length * graphRowHeight);
  const graphNodes = visibleGraphHistory.map(({ commit, historyIndex }, index) => {
    const branch = commit.branch || repo.defaultBranch || "main";
    const laneIndex = Math.max(0, graphBranches.indexOf(branch));
    return {
      commit,
      index,
      historyIndex,
      branch,
      laneIndex,
      x: laneIndex * 34 + 20,
      y: index * graphRowHeight + graphRowHeight / 2,
      color: GRAPH_BRANCH_COLORS[laneIndex % GRAPH_BRANCH_COLORS.length],
      tooltip: getCommitTooltip(commit, rawHistory[historyIndex + 1], ownerName, repo.defaultBranch),
    };
  });
  const graphMergeEdges = graphNodes.flatMap((node) => {
    const merge = node.commit.message?.match(/^Merge branch ['"](.+?)['"] into ['"](.+?)['"]$/i);
    if (!merge) return [];

    const [, sourceBranch, targetBranch] = merge;
    if (node.branch.toLowerCase() !== targetBranch.toLowerCase()) return [];

    const sourceNode = graphNodes.find((candidate) =>
      candidate.historyIndex > node.historyIndex &&
      candidate.branch.toLowerCase() === sourceBranch.toLowerCase()
    );
    return sourceNode ? [{ mergeNode: node, sourceNode }] : [];
  });

  return (
    <main className="app gh-repo-page">
      <User_header />

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelectChange}
        multiple
        style={{ display: "none" }}
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFileSelectChange}
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: "none" }}
      />

      {/* Repo Dashboard Layout */}
      <div className="gh-page">
        <div className="gh-page-inner">

          {/* Hero Panel */}
          <section className="gh-hero">
            <div className="gh-hero-main">
              <div className="gh-hero-avatar">
                <img src={avatarUrl} alt={ownerName} />
              </div>
              <div className="gh-hero-text">
                <div className="gh-hero-title-row">
                  <h1 className="gh-hero-title">
                    <Link to={`/${ownerName}`} className="gh-hero-owner">{ownerName}</Link>
                    <span className="gh-hero-sep">/</span>
                    <span className="gh-hero-repo">{repo.name}</span>
                  </h1>
                  <span
                    className={`gh-visibility ${
                      isPublic ? "" : isTeamOnly ? "gh-visibility-team" : "gh-visibility-private"
                    }`}
                    title={isTeamOnly && repo.groupName ? `Shared with ${repo.groupName}` : undefined}
                  >
                    {isPublic ? "Public" : isTeamOnly ? (repo.groupName || "Team") : "Private"}
                  </span>
                </div>
                <p className="gh-hero-desc">
                  {repo.description || "No description provided for this repository yet."}
                </p>
                <div className="gh-hero-chips">
                  <span className="gh-chip">Branch: {activeBranch}</span>
                  <span className="gh-chip">{(repo.contributors || 1)} contributor(s)</span>
                  <span className="gh-chip">
                    ~{Math.max(1, Math.round(currentBranchFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024))} KB
                  </span>
                  <span className="gh-chip">
                    {repo.lastCommit?.hash ? `Last commit ${repo.lastCommit.hash.slice(0, 7)}` : "Awaiting first commit"}
                  </span>
                </div>
              </div>
            </div>

            <div className="gh-hero-actions">
              <button
                className={`gh-btn ${isStarred ? "gh-btn-starred" : ""}`.trim()}
                type="button"
                onClick={toggleStar}
                title={isStarred ? "Remove this repository from your stars" : "Add this repository to your stars"}
              >
                {isStarred ? "★ Starred" : "☆ Star"}{" "}
                <span className="gh-btn-count">{starCount}</span>
              </button>

              {isOwner && (
                <button className="gh-btn gh-btn-primary" type="button" onClick={() => setShowUploadModal(true)}>
                  + Add File
                </button>
              )}

              {isOwner && (
                <button
                  className="gh-btn"
                  type="button"
                  onClick={() => {
                    setDeployCommitId(repo.lastCommit?.hash || (rawHistory[0] ? rawHistory[0].hash : "main"));
                    setDeployErrorMessage("");
                    setShowDeployModal(true);
                  }}
                  style={{ borderColor: "rgba(167, 221, 166, 0.6)", color: "#a7dda6", background: "rgba(167, 221, 166, 0.12)" }}
                  title="Deploy repository code live to Netlify"
                >
                  🚀 Deploy
                </button>
              )}

              <button
                className="gh-btn gh-btn-green"
                type="button"
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                title="Download repository as a ZIP archive"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: "6px" }}>
                  <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                  <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                </svg>
                {downloadingZip ? "Zipping..." : "Download ZIP"}
              </button>

              <button
                className="gh-btn"
                type="button"
                onClick={() => {
                  setIssueTitle("");
                  setIssueDescription("");
                  setIssueMessage("");
                  setIssueError(false);
                  setShowIssueModal(true);
                }}
                style={{ borderColor: "rgba(167, 221, 166, 0.5)", color: "#a7dda6" }}
                title="Raise an issue about a bug or error found in this repository"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: "6px" }}>
                  <path d="M8 1.5a.5.5 0 0 1 .5.5v.513c1.53.282 3.5 1.687 3.5 4.237v3.293l1.103 2.206A.5.5 0 0 1 12.646 13H3.354a.5.5 0 0 1-.457-.751L4 10.043V6.75c0-2.55 1.97-3.955 3.5-4.237V2a.5.5 0 0 1 .5-.5zM6 14.5h4a.5.5 0 0 1-.088.82 2.5 2.5 0 0 1-3.824 0A.5.5 0 0 1 6 14.5z"/>
                </svg>
                Issues <span className="gh-btn-count">{openIssueCount}</span>
              </button>

              <button
                className="gh-btn"
                type="button"
                onClick={() => {
                  setReportReason("");
                  setReportMessage("");
                  setReportError(false);
                  setShowReportModal(true);
                }}
                style={{ borderColor: "rgba(239, 68, 68, 0.4)", color: "#ef4444" }}
                title="Report this repository to administrators"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: "6px" }}>
                  <path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8.5l-1.424-.475a4.743 4.743 0 0 0-2.868.109l-1.939.776a6.243 6.243 0 0 1-3.772.143L2 8.35v6.15a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 1 0v.65l2.497.832a4.743 4.743 0 0 0 2.868-.108l1.94-.776a6.243 6.243 0 0 1 3.772-.143L14.5.15a.5.5 0 0 1 .278-.065z"/>
                </svg>
                Report
              </button>
            </div>
          </section>

          {/* Repository Navigation Tabs */}
          <div style={{ display: "flex", gap: "10px", margin: "20px 0 14px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "10px", flexWrap: "wrap" }}>
            <button
              className={`gh-btn ${activeTab === "code" ? "gh-btn-primary" : ""}`}
              onClick={() => setActiveTab("code")}
              type="button"
            >
              Code
            </button>
            {isOwner && (
              <button
                className={`gh-btn ${activeTab === "commits" ? "gh-btn-primary" : ""}`}
                onClick={() => setActiveTab("commits")}
                type="button"
              >
                Commit Graph
              </button>
            )}
            {isOwner && (
              <button
                className={`gh-btn ${activeTab === "deploy" ? "gh-btn-primary" : ""}`}
                onClick={() => setActiveTab("deploy")}
                type="button"
              >
                🚀 Deployments {deployments.length > 0 && <span className="gh-btn-count">{deployments.length}</span>}
              </button>
            )}
            {isOwner && (
              <button
                className={`gh-btn ${activeTab === "settings" ? "gh-btn-primary" : ""}`}
                onClick={() => setActiveTab("settings")}
                type="button"
              >
                Settings
              </button>
            )}
          </div>

          {activeTab === "deploy" ? (
            <section className="gh-card deploy-card">
              <div className="deploy-section-title">
                <div>
                  <h2 className="gh-card-title" style={{ fontSize: "1.25rem", color: "#f0f6fc", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>🚀</span> Backend Container Deployment
                  </h2>
                  <p className="gh-card-sub">Automatically build, isolate, and run Node.js/Express backend containers with health checks.</p>
                </div>
                <button
                  className="gh-btn gh-btn-green"
                  onClick={() => {
                    setDeployCommitId(repo.lastCommit?.hash || (rawHistory[0] ? rawHistory[0].hash : "main"));
                    setDeployErrorMessage("");
                    setShowDeployModal(true);
                  }}
                >
                  🚀 Deploy Backend
                </button>
              </div>

              {/* Active / Current Deployment Progress & Control Card */}
              {activeDeployment && (
                <div className={`deploy-status-banner ${activeDeployment.status}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1.1rem", color: ["live", "success"].includes(activeDeployment.status) ? "#3fb950" : activeDeployment.status === "failed" ? "#f85149" : activeDeployment.status === "stopped" ? "#e3b341" : "#58a6ff" }}>
                        {["live", "success"].includes(activeDeployment.status) && "✓ Deployment Successful (LIVE)"}
                        {activeDeployment.status === "failed" && "✗ Deployment Failed"}
                        {activeDeployment.status === "stopped" && "⏹ Deployment Stopped"}
                        {["queued", "downloading", "building", "starting", "installing", "pending"].includes(activeDeployment.status) && `🚀 Deployment ${activeDeployment.status.toUpperCase()}...`}
                      </h3>
                      <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#8b949e" }}>
                        Project: <strong style={{ color: "#f0f6fc" }}>{activeDeployment.projectName || repo.name || repo.repositoryName}</strong> • Commit: <strong style={{ color: "#58a6ff" }}>{activeDeployment.commitId}</strong> • Type: <strong style={{ color: "#a7dda6" }}>Backend (Docker)</strong>
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {activeDeployment.deploymentUrl && (
                        <a
                          href={activeDeployment.deploymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gh-btn gh-btn-green"
                          style={{ textDecoration: "none", fontWeight: "700" }}
                        >
                          🌐 Open API ↗
                        </a>
                      )}
                      <button
                        className="gh-btn"
                        onClick={() => handleFetchLogs(activeDeployment._id || activeDeployment.id)}
                      >
                        📑 Logs
                      </button>
                      {(activeDeployment.status === "live" || activeDeployment.status === "success") && (
                        <button
                          className="gh-btn"
                          style={{ borderColor: "rgba(239, 68, 68, 0.4)", color: "#f87171" }}
                          onClick={() => handleStopDeployment(activeDeployment._id || activeDeployment.id)}
                        >
                          ⏹ Stop
                        </button>
                      )}
                      {activeDeployment.status === "stopped" && (
                        <button
                          className="gh-btn gh-btn-primary"
                          onClick={() => handleRestartDeployment(activeDeployment._id || activeDeployment.id)}
                        >
                          ▶ Restart
                        </button>
                      )}
                      <button
                        className="gh-btn"
                        onClick={() => handleRedeployDeployment(activeDeployment._id || activeDeployment.id)}
                      >
                        🔄 Redeploy
                      </button>
                    </div>
                  </div>

                  {/* Deployment Progress Stepper */}
                  <div className="deploy-stepper">
                    <div className={`deploy-step ${["downloading", "building", "starting", "live", "success"].includes(activeDeployment.status) ? "done" : activeDeployment.status === "queued" ? "current" : ""}`}>
                      {["downloading", "building", "starting", "live", "success"].includes(activeDeployment.status) ? "✓" : "○"} Queued & downloading commit files from B2
                    </div>
                    <div className={`deploy-step ${["building", "starting", "live", "success"].includes(activeDeployment.status) ? "done" : activeDeployment.status === "downloading" ? "current" : ""}`}>
                      {["building", "starting", "live", "success"].includes(activeDeployment.status) ? "✓" : "○"} package.json validated & Docker context prepared
                    </div>
                    <div className={`deploy-step ${["starting", "live", "success"].includes(activeDeployment.status) ? "done" : activeDeployment.status === "building" ? "current" : ""}`}>
                      {activeDeployment.status === "building" ? "⏳" : ["starting", "live", "success"].includes(activeDeployment.status) ? "✓" : "○"} Docker image build ({activeDeployment.startCommand || "npm start"})
                    </div>
                    <div className={`deploy-step ${["live", "success"].includes(activeDeployment.status) ? "done" : activeDeployment.status === "starting" ? "current" : activeDeployment.status === "failed" ? "error" : ""}`}>
                      {activeDeployment.status === "starting" ? "⏳" : ["live", "success"].includes(activeDeployment.status) ? "✓" : activeDeployment.status === "failed" ? "✗" : "○"} Isolated container startup, health check & proxy routing
                    </div>
                  </div>

                  {/* Error Output */}
                  {activeDeployment.errorMessage && (
                    <div style={{ color: "#f85149", fontSize: "0.85rem", marginTop: "12px", padding: "10px 14px", background: "rgba(239, 68, 68, 0.12)", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.3)", fontWeight: 600 }}>
                      Deployment Failed: {activeDeployment.errorMessage}
                    </div>
                  )}

                  {/* Build & Container Log Terminal */}
                  {showBuildLogs && (
                    <div className="deploy-log-terminal" style={{ marginTop: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "6px" }}>
                        <span style={{ fontWeight: "600", color: "#a7dda6", fontSize: "0.85rem" }}>Terminal Output Logs</span>
                        <button
                          type="button"
                          onClick={() => setShowBuildLogs(false)}
                          style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: "0.8rem" }}
                        >
                          ✕ Close
                        </button>
                      </div>
                      <pre style={{ margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.82rem", color: "#e5e7eb" }}>
                        {logLoading ? "Fetching runtime logs..." : logContent.length > 0 ? logContent.join("\n") : (activeDeployment.buildLogs || "No logs captured yet.")}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Deployment History Section */}
              <div style={{ marginTop: "24px" }}>
                <h3 className="gh-card-title" style={{ marginBottom: "14px", fontSize: "1rem" }}>Deployment History</h3>
                {deployments.length === 0 ? (
                  <div style={{ padding: "32px", textAlign: "center", color: "#8b949e", background: "#0d1117", borderRadius: "8px", border: "1px solid var(--repo-line)" }}>
                    No deployments recorded yet. Click <strong>🚀 Deploy Backend</strong> to launch your Node.js application in Docker.
                  </div>
                ) : (
                  <div className="deploy-history-list">
                    {deployments.map((dep) => (
                      <div key={dep._id || dep.id} className="deploy-history-item">
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontWeight: 700, color: ["live", "success"].includes(dep.status) ? "#3fb950" : dep.status === "failed" ? "#f85149" : dep.status === "stopped" ? "#e3b341" : "#58a6ff" }}>
                              {["live", "success"].includes(dep.status) ? "● LIVE" : dep.status === "failed" ? "● FAILED" : dep.status === "stopped" ? "● STOPPED" : "● " + dep.status.toUpperCase()}
                            </span>
                            <span className="gh-commit-hash">Commit {dep.commitId ? dep.commitId.slice(0, 7) : "latest"}</span>
                            <span style={{ fontSize: "0.75rem", background: "rgba(255, 255, 255, 0.08)", color: "#d1d5db", padding: "2px 6px", borderRadius: "4px" }}>Backend</span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#8b949e", marginTop: "4px" }}>
                            {new Date(dep.createdAt).toLocaleString()}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {dep.deploymentUrl && (
                            <a
                              href={dep.deploymentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="deploy-url-link"
                              style={{ fontSize: "13px" }}
                            >
                              {dep.deploymentUrl} ↗
                            </a>
                          )}
                          <button
                            className="gh-btn"
                            style={{ fontSize: "12px", padding: "4px 8px" }}
                            onClick={() => handleFetchLogs(dep._id || dep.id)}
                          >
                            View Logs
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : activeTab === "commits" ? (
            <section className="gh-card gitgraph-panel">
              <div className="gitgraph-title">
                <h2 className="gh-card-title">Git Commit Graph</h2>
              </div>
              <div className="gitgraph-toolbar">
                <label htmlFor="gitgraph-branch-filter">Branches:</label>
                <select
                  id="gitgraph-branch-filter"
                  value={graphBranchFilter}
                  onChange={(event) => setGraphBranchFilter(event.target.value)}
                >
                  <option value="all">Show All</option>
                  {graphBranches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                </select>
              </div>
              <div
                className="gitgraph-column-header"
                style={{ gridTemplateColumns: `${graphLaneWidth}px minmax(0, 1fr)` }}
              >
                <span>Graph</span>
                <span>Commit</span>
              </div>
              <div className="gitgraph-scroll">
                <div
                  className="gitgraph-body"
                  style={{
                    gridTemplateColumns: `${graphLaneWidth}px minmax(0, 1fr)`,
                    minHeight: `${graphHeight}px`,
                  }}
                >
                  <svg
                    className="gitgraph-svg"
                    width={graphLaneWidth}
                    height={graphHeight}
                    viewBox={`0 0 ${graphLaneWidth} ${graphHeight}`}
                    role="img"
                    aria-label="Commit graph. Hover over a node for commit details."
                  >
                    {graphMergeEdges.map(({ mergeNode, sourceNode }) => {
                      const middleY = (mergeNode.y + sourceNode.y) / 2;
                      return (
                        <path
                          key={`merge-${mergeNode.commit.hash || mergeNode.index}-${sourceNode.commit.hash || sourceNode.index}`}
                          d={`M ${mergeNode.x} ${mergeNode.y} C ${mergeNode.x} ${middleY}, ${sourceNode.x} ${middleY}, ${sourceNode.x} ${sourceNode.y}`}
                          fill="none"
                          stroke={sourceNode.color}
                          strokeWidth="2"
                        />
                      );
                    })}
                    {graphBranches.flatMap((branch, laneIndex) => {
                      const branchNodes = graphNodes.filter((node) => node.branch === branch);
                      const color = GRAPH_BRANCH_COLORS[laneIndex % GRAPH_BRANCH_COLORS.length];
                      return branchNodes.slice(0, -1).map((node, index) => {
                        const nextNode = branchNodes[index + 1];
                        return (
                          <line
                            key={`${branch}-${node.index}`}
                            x1={node.x}
                            y1={node.y}
                            x2={nextNode.x}
                            y2={nextNode.y}
                            stroke={color}
                            strokeWidth="2"
                          />
                        );
                      });
                    })}
                    {graphNodes.map((node) => (
                      <circle
                        key={`${node.commit.hash || node.index}-node`}
                        cx={node.x}
                        cy={node.y}
                        r="5.5"
                        fill={node.color}
                        stroke="#1e1e1e"
                        strokeWidth="2"
                        aria-label={node.tooltip.replaceAll("\n", ". ")}
                      >
                        <title>{node.tooltip}</title>
                      </circle>
                    ))}
                  </svg>
                  <div className="gitgraph-rows">
                    {graphNodes.map(({ commit, branch, color, index, tooltip }) => (
                      <div
                        key={commit.hash || index}
                        className="gitgraph-row"
                        title={tooltip}
                        onClick={() => {
                          setRevertMessage("");
                          setRevertError(false);
                          setSelectedCommit(commit);
                        }}
                      >
                        <div className="gitgraph-commit-main">
                          <span className="gitgraph-hash">{commit.hash ? commit.hash.slice(0, 7) : "commit"}</span>
                          <span className="gitgraph-message">{commit.message || "Commit update"}</span>
                        </div>
                        <button
                          className="gitgraph-inspect"
                          type="button"
                          title="Inspect or revert this commit"
                          onClick={(event) => {
                            event.stopPropagation();
                            setRevertMessage("");
                            setRevertError(false);
                            setSelectedCommit(commit);
                          }}
                        >
                          Inspect / Revert
                        </button>
                      </div>
                    ))}
                    {graphNodes.length === 0 && <p className="gitgraph-empty">No commits on this branch.</p>}
                  </div>
                </div>
              </div>
            </section>
          ) : activeTab === "settings" ? (
            /* Settings Panel */
            <section className="gh-card" style={{ padding: "28px", maxWidth: "800px", margin: "0 auto 40px" }}>
              <div style={{ marginBottom: "20px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "12px" }}>
                <h2 className="gh-card-title" style={{ fontSize: "1.4rem" }}>Repository Settings</h2>
                <p className="gh-card-sub">Manage repository name, visibility, team group assignment, or delete this repository.</p>
              </div>

              {settingsMsg && (
                <div style={{ color: settingsError ? "var(--repo-error)" : "var(--repo-success)", fontWeight: 600, marginBottom: "16px" }}>
                  {settingsMsg}
                </div>
              )}

              <form onSubmit={handleSaveSettings}>
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", color: "var(--repo-text-soft)", fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>
                    Repository Name
                  </label>
                  <input
                    type="text"
                    className="gh-modal-input"
                    value={settingsForm.name}
                    onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                    required
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", color: "var(--repo-text-soft)", fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>
                    Description
                  </label>
                  <textarea
                    className="gh-modal-input"
                    rows="3"
                    value={settingsForm.description}
                    onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })}
                    placeholder="Repository description..."
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", color: "var(--repo-text-soft)", fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
                    Visibility Settings
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "var(--repo-text)" }}>
                      <input
                        type="radio"
                        name="repo-vis"
                        value="public"
                        disabled={String(repo.visibility || "public").trim().toLowerCase() !== "public"}
                        checked={settingsForm.visibility === "public" || settingsForm.visibility === "Public"}
                        onChange={(e) => setSettingsForm({ ...settingsForm, visibility: e.target.value })}
                      />
                      <span><strong>Public</strong> - Anyone can see this repository.</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "var(--repo-text)" }}>
                      <input
                        type="radio"
                        name="repo-vis"
                        value="private"
                        checked={settingsForm.visibility === "private" || settingsForm.visibility === "Private"}
                        onChange={(e) => setSettingsForm({ ...settingsForm, visibility: e.target.value })}
                      />
                      <span><strong>Private</strong> - Only you and invited members can see it.</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "var(--repo-text)" }}>
                      <input
                        type="radio"
                        name="repo-vis"
                        value="Team Member"
                        checked={settingsForm.visibility === "Team Member"}
                        onChange={(e) => setSettingsForm({ ...settingsForm, visibility: e.target.value })}
                      />
                      <span><strong>Team Member</strong> - Restricted to members of a selected team group.</span>
                    </label>
                  </div>
                  {String(repo.visibility || "public").trim().toLowerCase() !== "public" && (
                    <p style={{ margin: "10px 0 0", color: "var(--repo-text-soft)", fontSize: "0.82rem" }}>
                      Public visibility is locked after this repository has been made private or team-only.
                    </p>
                  )}
                </div>

                {settingsForm.visibility === "Team Member" && (
                  <div style={{ marginBottom: "20px", background: "var(--repo-panel-soft)", padding: "16px", borderRadius: "8px", border: "1px solid var(--repo-line)" }}>
                    <label style={{ display: "block", color: "#a7dda6", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                      Assign Team / Joined Group
                    </label>
                    {userGroups.length > 0 ? (
                      <select
                        value={settingsForm.groupId}
                        onChange={(e) => setSettingsForm({ ...settingsForm, groupId: e.target.value })}
                        className="gh-modal-input"
                      >
                        <option value="">-- Select a Group --</option>
                        {userGroups.map((g) => (
                          <option key={g._id} value={g._id}>
                            {g.name} ({g.members ? g.members.length : 1} members)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p style={{ margin: 0, color: "#e4bd71", fontSize: "0.85rem" }}>
                        You have not created or joined any team groups.
                      </p>
                    )}
                  </div>
                )}

                <div style={{ marginTop: "24px" }}>
                  <button type="submit" className="gh-btn gh-btn-green" disabled={savingSettings}>
                    {savingSettings ? "Saving Settings..." : "Save Settings"}
                  </button>
                </div>
              </form>

              <hr style={{ border: 0, borderTop: "1px solid var(--repo-line)", margin: "32px 0" }} />

              {/* Danger Zone */}
              <div style={{ border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "10px", padding: "20px", background: "rgba(239, 68, 68, 0.05)" }}>
                <h3 style={{ color: "#ef4444", margin: "0 0 6px" }}>Danger Zone</h3>
                <p style={{ color: "var(--repo-text-soft)", fontSize: "0.9rem", margin: "0 0 16px" }}>
                  Deleting this repository is irreversible. All files, commits, and metadata will be permanently removed.
                </p>

                {showDeleteConfirm ? (
                  <div style={{ background: "rgba(239, 68, 68, 0.15)", padding: "14px", borderRadius: "8px", border: "1px solid #ef4444" }}>
                    <p style={{ color: "#ffffff", fontWeight: 600, margin: "0 0 10px" }}>
                      Are you sure you want to delete repository "{repo.name}"?
                    </p>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        className="gh-btn"
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="gh-btn"
                        style={{ background: "#ef4444", color: "#ffffff", border: "none" }}
                        onClick={handleDeleteRepository}
                        disabled={deletingRepo}
                      >
                        {deletingRepo ? "Deleting..." : "Yes, Delete Repository"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="gh-btn"
                    style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.4)" }}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete Repository
                  </button>
                )}
              </div>
            </section>
          ) : (
            <>
              {/* Stat Strip */}
              <section className="gh-stats">
                <div className="gh-stat">
                  <span className="gh-stat-value">{repo.commits || 0}</span>
                  <span className="gh-stat-label">Commits</span>
                </div>
                <div className="gh-stat">
                  <span className="gh-stat-value">{starCount}</span>
                  <span className="gh-stat-label">Stars</span>
                </div>
                <div className="gh-stat">
                  <span className="gh-stat-value">{repo.contributors || 1}</span>
                  <span className="gh-stat-label">Contributors</span>
                </div>
                <div className="gh-stat">
                  <span className="gh-stat-value">{repoBranches.length}</span>
                  <span className="gh-stat-label">{repoBranches.length === 1 ? "Branch" : "Branches"}</span>
                </div>
              </section>

              {/* Body Grid */}
              <div className="gh-grid">
                {/* Main Column */}
                <div className="gh-main-col">

                  {/* Files Panel */}
                  <section className="gh-card">
                    <div className="gh-card-head">
                      <div>
                        <h2 className="gh-card-title">Files</h2>
                        <p className="gh-card-sub">
                          {currentBranchFiles.length} item(s) in {activeBranch}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <select
                          className="gh-branch-selector"
                          value={activeBranch}
                          onChange={(e) => {
                            if (e.target.value === "__NEW_BRANCH__") {
                              setNewBranchInput("");
                              setBranchError("");
                              setShowCreateBranchModal(true);
                            } else {
                              setSelectedBranch(e.target.value);
                            }
                          }}
                        >
                          {repoBranches.map((b) => (
                            <option key={b} value={b}>
                              Branch: {b}
                            </option>
                          ))}
                          {isOwner && <option value="__NEW_BRANCH__">+ Create New Branch...</option>}
                        </select>
                        {isOwner && (
                          <button
                            className="gh-btn"
                            style={{ fontSize: "12px", padding: "6px 10px" }}
                            type="button"
                            onClick={openMergeModal}
                            disabled={repoBranches.length < 2}
                            title={repoBranches.length < 2 ? "Create at least one other branch to merge" : `Pull a branch into ${repo.defaultBranch || "main"}`}
                          >
                            Merge into {repo.defaultBranch || "main"}
                          </button>
                        )}
                        {isOwner && (
                          <button
                            className="gh-btn"
                            style={{ fontSize: "12px", padding: "6px 10px" }}
                            type="button"
                            onClick={() => {
                              setNewBranchInput("");
                              setBranchError("");
                              setShowCreateBranchModal(true);
                            }}
                          >
                            + New Branch
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Last commit banner */}
                    <div className="gh-commit-banner">
                      <div className="gh-commit-author">
                        <img src={avatarUrl} alt={ownerName} className="gh-author-avatar" />
                        <strong className="gh-commit-author-name">{ownerName}</strong>
                        <span className="gh-commit-msg">
                          {repo.lastCommit?.message || `Initial commit for ${repo.name}`}
                        </span>
                      </div>
                      <div className="gh-commit-meta">
                        <span className="gh-commit-hash">
                          {repo.lastCommit?.hash?.slice(0, 7) || "a1b2c3d"}
                        </span>
                        <span>{repo.commits || 0} commits</span>
                      </div>
                    </div>

                    {currentBranchFiles.length > 0 ? (
                      <div className="gh-file-list">
                        {currentBranchFiles.map((file, idx) => (
                          <div
                            className="gh-file-row"
                            key={idx}
                            onClick={() => handleOpenFile(file)}
                          >
                            <button
                              type="button"
                              className="gh-file-link"
                              onClick={(e) => { e.stopPropagation(); handleOpenFile(file); }}
                            >
                              {file.path || file.b2FileName}
                            </button>
                            <span className="gh-file-desc">
                              {getFileCommitMessage(file, rawHistory, repo.defaultBranch)}
                            </span>
                            <span className="gh-file-size">
                              {Math.max(1, Math.round((file.size || 0) / 1024))} KB
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : isOwner ? (
                      /* Interactive Drag & Drop Zone */
                      <div
                        className={`gh-dropzone ${isDragging ? "dragging" : ""}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className="gh-dropzone-title">
                          {uploading ? `Uploading files... ${uploadProgress}%` : `Branch "${activeBranch}" is currently empty`}
                        </div>
                        <div className="gh-dropzone-sub">
                          Drag and drop files or folders here to upload files directly into {activeBranch}
                        </div>

                        {uploading && (
                          <div style={{ width: "80%", maxWidth: "320px", height: "8px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden", margin: "14px auto 6px" }}>
                            <div
                              style={{
                                width: `${uploadProgress}%`,
                                height: "100%",
                                background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                                borderRadius: "4px",
                                transition: "width 0.2s ease"
                              }}
                            />
                          </div>
                        )}

                        {!uploading && (
                          <div className="gh-dropzone-actions">
                            <button
                              className="gh-btn gh-btn-green"
                              type="button"
                              onClick={() => fileInputRef.current && fileInputRef.current.click()}
                            >
                              Choose Files for {activeBranch}
                            </button>
                            <button
                              className="gh-btn"
                              type="button"
                              onClick={() => folderInputRef.current && folderInputRef.current.click()}
                            >
                              Upload Folder
                            </button>
                          </div>
                        )}

                        {uploadMessage && (
                          <div className={`gh-dropzone-msg ${uploadError ? "gh-dropzone-msg-error" : ""}`}>
                            {uploadMessage}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="gh-dropzone" style={{ cursor: "default" }}>
                        <div className="gh-dropzone-title">
                          Branch "{activeBranch}" is currently empty
                        </div>
                        <div className="gh-dropzone-sub">
                          This repository owner has not added any files to branch "{activeBranch}" yet.
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                {/* Side Column */}
                <aside className="gh-side-col">
                  {/* About Section */}
                  <section className="gh-card gh-side-card">
                    <h3 className="gh-card-title">About</h3>
                    <p className="gh-sidebar-desc">
                      {repo.description || "No description provided for this repository."}
                    </p>
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="gh-upload-modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2>Upload Files or Folder to Repository</h2>
              <button
                style={{ background: "none", border: "none", color: "var(--repo-text-light)", fontSize: "1.2rem", cursor: "pointer" }}
                onClick={() => setShowUploadModal(false)}
              >
                X
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); executeFileUpload(); }}>
              <div
                className={`gh-dropzone ${isDragging ? "dragging" : ""}`}
                style={{ padding: "24px 16px", marginBottom: "16px" }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  try {
                    const droppedFiles = await extractFilesFromDataTransfer(e.dataTransfer);
                    if (droppedFiles && droppedFiles.length > 0) {
                      setFilesToUpload(droppedFiles);
                      setUploadMessage("");
                      setUploadError(false);
                    }
                  } catch (err) {
                    console.error("Modal drop error:", err);
                  }
                }}
              >
                <div className="gh-dropzone-title" style={{ fontSize: "0.95rem" }}>
                  Drag files or folder here
                </div>
                <div className="gh-dropzone-actions" style={{ marginTop: "6px" }}>
                  <button
                    className="gh-btn"
                    type="button"
                    onClick={() => modalFileInputRef.current && modalFileInputRef.current.click()}
                  >
                    Choose Files
                  </button>
                  <button
                    className="gh-btn"
                    type="button"
                    onClick={() => folderInputRef.current && folderInputRef.current.click()}
                  >
                    Choose Folder
                  </button>
                </div>
                <input
                  type="file"
                  ref={modalFileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setFilesToUpload(Array.from(e.target.files));
                      setUploadMessage("");
                      setUploadError(false);
                    }
                  }}
                  multiple
                  style={{ display: "none" }}
                />
              </div>

              {filesToUpload.length > 0 && (
                <div className="gh-file-list-preview" style={{ marginBottom: "16px" }}>
                  <strong style={{ color: "var(--repo-text)", display: "block", marginBottom: "4px" }}>
                    Selected Files ({filesToUpload.length}):
                  </strong>
                  {filesToUpload.slice(0, 10).map((f, i) => (
                    <div key={i} style={{ color: "var(--repo-text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {f.webkitRelativePath || f.name} ({(f.size / 1024).toFixed(1)} KB)
                    </div>
                  ))}
                  {filesToUpload.length > 10 && (
                    <div style={{ color: "var(--repo-primary)", marginTop: "4px" }}>
                      + {filesToUpload.length - 10} more files...
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "var(--repo-text-soft)", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  Commit Message
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="e.g. Upload project files and folders"
                  className="gh-modal-input"
                />
              </div>

              {uploading && (
                <div style={{ marginTop: "16px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#a7dda6", marginBottom: "6px", fontWeight: 600 }}>
                    <span>Uploading files to repository...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${uploadProgress}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                        borderRadius: "4px",
                        transition: "width 0.2s ease"
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="gh-btn"
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gh-btn gh-btn-green"
                  disabled={uploading || filesToUpload.length === 0}
                >
                  {uploading ? `Uploading (${uploadProgress}%)...` : "Upload & Commit"}
                </button>
              </div>

              {uploadMessage && (
                <div style={{ marginTop: "14px", fontSize: "13px", fontWeight: 600, color: uploadError ? "var(--repo-error)" : "var(--repo-success)" }}>
                  {uploadMessage}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Commit Details & Revert Modal */}
      {selectedCommit && (
        <div className="gh-upload-modal-backdrop" onClick={() => setSelectedCommit(null)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, color: "#ffffff" }}>Commit Details</h3>
              <button style={{ background: "none", border: "none", color: "#9eafa3", fontSize: "1.2rem", cursor: "pointer" }} onClick={() => setSelectedCommit(null)}>
                X
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "#748779", display: "block" }}>COMMIT HASH</span>
                <span style={{ fontFamily: "monospace", color: "#a7dda6", fontWeight: "700" }}>{selectedCommit.hash}</span>
              </div>
              <div>
                <span style={{ fontSize: "0.8rem", color: "#748779", display: "block" }}>COMMIT MESSAGE</span>
                <span style={{ color: "#ffffff", fontWeight: "600" }}>{selectedCommit.message || "No commit message"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <span style={{ fontSize: "0.8rem", color: "#748779", display: "block" }}>COMMITTED BY</span>
                  <span style={{ color: "#e7f1e5" }}>{selectedCommit.author || ownerName}</span>
                </div>
                <div>
                  <span style={{ fontSize: "0.8rem", color: "#748779", display: "block" }}>COMMITTED AT</span>
                  <span style={{ color: "#e7f1e5" }}>{selectedCommit.committedAt ? new Date(selectedCommit.committedAt).toLocaleString() : "N/A"}</span>
                </div>
              </div>
            </div>

            {revertMessage && (
              <div style={{ color: revertError ? "var(--repo-error)" : "var(--repo-success)", fontWeight: 600, marginBottom: "16px" }}>
                {revertMessage}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "14px", borderTop: "1px solid var(--repo-line)" }}>
              <button type="button" className="gh-btn" onClick={() => setSelectedCommit(null)}>
                Close
              </button>
              <button
                type="button"
                className="gh-btn gh-btn-green"
                disabled={reverting}
                onClick={() => handleRevertCommit(selectedCommit.hash)}
              >
                {reverting ? "Reverting & Pushing..." : "Revert Changes & Push to Main"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {selectedFileForPreview && (
        <div className="gh-upload-modal-backdrop" onClick={() => setSelectedFileForPreview(null)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "850px", width: "90%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ color: "var(--repo-text)", fontSize: "15px" }}>{selectedFileForPreview.path || selectedFileForPreview.b2FileName}</strong>
                <span style={{ fontSize: "12px", color: "var(--repo-text-soft)", background: "var(--repo-panel-soft)", border: "1px solid var(--repo-line)", padding: "2px 8px", borderRadius: "12px" }}>
                  {Math.max(1, Math.round((selectedFileForPreview.size || 0) / 1024))} KB
                </span>
              </div>
              <button
                style={{ background: "none", border: "none", color: "var(--repo-text-light)", fontSize: "1.2rem", cursor: "pointer" }}
                onClick={() => setSelectedFileForPreview(null)}
              >
                X
              </button>
            </div>

            {/* Code Box */}
            <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "var(--repo-radius-sm)", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161b22", padding: "8px 16px", borderBottom: "1px solid #30363d" }}>
                <span style={{ fontSize: "12px", color: "#8b949e" }}>Raw File Content</span>
              </div>

              <div style={{ padding: "16px", maxHeight: "450px", overflowY: "auto", fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace", fontSize: "13px", color: "#e6edf3", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#0d1117" }}>
                {fileContentLoading ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "#8b949e" }}>
                    Loading file content...
                  </div>
                ) : fileContentError ? (
                  <div style={{ color: "#f85149", padding: "20px" }}>
                    {fileContentError}
                  </div>
                ) : (
                  <code>{fileContent || "(Empty file)"}</code>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "16px" }}>
              <button
                type="button"
                className="gh-btn gh-btn-green"
                disabled={fileContentLoading || Boolean(fileContentError) || downloadingFile}
                onClick={handleDownloadPreviewFile}
              >
                {downloadingFile ? "Downloading..." : "Download File"}
              </button>
              <button
                type="button"
                className="gh-btn"
                onClick={() => setSelectedFileForPreview(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="gh-upload-modal-backdrop" onClick={() => setShowReportModal(false)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, color: "#ffffff" }}>Report Repository</h3>
              <button
                style={{ background: "none", border: "none", color: "#9eafa3", fontSize: "1.2rem", cursor: "pointer" }}
                onClick={() => setShowReportModal(false)}
              >
                X
              </button>
            </div>

            <form onSubmit={handleReportRepo}>
              <p style={{ fontSize: "0.88rem", color: "var(--repo-text-soft)", marginBottom: "14px" }}>
                Please describe the issue or reason for reporting <strong>{repo.name}</strong> to the system administrators.
              </p>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "var(--repo-text)", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  Reason for Report *
                </label>
                <textarea
                  rows="4"
                  required
                  placeholder="e.g. Inappropriate content, copyright infringement, malicious code, or spam..."
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="gh-modal-input"
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                />
              </div>

              {reportMessage && (
                <div style={{ color: reportError ? "var(--repo-error)" : "var(--repo-success)", fontWeight: 600, marginBottom: "14px", fontSize: "13px" }}>
                  {reportMessage}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--repo-line)", paddingTop: "14px" }}>
                <button
                  type="button"
                  className="gh-btn"
                  onClick={() => setShowReportModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gh-btn"
                  disabled={reporting || !reportReason.trim()}
                  style={{ background: "#ef4444", borderColor: "#dc2626", color: "#ffffff" }}
                >
                  {reporting ? "Submitting Report..." : "Submit Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Modal */}
      {showIssueModal && (
        <div className="gh-upload-modal-backdrop" onClick={() => setShowIssueModal(false)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, color: "#ffffff" }}>Raise an Issue</h3>
              <button
                style={{ background: "none", border: "none", color: "#9eafa3", fontSize: "1.2rem", cursor: "pointer" }}
                onClick={() => setShowIssueModal(false)}
              >
                X
              </button>
            </div>

            <form onSubmit={handleCreateIssue}>
              <p style={{ fontSize: "0.88rem", color: "var(--repo-text-soft)", marginBottom: "14px" }}>
                Found a bug or error in <strong>{repo.name}</strong>? Describe the problem below. The issue will be sent to the
                repository owner/team, where they can track and close it once resolved.
              </p>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "var(--repo-text)", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  Issue Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Crash when uploading large files"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  className="gh-modal-input"
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "var(--repo-text)", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  Description *
                </label>
                <textarea
                  rows="5"
                  required
                  placeholder="Describe the bug, steps to reproduce, expected vs actual behavior..."
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  className="gh-modal-input"
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                />
              </div>

              {issueMessage && (
                <div style={{ color: issueError ? "var(--repo-error)" : "var(--repo-success)", fontWeight: 600, marginBottom: "14px", fontSize: "13px" }}>
                  {issueMessage}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--repo-line)", paddingTop: "14px" }}>
                <button
                  type="button"
                  className="gh-btn"
                  onClick={() => setShowIssueModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gh-btn gh-btn-green"
                  disabled={creatingIssue || !issueTitle.trim() || !issueDescription.trim()}
                >
                  {creatingIssue ? "Raising Issue..." : "Submit Issue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Branch Modal */}
      {showCreateBranchModal && (
        <div className="gh-upload-modal-backdrop" onClick={() => setShowCreateBranchModal(false)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, color: "#ffffff" }}>Create New Branch</h3>
              <button
                style={{ background: "none", border: "none", color: "#9eafa3", fontSize: "1.2rem", cursor: "pointer" }}
                onClick={() => setShowCreateBranchModal(false)}
              >
                X
              </button>
            </div>

            <form onSubmit={handleCreateBranch}>
              <p style={{ fontSize: "0.88rem", color: "var(--repo-text-soft)", marginBottom: "14px" }}>
                Enter a name for the new branch. The branch will start empty so you can upload files into it.
              </p>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "var(--repo-text)", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dev, feature-login, v1.0"
                  value={newBranchInput}
                  onChange={(e) => setNewBranchInput(e.target.value)}
                  className="gh-modal-input"
                  autoFocus
                />
              </div>

              {branchError && (
                <div style={{ color: "var(--repo-error)", fontWeight: 600, marginBottom: "14px", fontSize: "13px" }}>
                  {branchError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--repo-line)", paddingTop: "14px" }}>
                <button
                  type="button"
                  className="gh-btn"
                  onClick={() => setShowCreateBranchModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gh-btn gh-btn-green"
                  disabled={creatingBranch || !newBranchInput.trim()}
                >
                  {creatingBranch ? "Creating..." : "Create Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Merge Branch into Target Modal */}
      {showMergeModal && (
        <div className="gh-upload-modal-backdrop" onClick={() => setShowMergeModal(false)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "10px" }}>
              <h3 style={{ margin: 0, color: "#ffffff" }}>Merge Branch into {repo.defaultBranch || "main"}</h3>
              <button
                style={{ background: "none", border: "none", color: "#9eafa3", fontSize: "1.2rem", cursor: "pointer" }}
                onClick={() => setShowMergeModal(false)}
              >
                X
              </button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", color: "var(--repo-text)", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                Source Branch
              </label>
              <select
                className="gh-modal-input"
                value={mergeSource}
                onChange={(e) => setMergeSource(e.target.value)}
                disabled={pendingConflicts.length > 0}
              >
                {repoBranches
                  .filter((b) => b.toLowerCase() !== (repo.defaultBranch || "main").toLowerCase())
                  .map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </select>
              <p style={{ fontSize: "0.82rem", color: "var(--repo-text-soft)", margin: "8px 0 0" }}>
                Pulls the files from "{mergeSource || "the selected branch"}" into {repo.defaultBranch || "main"}. Files that changed in both branches
                will ask you how to resolve the conflict.
              </p>
            </div>

            {pendingConflicts.length === 0 && (
              <button
                type="button"
                className="gh-btn gh-btn-green"
                disabled={mergeLoading || !mergeSource}
                onClick={handleMergeBranches}
              >
                {mergeLoading ? "Checking branches..." : "Merge / Pull"}
              </button>
            )}

            {addedFilesList.length > 0 && pendingConflicts.length === 0 && (
              <div style={{ fontSize: "0.85rem", color: "#a7dda6", marginTop: "10px" }}>
                {addedFilesList.length} new file(s) from "{mergeSource}" will be added to {repo.defaultBranch || "main"}.
              </div>
            )}

            {mergeMessage && (
              <div
                style={{
                  marginTop: "14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: mergeError ? "var(--repo-error)" : "var(--repo-success)"
                }}
              >
                {mergeMessage}
              </div>
            )}

            {pendingConflicts.length > 0 && (
              <div style={{ marginTop: "16px", borderTop: "1px solid var(--repo-line)", paddingTop: "14px", maxHeight: "440px", overflowY: "auto" }}>
                <h4 style={{ color: "#ffffff", margin: "0 0 4px" }}>Resolve {pendingConflicts.length} Merge Conflict(s)</h4>
                <p style={{ fontSize: "0.82rem", color: "var(--repo-text-soft)", margin: "0 0 14px" }}>
                  For each file, keep the previous version ({repo.defaultBranch || "main"}), use the new version ({mergeSource}), or combine both.
                </p>

                {pendingConflicts.map((c) => (
                  <div
                    key={c.path}
                    style={{
                      border: "1px solid var(--repo-line)",
                      borderRadius: "8px",
                      padding: "14px",
                      marginBottom: "12px",
                      background: "var(--repo-panel-soft)"
                    }}
                  >
                    <strong style={{ color: "#e4bd71", fontSize: "0.9rem", display: "block", marginBottom: "8px" }}>
                      {c.path}
                    </strong>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "10px", fontSize: "13px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "var(--repo-text)" }}>
                        <input
                          type="radio"
                          name={`res-${c.path}`}
                          checked={(resolutions[c.path] || "theirs") === "ours"}
                          onChange={() => setResolutions((prev) => ({ ...prev, [c.path]: "ours" }))}
                        />
                        Keep previous ({repo.defaultBranch || "main"})
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "var(--repo-text)" }}>
                        <input
                          type="radio"
                          name={`res-${c.path}`}
                          checked={(resolutions[c.path] || "theirs") === "theirs"}
                          onChange={() => setResolutions((prev) => ({ ...prev, [c.path]: "theirs" }))}
                        />
                        Use new ({mergeSource})
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "var(--repo-text)" }}>
                        <input
                          type="radio"
                          name={`res-${c.path}`}
                          checked={(resolutions[c.path] || "theirs") === "combine"}
                          onChange={() => setResolutions((prev) => ({ ...prev, [c.path]: "combine" }))}
                        />
                        Combine both
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.75rem", color: "#9eafa3", fontWeight: 700, marginBottom: "4px" }}>
                          PREVIOUS ({repo.defaultBranch || "main"})
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            fontSize: "0.75rem",
                            maxHeight: "160px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            background: "#0d1711",
                            border: "1px solid var(--repo-line)",
                            borderRadius: "6px",
                            padding: "10px",
                            color: "#e7f1e5"
                          }}
                        >
                          {c.ours || "(binary/unreadable)"}
                        </pre>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.75rem", color: "#9eafa3", fontWeight: 700, marginBottom: "4px" }}>
                          NEW ({mergeSource})
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            fontSize: "0.75rem",
                            maxHeight: "160px",
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            background: "#0d1711",
                            border: "1px solid var(--repo-line)",
                            borderRadius: "6px",
                            padding: "10px",
                            color: "#e7f1e5"
                          }}
                        >
                          {c.theirs || "(binary/unreadable)"}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px", borderTop: "1px solid var(--repo-line)", paddingTop: "14px" }}>
                  <button
                    type="button"
                    className="gh-btn"
                    onClick={() => {
                      setPendingConflicts([]);
                      setMergeMessage("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="gh-btn gh-btn-green"
                    disabled={mergeLoading}
                    onClick={() =>
                      runMergeResolution(
                        Object.keys(resolutions).map((path) => ({ path, strategy: resolutions[path] || "theirs" }))
                      )
                    }
                  >
                    {mergeLoading ? "Completing merge..." : "Complete Merge"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deploy Confirmation Modal */}
      {showDeployModal && (
        <div className="gh-upload-modal-backdrop" onClick={() => setShowDeployModal(false)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px", width: "92%" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "1.2rem", color: "#f0f6fc" }}>
              🚀 Deploy Repository
            </h2>
            <p style={{ fontSize: "13px", color: "var(--repo-text-soft)", margin: "6px 0 16px" }}>
              Build and run your Node.js/Express backend code inside an isolated Docker container with health checks.
            </p>

            <div style={{ marginBottom: "14px", background: "rgba(255, 255, 255, 0.04)", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--repo-line)" }}>
              <span style={{ fontSize: "12px", color: "#8b949e", display: "block" }}>Repository:</span>
              <strong style={{ fontSize: "14px", color: "#58a6ff" }}>{repo.name || repo.repositoryName || "my-api"}</strong>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px", color: "var(--repo-text)" }}>
                Deployment Type
              </label>
              <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#f0f6fc", cursor: "pointer", fontWeight: 600 }}>
                  <input type="radio" name="deployType" checked readOnly style={{ accentColor: "#238636" }} />
                  ● Backend (Docker Container)
                </label>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px", color: "var(--repo-text)" }}>
                Select Commit
              </label>
              <select
                className="gh-modal-input"
                value={deployCommitId}
                onChange={(e) => setDeployCommitId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px" }}
              >
                {rawHistory.map((c) => (
                  <option key={c.hash} value={c.hash}>
                    {c.hash.slice(0, 7)} - {c.message || "Commit update"} ({new Date(c.committedAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Environment Variables Section */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--repo-text)", margin: 0 }}>
                  Environment Variables
                </label>
                <button
                  type="button"
                  className="gh-btn"
                  onClick={handleAddEnvVar}
                  style={{ fontSize: "12px", padding: "3px 8px" }}
                >
                  + Add Variable
                </button>
              </div>

              {deployEnvVars.length === 0 ? (
                <div style={{ fontSize: "12px", color: "#8b949e", fontStyle: "italic" }}>
                  No environment variables added. Click "+ Add Variable" to specify secrets or settings.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "160px", overflowY: "auto" }}>
                  {deployEnvVars.map((env, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="text"
                        placeholder="NAME (e.g. MONGO_URI)"
                        value={env.name}
                        onChange={(e) => handleUpdateEnvVar(idx, "name", e.target.value)}
                        className="gh-modal-input"
                        style={{ flex: "1", fontSize: "12px", padding: "6px 8px" }}
                      />
                      <input
                        type="password"
                        placeholder="VALUE"
                        value={env.value}
                        onChange={(e) => handleUpdateEnvVar(idx, "value", e.target.value)}
                        className="gh-modal-input"
                        style={{ flex: "1", fontSize: "12px", padding: "6px 8px" }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveEnvVar(idx)}
                        style={{ background: "transparent", border: "none", color: "#f85149", cursor: "pointer", fontSize: "14px", padding: "0 4px" }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {deployErrorMessage && (
              <div style={{
                color: "#f85149",
                fontSize: "13px",
                marginBottom: "14px",
                fontWeight: 600,
                background: "rgba(239, 68, 68, 0.12)",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(239, 68, 68, 0.3)"
              }}>
                {deployErrorMessage}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                type="button"
                className="gh-btn"
                onClick={() => setShowDeployModal(false)}
                disabled={isStartingDeploy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gh-btn gh-btn-green"
                onClick={handleStartDeployment}
                disabled={isStartingDeploy}
              >
                {isStartingDeploy ? "Starting Build..." : "🚀 Deploy Backend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default RepoDetail;
