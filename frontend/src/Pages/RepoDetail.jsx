import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import JSZip from "jszip";
import User_header from "./User_header";
import NotFound from "./NotFound";
import "./style/GitHubRepo.css";
import { useLoading } from "../context/LoadingContext";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

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

  // Commit Graph & Revert States
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [reverting, setReverting] = useState(false);
  const [revertMessage, setRevertMessage] = useState("");
  const [revertError, setRevertError] = useState(false);

  // Interactive UI States
  const [activeTab, setActiveTab] = useState("code");
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

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const modalFileInputRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const loggedInUsername = localStorage.getItem("username") || currentUser.username || currentUser.name || "Developer";

  useEffect(() => {
    if (!username || !repoName || RESERVED_KEYWORDS.includes(username.toLowerCase())) {
      setNotFound(true);
      return;
    }

    async function loadRepoDetails() {
      try {
        startLoading();
        setNotFound(false);

        const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`);
        if (res.ok) {
          const data = await res.json();
          setRepo(data);
          setStarCount(data.stars || 0);
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
      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/file-content?filePath=${encodeURIComponent(targetPath)}`);
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

  async function handleSaveSettings(e) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg("");
    setSettingsError(false);

    try {
      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/settings`, {
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
      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`, {
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
      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/revert`, {
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
        setFilesToUpload(droppedFiles);
        setUploadMessage("");
        setUploadError(false);
        if (!commitMessage) {
          setCommitMessage(`Add ${droppedFiles.length} file(s) via upload`);
        }
        setShowUploadModal(true);
      }
    } catch (err) {
      console.error("Error extracting dropped files:", err);
      setUploadError(true);
      setUploadMessage("Could not read dropped files or folder.");
    }
  }

  function handleFileSelectChange(e) {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      setFilesToUpload(selectedFiles);
      setUploadMessage("");
      setUploadError(false);
      if (!commitMessage) {
        setCommitMessage(`Add ${selectedFiles.length} file(s) via upload`);
      }
      setShowUploadModal(true);
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
    setUploadMessage("");
    setUploadError(false);

    try {
      const formData = new FormData();
      filesArr.forEach((file) => {
        const filePath = file.webkitRelativePath || file.name;
        formData.append("files", file, filePath);
      });
      formData.append("message", finalCommitMsg);

      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/upload`, {
        method: "POST",
        body: formData
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setRepo(data.repo);
      setFilesToUpload([]);
      setCommitMessage("");
      setUploadError(false);
      setUploadMessage(data.message || `Successfully uploaded ${filesArr.length} file(s) and recorded commit.`);
      setTimeout(() => setShowUploadModal(false), 1500);
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
            const resp = await fetch(
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

      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/report`, {
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
      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/issues`, {
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

  function toggleStar() {
    if (isStarred) {
      setIsStarred(false);
      setStarCount((prev) => Math.max(0, prev - 1));
    } else {
      setIsStarred(true);
      setStarCount((prev) => prev + 1);
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

  const isPublic = repo.visibility === "public" || repo.visibility === "Public";
  const repoFiles = repo.files || [];
  const ownerName = repo.owner || username;
  const cloneUrl = repo.remoteUrl || `https://git-repo-zlhn.onrender.com/${username}/${repo.name}.git`;
  const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${ownerName}`;

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
                  <span className={`gh-visibility ${isPublic ? "" : "gh-visibility-private"}`}>
                    {isPublic ? "Public" : "Private"}
                  </span>
                </div>
                <p className="gh-hero-desc">
                  {repo.description || "No description provided for this repository yet."}
                </p>
                <div className="gh-hero-chips">
                  <span className="gh-chip">Branch: {repo.defaultBranch || "main"}</span>
                  <span className="gh-chip">{(repo.contributors || 1)} contributor(s)</span>
                  <span className="gh-chip">
                    ~{Math.max(1, Math.round(repoFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024))} KB
                  </span>
                  <span className="gh-chip">
                    {repo.lastCommit?.hash ? `Last commit ${repo.lastCommit.hash.slice(0, 7)}` : "Awaiting first commit"}
                  </span>
                </div>
              </div>
            </div>

            <div className="gh-hero-actions">
              <button className="gh-btn" type="button" onClick={toggleStar}>
                Star <span className="gh-btn-count">{starCount}</span>
              </button>

              <button className="gh-btn gh-btn-primary" type="button" onClick={() => setShowUploadModal(true)}>
                + Add File
              </button>

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
          <div style={{ display: "flex", gap: "10px", margin: "20px 0 14px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "10px" }}>
            <button
              className={`gh-btn ${activeTab === "code" ? "gh-btn-primary" : ""}`}
              onClick={() => setActiveTab("code")}
              type="button"
            >
              Code
            </button>
            <button
              className={`gh-btn ${activeTab === "commits" ? "gh-btn-primary" : ""}`}
              onClick={() => setActiveTab("commits")}
              type="button"
            >
              Commit Graph
            </button>
            <button
              className={`gh-btn ${activeTab === "settings" ? "gh-btn-primary" : ""}`}
              onClick={() => setActiveTab("settings")}
              type="button"
            >
              Settings
            </button>
          </div>

          {activeTab === "commits" ? (
            /* VS Code Style Git Commit Graph View */
            <section className="gh-card" style={{ padding: "28px", maxWidth: "900px", margin: "0 auto 40px" }}>
              <div style={{ marginBottom: "20px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "12px" }}>
                <h2 className="gh-card-title" style={{ fontSize: "1.4rem" }}>Git Commit Graph &amp; History</h2>
                <p className="gh-card-sub">VS Code style commit timeline. Click any commit node to inspect details or revert changes.</p>
              </div>

              <div className="vscode-git-graph" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {rawHistory.map((c, index) => (
                  <div
                    key={c.hash || index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      background: "rgba(15, 29, 20, 0.7)",
                      border: "1px solid rgba(167, 221, 166, 0.2)",
                      borderRadius: "10px",
                      padding: "14px 18px",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onClick={() => {
                      setRevertMessage("");
                      setRevertError(false);
                      setSelectedCommit(c);
                    }}
                  >
                    {/* SVG Node & Line indicator */}
                    <div style={{ position: "relative", width: "24px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {index < rawHistory.length - 1 && (
                        <div style={{ position: "absolute", top: "20px", bottom: "-20px", width: "2px", background: "#a7dda6", left: "11px" }} />
                      )}
                      <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#a7dda6", boxShadow: "0 0 8px #a7dda6", zIndex: 2 }} />
                    </div>

                    <div style={{ flexGrow: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: "700", color: "#a7dda6", background: "rgba(167, 221, 166, 0.15)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.82rem" }}>
                          {c.hash ? c.hash.slice(0, 7) : "commit"}
                        </span>
                        <span style={{ fontWeight: 600, color: "#ffffff", fontSize: "0.95rem" }}>
                          {c.message || "Commit update"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "#9eafa3", display: "flex", gap: "14px" }}>
                        <span>Author: <strong>{c.author || ownerName}</strong></span>
                        <span>Branch: <strong>{c.branch || repo.defaultBranch || "main"}</strong></span>
                        <span>Date: <strong>{c.committedAt ? new Date(c.committedAt).toLocaleString() : "Recently"}</strong></span>
                      </div>
                    </div>

                    <button
                      className="gh-btn"
                      style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRevertMessage("");
                        setRevertError(false);
                        setSelectedCommit(c);
                      }}
                    >
                      Inspect / Revert
                    </button>
                  </div>
                ))}
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
                  <span className="gh-stat-value">{repoFiles.length}</span>
                  <span className="gh-stat-label">Files</span>
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
                  <span className="gh-stat-value">1</span>
                  <span className="gh-stat-label">Branch</span>
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
                          {repoFiles.length} item(s) in {repo.defaultBranch || "main"}
                        </p>
                      </div>
                      <select className="gh-branch-selector" defaultValue={repo.defaultBranch || "main"}>
                        <option>Branch: {repo.defaultBranch || "main"}</option>
                        <option>master</option>
                      </select>
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

                    {repoFiles.length > 0 ? (
                      <div className="gh-file-list">
                        {repoFiles.map((file, idx) => (
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
                            <span className="gh-b2-badge">{file.b2Url ? "B2 Cloud" : "Local"}</span>
                            <span className="gh-file-desc">
                              {repo.lastCommit?.message || "Upload file to repository"}
                            </span>
                            <span className="gh-file-size">
                              {Math.max(1, Math.round((file.size || 0) / 1024))} KB
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* Interactive Drag & Drop Zone */
                      <div
                        className={`gh-dropzone ${isDragging ? "dragging" : ""}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className="gh-dropzone-title">
                          {uploading ? "Uploading files..." : "Drag and drop files or folders here"}
                        </div>
                        <div className="gh-dropzone-sub">
                          Upload files or entire directory trees directly to Cloud Storage
                        </div>

                        {!uploading && (
                          <div className="gh-dropzone-actions">
                            <button
                              className="gh-btn gh-btn-green"
                              type="button"
                              onClick={() => fileInputRef.current && fileInputRef.current.click()}
                            >
                              Choose Files
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
                    )}
                  </section>

                  {/* README Panel */}
                  <section className="gh-card gh-readme">
                    <div className="gh-card-head">
                      <div>
                        <h2 className="gh-card-title">README.md</h2>
                        <p className="gh-card-sub">Overview &amp; documentation</p>
                      </div>
                    </div>
                    <div className="gh-readme-body">
                      <h1 style={{ marginTop: 0 }}>{repo.name}</h1>
                      <p style={{ fontSize: "15px", color: "var(--repo-text-soft)" }}>
                        {repo.description || "Welcome to the official repository."}
                      </p>

                      <h2>Quick Start &amp; Installation</h2>
                      <div className="gh-code-block">
                        $ git clone {cloneUrl}<br />
                        $ cd {repo.name}<br />
                        $ npm install<br />
                        $ npm run dev
                      </div>

                      <h2>Cloud Storage &amp; Features</h2>
                      <ul style={{ color: "var(--repo-text-soft)", paddingLeft: "20px" }}>
                        <li>Connected to Cloud Storage for secure file hosting.</li>
                        <li>Visibility: <strong>{isPublic ? "Public Repository" : "Private Repository"}</strong>.</li>
                        <li>Ignore .gitignore: <strong>{repo.ignoreGitignore ? "Yes (Include all files)" : "No"}</strong>.</li>
                      </ul>
                    </div>
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

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="gh-btn"
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gh-btn gh-btn-green"
                  disabled={uploading || filesToUpload.length === 0}
                >
                  {uploading ? "Uploading..." : "Upload & Commit"}
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
                {fileContent && (
                  <button
                    className="gh-btn"
                    style={{ fontSize: "12px", padding: "3px 8px" }}
                    onClick={() => {
                      navigator.clipboard.writeText(fileContent);
                      alert("File content copied to clipboard!");
                    }}
                  >
                    Copy Raw
                  </button>
                )}
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

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              {selectedFileForPreview.b2Url && (
                <a
                  href={selectedFileForPreview.b2Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gh-btn gh-btn-green"
                  style={{ textDecoration: "none" }}
                >
                  Open Raw URL
                </a>
              )}
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
    </main>
  );
}

export default RepoDetail;
