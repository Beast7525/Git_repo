import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
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
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [savingFile, setSavingFile] = useState(false);
  const [fileSaveError, setFileSaveError] = useState("");
  const [fileSaveSuccess, setFileSaveSuccess] = useState("");

  async function handleOpenFile(file) {
    setSelectedFileForPreview(file);
    setFileContent("");
    setFileContentLoading(true);
    setFileContentError("");
    setIsEditingFile(false);
    setEditContent("");
    setEditMessage("");
    setFileSaveError("");
    setFileSaveSuccess("");

    const targetPath = file.path || file.b2FileName;

    // 1. Try direct B2 URL fetch if available
    if (file.b2Url) {
      try {
        const res = await fetch(file.b2Url);
        if (res.ok) {
          const text = await res.text();
          setFileContent(text);
          setFileContentLoading(false);
          return;
        }
      } catch (err) {
        console.warn("Direct B2 fetch failed, trying backend fallback:", err);
      }
    }

    // 2. Fallback to backend API endpoint
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

  function startEditingFile() {
    setEditContent(fileContent);
    setEditMessage("");
    setFileSaveError("");
    setFileSaveSuccess("");
    setIsEditingFile(true);
  }

  function cancelEditingFile() {
    setIsEditingFile(false);
    setEditMessage("");
    setFileSaveError("");
    setFileSaveSuccess("");
  }

  async function handleCommitFileChange() {
    const targetFile = selectedFileForPreview;
    const targetPath = targetFile?.path || targetFile?.b2FileName;
    if (!targetPath) return;

    setSavingFile(true);
    setFileSaveError("");
    setFileSaveSuccess("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/file-content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: targetPath, content: editContent, message: editMessage })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setFileContent(editContent);
      setRepo(data.repo);
      const updatedFile = (data.repo?.files || []).find(
        (f) => f.path === targetPath || f.b2FileName === targetPath
      );
      if (updatedFile) setSelectedFileForPreview(updatedFile);
      setFileSaveSuccess(data.message || "File updated and committed successfully.");
      setIsEditingFile(false);
      setEditMessage("");
    } catch (err) {
      console.error("Error committing file changes:", err);
      setFileSaveError(err.message || "Unable to commit file changes.");
    } finally {
      setSavingFile(false);
    }
  }
  
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

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const modalFileInputRef = useRef(null);

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
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
      const storedUsername = localStorage.getItem("username") || currentUser.username || currentUser.name || "";
      const storedEmail = currentUser.gmail || currentUser.email || "";
      if (!storedUsername && !storedEmail) return;

      try {
        const params = new URLSearchParams();
        if (storedUsername) params.append("username", storedUsername);
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
        // Auto trigger upload or show ready status
        executeFileUpload(droppedFiles, `Uploaded ${droppedFiles.length} file(s) via Drag & Drop`);
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
      executeFileUpload(selectedFiles, `Uploaded ${selectedFiles.length} file(s)`);
    }
  }

  async function executeFileUpload(filesToSubmit, defaultMsg = "") {
    const filesArr = filesToSubmit || filesToUpload;
    if (!filesArr || filesArr.length === 0) {
      setUploadError(true);
      setUploadMessage("Please select or drop files to upload.");
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
      formData.append("message", commitMessage.trim() || defaultMsg || `Uploaded ${filesArr.length} file(s) to Backblaze B2`);

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
      setUploadMessage(data.message || `Successfully uploaded ${filesArr.length} file(s) to Backblaze B2 cloud storage!`);
      setTimeout(() => setShowUploadModal(false), 1500);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError(true);
      setUploadMessage(error.message || "Upload failed. Please check network connection.");
    } finally {
      setUploading(false);
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

  return (
    <main className="app gh-repo-page">
      <User_header />

      
      {/* Hidden file inputs for file and folder selections */}
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
                  <span className="gh-chip">🌿 Branch: {repo.defaultBranch || "main"}</span>
                  <span className="gh-chip">👥 {(repo.contributors || 1)} contributor(s)</span>
                  <span className="gh-chip">
                    📦 ~{Math.max(1, Math.round(repoFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024))} KB
                  </span>
                  <span className="gh-chip">
                    {repo.lastCommit?.hash ? `Last commit ${repo.lastCommit.hash.slice(0, 7)}` : "Awaiting first commit"}
                  </span>
                </div>
              </div>
            </div>

            <div className="gh-hero-actions">
              <button className="gh-btn" type="button" onClick={toggleStar}>
                ⭐ <span>Star</span>
                <span className="gh-btn-count">{starCount}</span>
              </button>

              <button className="gh-btn gh-btn-primary" type="button" onClick={() => setShowUploadModal(true)}>
                + Add File
              </button>

              <div style={{ position: "relative" }}>
                <button
                  className="gh-btn gh-btn-green"
                  type="button"
                  onClick={() => setShowCodeDropdown(!showCodeDropdown)}
                >
                  &lt;/&gt; Clone <span>▼</span>
                </button>

                {showCodeDropdown && (
                  <div className="gh-clone-pop">
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>Clone Repository</div>
                    <div className="gh-clone-url">{cloneUrl}</div>
                    <button
                      className="gh-btn"
                      style={{ width: "100%", marginTop: "10px", justifyContent: "center" }}
                      onClick={() => {
                        navigator.clipboard.writeText(`git clone ${cloneUrl}`);
                        alert("Clone command copied to clipboard!");
                        setShowCodeDropdown(false);
                      }}
                    >
                      📋 Copy HTTPS URL
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Repository Navigation Tabs */}
          <div style={{ display: "flex", gap: "10px", margin: "20px 0 14px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "10px" }}>
            <button
              className={`gh-btn ${activeTab === "code" ? "gh-btn-primary" : ""}`}
              onClick={() => setActiveTab("code")}
              type="button"
            >
              &lt;/&gt; Code
            </button>
            <button
              className={`gh-btn ${activeTab === "settings" ? "gh-btn-primary" : ""}`}
              onClick={() => setActiveTab("settings")}
              type="button"
            >
              ⚙️ Settings
            </button>
          </div>

          {activeTab === "settings" ? (
            <section className="gh-card" style={{ padding: "28px", maxWidth: "800px", margin: "0 auto 40px" }}>
              <div style={{ marginBottom: "20px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "12px" }}>
                <h2 className="gh-card-title" style={{ fontSize: "1.4rem" }}>⚙️ Repository Settings</h2>
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
                            👥 {g.name} ({g.members ? g.members.length : 1} members)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p style={{ margin: 0, color: "#e4bd71", fontSize: "0.85rem" }}>
                        ⚠️ You have not created or joined any team groups.
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
                    🗑️ Delete Repository
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
            <div className="gh-stat">
              <span className="gh-stat-value">3</span>
              <span className="gh-stat-label">Languages</span>
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
                    <h2 className="gh-card-title">📁 Files</h2>
                    <p className="gh-card-sub">
                      {repoFiles.length} item(s) in {repo.defaultBranch || "main"}
                    </p>
                  </div>
                  <select className="gh-branch-selector" defaultValue={repo.defaultBranch || "main"}>
                    <option>🌿 {repo.defaultBranch || "main"}</option>
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
                          📄 {file.path || file.b2FileName}
                        </button>
                        <span className="gh-b2-badge">☁️ {file.b2Url ? "B2 Cloud" : "Local"}</span>
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
                  /* Interactive Drag & Drop Zone when repository has no files */
                  <div
                    className={`gh-dropzone ${isDragging ? "dragging" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="gh-dropzone-icon">☁️</div>
                    <div className="gh-dropzone-title">
                      {uploading ? "Uploading files to Backblaze B2..." : "Drag and drop files or folders here"}
                    </div>
                    <div className="gh-dropzone-sub">
                      Upload files or entire directory trees directly to Backblaze B2 Cloud Storage
                    </div>

                    {!uploading && (
                      <div className="gh-dropzone-actions">
                        <button
                          className="gh-btn gh-btn-green"
                          type="button"
                          onClick={() => fileInputRef.current && fileInputRef.current.click()}
                        >
                          📄 Choose Files
                        </button>
                        <button
                          className="gh-btn"
                          type="button"
                          onClick={() => folderInputRef.current && folderInputRef.current.click()}
                        >
                          📁 Upload Folder
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
                    <h2 className="gh-card-title">📖 README.md</h2>
                    <p className="gh-card-sub">Overview & documentation</p>
                  </div>
                </div>
                <div className="gh-readme-body">
                  <h1 style={{ marginTop: 0 }}>{repo.name}</h1>
                  <p style={{ fontSize: "15px", color: "var(--repo-text-soft)" }}>
                    {repo.description || "Welcome to the official repository."}
                  </p>

                  <h2>🚀 Quick Start & Installation</h2>
                  <div className="gh-code-block">
                    $ git clone {cloneUrl}<br />
                    $ cd {repo.name}<br />
                    $ npm install<br />
                    $ npm run dev
                  </div>

                  <h2>☁️ Cloud Storage & Features</h2>
                  <ul style={{ color: "var(--repo-text-soft)", paddingLeft: "20px" }}>
                    <li>Connected to <strong>Backblaze B2 Cloud Storage</strong> for secure file hosting.</li>
                    <li>Visibility: <strong>{isPublic ? "Public Repository" : "Private Repository"}</strong>.</li>
                    <li>Ignore .gitignore: <strong>{repo.ignoreGitignore ? "Yes (Include all files)" : "No"}</strong>.</li>
                  </ul>
                </div>
              </section>
            </div>

            {/* Side Column */}
            <aside className="gh-side-col">

              {/* About */}
              <section className="gh-card gh-side-card">
                <h3 className="gh-card-title">ℹ️ About</h3>
                <p className="gh-sidebar-desc">
                  {repo.description || "No description, website, or topics provided."}
                </p>
                <div className="gh-topic-wrap">
                  <span className="gh-topic-tag">react</span>
                  <span className="gh-topic-tag">javascript</span>
                  <span className="gh-topic-tag">gitrepo</span>
                  <span className="gh-topic-tag">b2-cloud</span>
                </div>
              </section>

              {/* Releases */}
              <section className="gh-card gh-side-card">
                <h3 className="gh-card-title">🏷️ Releases</h3>
                <div className="gh-release-row">
                  <span>🏷️</span>
                  <strong>v1.0.0</strong>
                  <span className="gh-release-latest">Latest</span>
                </div>
              </section>

              
            </aside>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Backblaze B2 Upload Modal */}
      {showUploadModal && (
        <div className="gh-upload-modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2>☁️ Upload Files or Folder to Backblaze B2</h2>
              <button
                style={{ background: "none", border: "none", color: "var(--repo-text-light)", fontSize: "1.2rem", cursor: "pointer" }}
                onClick={() => setShowUploadModal(false)}
              >
                ✕
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
                <div style={{ fontSize: "1.8rem" }}>📂</div>
                <div className="gh-dropzone-title" style={{ fontSize: "0.95rem" }}>
                  Drag files or folder here
                </div>
                <div className="gh-dropzone-actions" style={{ marginTop: "6px" }}>
                  <button
                    className="gh-btn"
                    type="button"
                    onClick={() => modalFileInputRef.current && modalFileInputRef.current.click()}
                  >
                    📄 Choose Files
                  </button>
                  <button
                    className="gh-btn"
                    type="button"
                    onClick={() => folderInputRef.current && folderInputRef.current.click()}
                  >
                    📁 Choose Folder
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
                      📄 {f.webkitRelativePath || f.name} ({(f.size / 1024).toFixed(1)} KB)
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
                  {uploading ? "Uploading to B2..." : "Upload & Commit"}
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

      {/* File Preview Modal */}
      {selectedFileForPreview && (
        <div className="gh-upload-modal-backdrop" onClick={() => setSelectedFileForPreview(null)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "850px", width: "90%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid var(--repo-line)", paddingBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>📄</span>
                <strong style={{ color: "var(--repo-text)", fontSize: "15px" }}>{selectedFileForPreview.path || selectedFileForPreview.b2FileName}</strong>
                <span style={{ fontSize: "12px", color: "var(--repo-text-soft)", background: "var(--repo-panel-soft)", border: "1px solid var(--repo-line)", padding: "2px 8px", borderRadius: "12px" }}>
                  {Math.max(1, Math.round((selectedFileForPreview.size || 0) / 1024))} KB
                </span>
              </div>
              <button
                style={{ background: "none", border: "none", color: "var(--repo-text-light)", fontSize: "1.2rem", cursor: "pointer" }}
                onClick={() => setSelectedFileForPreview(null)}
              >
                ✕
              </button>
            </div>

            {/* Code Box */}
            <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: "var(--repo-radius-sm)", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#161b22", padding: "8px 16px", borderBottom: "1px solid #30363d" }}>
                <span style={{ fontSize: "12px", color: "#8b949e" }}>
                  {isEditingFile ? "Edit Mode" : "Raw File Content"}
                </span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {!isEditingFile && fileContent && (
                    <button
                      className="gh-btn"
                      style={{ fontSize: "12px", padding: "3px 8px" }}
                      onClick={() => {
                        navigator.clipboard.writeText(fileContent);
                        alert("File content copied to clipboard!");
                      }}
                    >
                      📋 Copy Raw
                    </button>
                  )}
                  {!isEditingFile && fileContent && !fileContentLoading && !fileContentError && (
                    <button
                      className="gh-btn gh-btn-green"
                      style={{ fontSize: "12px", padding: "3px 8px" }}
                      onClick={startEditingFile}
                    >
                      ✏️ Edit
                    </button>
                  )}
                </div>
              </div>

              {isEditingFile ? (
                <div style={{ padding: "16px" }}>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    spellCheck={false}
                    style={{
                      width: "100%",
                      minHeight: "320px",
                      boxSizing: "border-box",
                      resize: "vertical",
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: "6px",
                      color: "#e6edf3",
                      fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace",
                      fontSize: "13px",
                      lineHeight: "1.5",
                      padding: "12px",
                      outline: "none"
                    }}
                  />
                  {fileSaveError && (
                    <div style={{ color: "#f85149", marginTop: "10px", fontSize: "13px" }}>
                      ⚠️ {fileSaveError}
                    </div>
                  )}
                  {fileSaveSuccess && !fileSaveError && (
                    <div style={{ color: "#3fb950", marginTop: "10px", fontSize: "13px" }}>
                      ✅ {fileSaveSuccess}
                    </div>
                  )}
                  <div style={{ marginTop: "12px" }}>
                    <label style={{ display: "block", color: "var(--repo-text-soft)", fontSize: "12px", fontWeight: 600, marginBottom: "6px" }}>
                      Commit Message
                    </label>
                    <input
                      type="text"
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      placeholder="e.g. Update debug1.txt via editor"
                      className="gh-modal-input"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                    <button
                      type="button"
                      className="gh-btn"
                      onClick={cancelEditingFile}
                      disabled={savingFile}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="gh-btn gh-btn-green"
                      onClick={handleCommitFileChange}
                      disabled={savingFile}
                    >
                      {savingFile ? "Committing..." : "💾 Commit Changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "16px", maxHeight: "450px", overflowY: "auto", fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace", fontSize: "13px", color: "#e6edf3", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#0d1117" }}>
                  {fileContentLoading ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#8b949e" }}>
                      Loading file content...
                    </div>
                  ) : fileContentError ? (
                    <div style={{ color: "#f85149", padding: "20px" }}>
                      ⚠️ {fileContentError}
                    </div>
                  ) : (
                    <code>{fileContent || "(Empty file)"}</code>
                  )}
                </div>
              )}
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
                  🔗 Open Raw URL
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
    </main>
  );
}

export default RepoDetail;

