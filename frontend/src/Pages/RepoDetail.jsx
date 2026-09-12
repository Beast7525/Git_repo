import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import User_header from "./User_header";
import NotFound from "./NotFound";
import "./style/User.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");

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
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState(false);

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

  function handleFileSelection(event) {
    setSelectedFiles(Array.from(event.target.files || []));
    setUploadMessage("");
    setUploadError(false);
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.includes(",") ? result.split(",").pop() : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleUploadSubmit(event) {
    event.preventDefault();

    if (!repo?._id || selectedFiles.length === 0) {
      setUploadError(true);
      setUploadMessage("Choose at least one file to create the initial commit.");
      return;
    }

    setUploading(true);
    setUploadMessage("");
    setUploadError(false);

    try {
      const files = await Promise.all(selectedFiles.map(async (file) => ({
        path: file.webkitRelativePath || file.name,
        name: file.name,
        type: file.type,
        size: file.size,
        content: await readFileAsBase64(file)
      })));

      const res = await fetch(`${API_BASE_URL}/api/repos/${repo._id}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, remoteUrl: remoteUrl.trim() })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setRepo(data.repo);
      setSelectedFiles([]);
      setUploadError(data.repo?.pushStatus === "failed");
      setUploadMessage(data.message || "Initial commit created.");
    } catch (error) {
      setUploadError(true);
      setUploadMessage(error.message || "Upload failed.");
    } finally {
      setUploading(false);
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
      <main className="app">
        <User_header />
        <div style={{ textAlign: "center", padding: "80px", color: "rgba(255, 255, 255, 0.7)" }}>
          Loading repository details...
        </div>
      </main>
    );
  }

  const isPublic = repo.visibility === "public" || repo.visibility === "Public";
  const hasInitialCommit = Number(repo.commits || 0) > 0 && repo.lastCommit?.hash;

  return (
    <main className="app">
      <User_header />
      <div style={{ maxWidth: "1100px", margin: "30px auto", padding: "0 20px", color: "#fff" }}>
        {/* Navigation Breadcrumb */}
        <div style={{ marginBottom: "20px", fontSize: "0.95rem" }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              background: "none",
              border: "none",
              color: "#818cf8",
              cursor: "pointer",
              fontSize: "0.95rem",
              padding: 0,
              marginRight: "16px"
            }}
          >
            &larr; Back
          </button>
          <Link to={`/${username}`} style={{ color: "#818cf8", textDecoration: "none", fontWeight: "600" }}>
            {username}
          </Link>
          <span style={{ margin: "0 8px", color: "rgba(255,255,255,0.4)" }}>/</span>
          <strong style={{ color: "#fff" }}>{repo.name}</strong>
        </div>

        {/* Header Details Card */}
        <section style={{
          background: "rgba(15, 23, 42, 0.8)",
          padding: "24px",
          borderRadius: "14px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          marginBottom: "24px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <h1 style={{ margin: 0, fontSize: "1.8rem" }}>📦 {repo.name}</h1>
                <span className={`repo-badge ${isPublic ? "public" : "private"}`}>
                  {isPublic ? "Public" : "Private"}
                </span>
              </div>
              <p style={{ margin: "10px 0 0", color: "rgba(255, 255, 255, 0.7)", fontSize: "1rem" }}>
                {repo.description || "No description provided for this repository."}
              </p>
            </div>
            <button
              className="new-repository"
              type="button"
              onClick={() => navigate(`/${username}`)}
            >
              View Owner Profile
            </button>
          </div>

          <hr style={{ borderColor: "rgba(255, 255, 255, 0.1)", margin: "20px 0" }} />

          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", fontSize: "0.9rem", color: "rgba(255,255,255,0.8)" }}>
            <span>👤 Owner: <strong>{repo.owner || username}</strong></span>
            <span>🔨 Commits: <strong>{repo.commits || 0}</strong></span>
            <span>👥 Contributors: <strong>{repo.contributors || 1}</strong></span>
            <span>⭐ Stars: <strong>{repo.stars || 0}</strong></span>
            <span>🍴 Forks: <strong>{repo.forks || 0}</strong></span>
            {repo.ignoreGitignore ? (
              <span style={{ color: "#f43f5e" }}>🚫 No .gitignore</span>
            ) : (
              <span style={{ color: "#34d399" }}>📄 Standard .gitignore</span>
            )}
          </div>
        </section>

        {!hasInitialCommit && (
          <section className="repo-upload-panel">
            <div>
              <p className="repository-eyebrow">INITIAL COMMIT</p>
              <h2>Upload project files</h2>
              <p className="repo-upload-copy">
                Select files or a project folder. Gitrepo will run git init, add everything, create the Initial commit,
                rename the branch to main, and push to origin when you provide a remote URL.
              </p>
            </div>

            <form className="repo-upload-form" onSubmit={handleUploadSubmit}>
              <label htmlFor="repo-files">Files</label>
              <input
                id="repo-files"
                type="file"
                multiple
                onChange={handleFileSelection}
              />
              <label htmlFor="repo-folder">Folder</label>
              <input
                id="repo-folder"
                type="file"
                multiple
                webkitdirectory=""
                onChange={handleFileSelection}
              />
              <span className="repo-upload-hint">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
                  : "Choose a folder, or use your browser file picker to select multiple files."}
              </span>

              <label htmlFor="remote-url">Origin remote URL <span>(optional)</span></label>
              <input
                id="remote-url"
                type="url"
                value={remoteUrl}
                onChange={(event) => setRemoteUrl(event.target.value)}
                placeholder="https://github.com/user/repository.git"
              />

              <button className="new-repository" type="submit" disabled={uploading}>
                {uploading ? "Creating initial commit..." : "Upload and commit"}
              </button>

              {uploadMessage && (
                <p className={`repo-upload-status ${uploadError ? "error" : "success"}`}>
                  {uploadMessage}
                </p>
              )}
            </form>
          </section>
        )}

        {/* Repository Code & Content Preview Card */}
        <section style={{
          background: "rgba(15, 23, 42, 0.6)",
          borderRadius: "14px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          overflow: "hidden"
        }}>
          <div style={{
            background: "rgba(30, 41, 59, 0.8)",
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "0.9rem"
          }}>
            <strong style={{ color: "#818cf8" }}>{hasInitialCommit ? `main · ${repo.files?.length || 0} files` : "Waiting for upload"}</strong>
          </div>
          <div style={{ padding: "30px", lineHeight: "1.6" }}>
            <h2 style={{ fontSize: "1.4rem", marginTop: 0 }}>{repo.name}</h2>
            <p>{repo.description || "Welcome to the repository!"}</p>
            {hasInitialCommit && (
              <>
                <div className="repo-commit-summary">
                  <span>Latest commit</span>
                  <strong>{repo.lastCommit.hash.slice(0, 7)}</strong>
                  <span>{repo.lastCommit.message}</span>
                </div>
                <div className="repo-file-list">
                  {(repo.files || []).map((file) => (
                    <div className="repo-file-row" key={file.path}>
                      <span>📄 {file.path}</span>
                      <small>{Math.max(1, Math.round((file.size || 0) / 1024))} KB</small>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{
              background: "rgba(0, 0, 0, 0.3)",
              padding: "16px",
              borderRadius: "8px",
              fontFamily: "monospace",
              fontSize: "0.88rem",
              marginTop: "16px"
            }}>
              $ git clone {repo.remoteUrl || `https://gitrepo.com/${username}/${repo.name}.git`}<br />
              $ cd {repo.name}<br />
              $ npm install
            </div>
            {repo.pushStatus === "failed" && (
              <p className="repo-upload-status error">
                Local commit exists, but push failed: {repo.pushMessage}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default RepoDetail;
