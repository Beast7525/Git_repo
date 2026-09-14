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
  const [fileToUpload, setFileToUpload] = useState(null);
  const [commitMessage, setCommitMessage] = useState("");
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

  function handleFileChange(event) {
    if (event.target.files && event.target.files[0]) {
      setFileToUpload(event.target.files[0]);
      setUploadMessage("");
      setUploadError(false);
    }
  }

  async function handleFileUploadSubmit(event) {
    event.preventDefault();

    if (!fileToUpload) {
      setUploadError(true);
      setUploadMessage("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setUploadMessage("");
    setUploadError(false);

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("message", commitMessage.trim() || `Upload ${fileToUpload.name}`);

      const res = await fetch(`${API_BASE_URL}/api/repos/find/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/upload`, {
        method: "POST",
        body: formData
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }

      setRepo(data.repo);
      setFileToUpload(null);
      setCommitMessage("");
      setUploadError(false);
      setUploadMessage(data.message || "File uploaded to Backblaze B2 cloud storage!");
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
  const repoFiles = repo.files || [];

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
              color: "#a7dda6",
              cursor: "pointer",
              fontSize: "0.95rem",
              padding: 0,
              marginRight: "16px"
            }}
          >
            &larr; Back
          </button>
          <Link to={`/${username}`} style={{ color: "#a7dda6", textDecoration: "none", fontWeight: "600" }}>
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
            <span>📂 Files: <strong>{repoFiles.length}</strong></span>
            <span>👥 Contributors: <strong>{repo.contributors || 1}</strong></span>
            <span>⭐ Stars: <strong>{repo.stars || 0}</strong></span>
            <span>🍴 Forks: <strong>{repo.forks || 0}</strong></span>
          </div>
        </section>

        {/* Upload File to Backblaze B2 Storage Form */}
        <section className="repo-upload-panel" style={{ marginBottom: "24px" }}>
          <div>
            <p className="eyebrow" style={{ color: "#a7dda6" }}>BACKBLAZE CLOUD STORAGE</p>
            <h2>Upload File to Repository</h2>
            <p className="repo-upload-copy">
              Choose a file to upload directly to <strong>Backblaze B2 Cloud Storage</strong>. The file will be stored safely in the cloud and attached to this repository.
            </p>
          </div>

          <form className="repo-upload-form" onSubmit={handleFileUploadSubmit}>
            <label htmlFor="repo-file-input">Select File</label>
            <input
              id="repo-file-input"
              type="file"
              onChange={handleFileChange}
              required
            />
            {fileToUpload && (
              <span className="repo-upload-hint" style={{ color: "#a7dda6" }}>
                Selected: {fileToUpload.name} ({(fileToUpload.size / 1024).toFixed(1)} KB)
              </span>
            )}

            <label htmlFor="commit-msg">Commit / Upload Message <span>(optional)</span></label>
            <input
              id="commit-msg"
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="e.g. Add main application source code"
            />

            <button className="new-repository" type="submit" disabled={uploading}>
              {uploading ? "Uploading to Backblaze..." : "☁️ Upload to Backblaze Cloud"}
            </button>

            {uploadMessage && (
              <p className={`repo-upload-status ${uploadError ? "error" : "success"}`}>
                {uploadMessage}
              </p>
            )}
          </form>
        </section>

        {/* Repository Code & File Browser Preview Card */}
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
            justifyContent: "space-between",
            fontSize: "0.9rem"
          }}>
            <strong style={{ color: "#a7dda6" }}>
              📁 Repository Files ({repoFiles.length})
            </strong>
            {repo.lastCommit?.message && (
              <span style={{ fontSize: "0.82rem", color: "rgba(255, 255, 255, 0.6)" }}>
                Latest: {repo.lastCommit.message}
              </span>
            )}
          </div>

          <div style={{ padding: "24px", lineHeight: "1.6" }}>
            {repoFiles.length > 0 ? (
              <div className="repo-file-list">
                {repoFiles.map((file, idx) => (
                  <div className="repo-file-row" key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span>📄 <strong>{file.path || file.b2FileName}</strong></span>
                      <span style={{ fontSize: "0.72rem", background: "rgba(167, 221, 166, 0.15)", color: "#a7dda6", padding: "2px 8px", borderRadius: "999px", border: "1px solid rgba(167, 221, 166, 0.3)" }}>
                        ☁️ Backblaze B2
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <small>{Math.max(1, Math.round((file.size || 0) / 1024))} KB</small>
                      {file.b2Url && (
                        <a
                          href={file.b2Url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#a7dda6", textDecoration: "underline", fontSize: "0.84rem" }}
                        >
                          Download / View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "30px", color: "rgba(255,255,255,0.6)" }}>
                <p>No files uploaded to this repository yet.</p>
                <p style={{ fontSize: "0.85rem", margin: 0 }}>Use the form above to upload files into Backblaze B2 Cloud Storage.</p>
              </div>
            )}

            <div style={{
              background: "rgba(0, 0, 0, 0.3)",
              padding: "16px",
              borderRadius: "8px",
              fontFamily: "monospace",
              fontSize: "0.88rem",
              marginTop: "24px"
            }}>
              $ git clone {repo.remoteUrl || `https://gitrepo.com/${username}/${repo.name}.git`}<br />
              $ cd {repo.name}<br />
              $ npm install
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default RepoDetail;
