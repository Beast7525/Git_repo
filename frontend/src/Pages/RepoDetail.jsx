import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import User_header from "./User_header";
import NotFound from "./NotFound";
import "./style/GitHubRepo.css";

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

  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  
  // Interactive UI States
  const [activeTab, setActiveTab] = useState("code");
  const [isStarred, setIsStarred] = useState(false);
  const [starCount, setStarCount] = useState(0);
  const [showCodeDropdown, setShowCodeDropdown] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

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
      setLoading(false);
      return;
    }

    async function loadRepoDetails() {
      try {
        setLoading(true);
        setNotFound(false);

        const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}`);
        if (res.ok) {
          const data = await res.json();
          setRepo(data);
          setStarCount(data.stars || 0);
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error("Error loading repository detail:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    loadRepoDetails();
  }, [username, repoName]);

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

  if (loading) {
    return (
      <main className="app gh-repo-page">
        <User_header />
        <div style={{ textAlign: "center", padding: "100px 0", color: "#8b949e" }}>
          Loading GitHub repository interface...
        </div>
      </main>
    );
  }

  const isPublic = repo.visibility === "public" || repo.visibility === "Public";
  const repoFiles = repo.files || [];
  const ownerName = repo.owner || username;
  const cloneUrl = repo.remoteUrl || `https://gitrepo.com/${username}/${repo.name}.git`;
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

      {/* GitHub Main Container */}
      <div className="gh-main-container">
        {/* Left Primary Repository Area */}
        <div className="gh-primary-content">

          {/* Controls Row: Branch selector, commit count, Add file, Code dropdown */}
          <div className="gh-controls-row">
            <div className="gh-controls-left">
              <select className="gh-branch-selector">
                <option>🌿 {repo.defaultBranch || "main"}</option>
                <option>master</option>
              </select>

              <span className="gh-meta-info">
                <strong>1</strong> branch
              </span>
              <span className="gh-meta-info">
                <strong>0</strong> tags
              </span>
            </div>

            <div className="gh-controls-right">
              <button
                className="gh-btn"
                type="button"
                onClick={() => setShowUploadModal(true)}
              >
                + Add file
              </button>

              <div style={{ position: "relative" }}>
                <button
                  className="gh-btn gh-btn-green"
                  type="button"
                  onClick={() => setShowCodeDropdown(!showCodeDropdown)}
                >
                  &lt;&gt; Code <span>▼</span>
                </button>

                {showCodeDropdown && (
                  <div style={{
                    position: "absolute",
                    right: 0,
                    top: "38px",
                    width: "340px",
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: "6px",
                    padding: "16px",
                    zIndex: 100,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    fontSize: "13px"
                  }}>
                    <div style={{ fontWeight: 600, color: "#f0f6fc", marginBottom: "8px" }}>
                      Clone Repository
                    </div>
                    <div style={{
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      color: "#c9d1d9",
                      wordBreak: "break-all"
                    }}>
                      {cloneUrl}
                    </div>
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
          </div>

          {/* GitHub Commit Banner */}
          <div className="gh-commit-banner">
            <div className="gh-commit-author">
              <img src={avatarUrl} alt={ownerName} className="gh-author-avatar" />
              <strong style={{ color: "#f0f6fc" }}>{ownerName}</strong>
              <span className="gh-commit-msg">
                {repo.lastCommit?.message || `Initial commit for ${repo.name}`}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className="gh-commit-hash">
                {repo.lastCommit?.hash?.slice(0, 7) || "a1b2c3d"}
              </span>
              <span style={{ color: "#8b949e", fontSize: "12px" }}>
                {repo.commits || 0} commits
              </span>
            </div>
          </div>

          {/* GitHub File Explorer Table or Interactive Dropzone */}
          {repoFiles.length > 0 ? (
            <table className="gh-file-table">
              <tbody>
                {repoFiles.map((file, idx) => (
                  <tr className="gh-file-row" key={idx}>
                    <td className="gh-file-cell" style={{ width: "35%" }}>
                      <div className="gh-file-name">
                        <span>📄</span>
                        {file.b2Url ? (
                          <a
                            href={file.b2Url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="gh-file-link"
                          >
                            {file.path || file.b2FileName}
                          </a>
                        ) : (
                          <span className="gh-file-link">{file.path || file.b2FileName}</span>
                        )}
                        <span className="gh-b2-badge">☁️ B2</span>
                      </div>
                    </td>
                    <td className="gh-file-cell" style={{ color: "#8b949e", width: "45%" }}>
                      {repo.lastCommit?.message || "Upload file to repository"}
                    </td>
                    <td className="gh-file-cell" style={{ color: "#8b949e", textAlign: "right", width: "20%" }}>
                      {Math.max(1, Math.round((file.size || 0) / 1024))} KB
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <div style={{ marginTop: "12px", fontSize: "13px", fontWeight: 600, color: uploadError ? "#f85149" : "#3fb950" }}>
                  {uploadMessage}
                </div>
              )}
            </div>
          )}

          {/* GitHub README Card */}
          <div className="gh-readme-card">
            <div className="gh-readme-header">
              <span>📖</span>
              <span>README.md</span>
            </div>
            <div className="gh-readme-body">
              <h1 style={{ marginTop: 0 }}>{repo.name}</h1>
              <p style={{ fontSize: "15px", color: "#c9d1d9" }}>
                {repo.description || "Welcome to the official repository repository."}
              </p>

              <h2>🚀 Quick Start & Installation</h2>
              <div className="gh-code-block">
                $ git clone {cloneUrl}<br />
                $ cd {repo.name}<br />
                $ npm install<br />
                $ npm run dev
              </div>

              <h2>☁️ Cloud Storage & Features</h2>
              <ul style={{ color: "#c9d1d9", paddingLeft: "20px" }}>
                <li>Connected to <strong>Backblaze B2 Cloud Storage</strong> for secure file hosting.</li>
                <li>Visibility: <strong>{isPublic ? "Public Repository" : "Private Repository"}</strong>.</li>
                <li>Ignore .gitignore: <strong>{repo.ignoreGitignore ? "Yes (Include all files)" : "No"}</strong>.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* GitHub Right Sidebar */}
        <aside className="gh-sidebar">
          {/* About Section */}
          <div className="gh-sidebar-section">
            <h3>About</h3>
            <p className="gh-sidebar-desc">
              {repo.description || "No description, website, or topics provided."}
            </p>
            <div style={{ marginTop: "12px" }}>
              <span className="gh-topic-tag">react</span>
              <span className="gh-topic-tag">javascript</span>
              <span className="gh-topic-tag">gitrepo</span>
              <span className="gh-topic-tag">b2-cloud</span>
            </div>
          </div>

          <hr style={{ borderColor: "var(--gh-border)", margin: 0 }} />

          {/* Releases */}
          <div className="gh-sidebar-section">
            <h3>Releases</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#58a6ff" }}>
              <span>🏷️</span>
              <strong>v1.0.0</strong>
              <span style={{ fontSize: "11px", background: "rgba(46, 160, 67, 0.15)", color: "#3fb950", border: "1px solid rgba(46, 160, 67, 0.4)", padding: "1px 6px", borderRadius: "10px" }}>Latest</span>
            </div>
          </div>

          <hr style={{ borderColor: "var(--gh-border)", margin: 0 }} />

          {/* Contributors */}
          <div className="gh-sidebar-section">
            <h3>Contributors <span className="gh-btn-count">{repo.contributors || 1}</span></h3>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src={avatarUrl} alt={ownerName} style={{ width: "32px", height: "32px", borderRadius: "50%" }} />
              <div>
                <strong style={{ color: "#f0f6fc", display: "block" }}>{ownerName}</strong>
                <span style={{ fontSize: "12px", color: "#8b949e" }}>Maintainer</span>
              </div>
            </div>
          </div>

          <hr style={{ borderColor: "var(--gh-border)", margin: 0 }} />

          {/* Languages */}
          <div className="gh-sidebar-section">
            <h3>Languages</h3>
            <div className="gh-lang-bar">
              <div className="gh-lang-segment" style={{ width: "75%", backgroundColor: "#f1e05a" }} title="JavaScript 75%" />
              <div className="gh-lang-segment" style={{ width: "15%", backgroundColor: "#563d7c" }} title="CSS 15%" />
              <div className="gh-lang-segment" style={{ width: "10%", backgroundColor: "#e34c26" }} title="HTML 10%" />
            </div>
            <div className="gh-lang-legend">
              <div><span className="gh-lang-dot" style={{ backgroundColor: "#f1e05a" }} /> JavaScript 75%</div>
              <div><span className="gh-lang-dot" style={{ backgroundColor: "#563d7c" }} /> CSS 15%</div>
              <div><span className="gh-lang-dot" style={{ backgroundColor: "#e34c26" }} /> HTML 10%</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Backblaze B2 Upload Modal */}
      {showUploadModal && (
        <div className="gh-upload-modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="gh-upload-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2>☁️ Upload Files or Folder to Backblaze B2</h2>
              <button
                style={{ background: "none", border: "none", color: "#8b949e", fontSize: "1.2rem", cursor: "pointer" }}
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
                  <strong style={{ color: "#f0f6fc", display: "block", marginBottom: "4px" }}>
                    Selected Files ({filesToUpload.length}):
                  </strong>
                  {filesToUpload.slice(0, 10).map((f, i) => (
                    <div key={i} style={{ color: "#8b949e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      📄 {f.webkitRelativePath || f.name} ({(f.size / 1024).toFixed(1)} KB)
                    </div>
                  ))}
                  {filesToUpload.length > 10 && (
                    <div style={{ color: "#58a6ff", marginTop: "4px" }}>
                      + {filesToUpload.length - 10} more files...
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "#c9d1d9", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                  Commit Message
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="e.g. Upload project files and folders"
                  style={{ width: "100%", background: "#0d1117", border: "1px solid #30363d", color: "#c9d1d9", padding: "8px 12px", borderRadius: "6px", font: "inherit" }}
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
                <div style={{ marginTop: "14px", fontSize: "13px", fontWeight: 600, color: uploadError ? "#f85149" : "#3fb950" }}>
                  {uploadMessage}
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default RepoDetail;

