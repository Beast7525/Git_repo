import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import User_header from "./User_header";
import NotFound from "./NotFound";
import profileImg from "./assert/profile.png";
import "./style/User.css";
import { useLoading } from "../context/LoadingContext";
import { apiFetch } from "../auth/apiFetch";

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

function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();
  const [userInfo, setUserInfo] = useState(null);
  const [repos, setRepos] = useState([]);
  const [notFound, setNotFound] = useState(false);

  const [isOwner, setIsOwner] = useState(false);
  const [netlifyTokenInput, setNetlifyTokenInput] = useState("");
  const [netlifyStatus, setNetlifyStatus] = useState({ hasToken: false, tokenMasked: "" });
  const [netlifyLoading, setNetlifyLoading] = useState(false);
  const [netlifyMsg, setNetlifyMsg] = useState({ text: "", type: "" });
  const [editingToken, setEditingToken] = useState(false);

  async function fetchNetlifyTokenStatus() {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/auth/netlify-token`);
      if (res.ok) {
        const data = await res.json();
        setNetlifyStatus(data);
      }
    } catch (err) {
      console.warn("Error checking Netlify token status:", err);
    }
  }

  async function handleSaveNetlifyToken(e) {
    if (e && e.preventDefault) e.preventDefault();
    setNetlifyLoading(true);
    setNetlifyMsg({ text: "", type: "" });
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/auth/netlify-token`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: netlifyTokenInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setNetlifyStatus({ hasToken: data.hasToken, tokenMasked: data.tokenMasked });
        setNetlifyMsg({ text: data.message, type: "success" });
        setNetlifyTokenInput("");
        setEditingToken(false);
      } else {
        setNetlifyMsg({ text: data.message || "Failed to save token", type: "error" });
      }
    } catch (err) {
      setNetlifyMsg({ text: "Network error saving Netlify token", type: "error" });
    } finally {
      setNetlifyLoading(false);
    }
  }

  useEffect(() => {
    if (!username || RESERVED_KEYWORDS.includes(username.toLowerCase())) {
      setNotFound(true);
      return;
    }

    const localUser = JSON.parse(localStorage.getItem("user") || "{}");
    const storedName = localStorage.getItem("username") || localUser.username || "";
    const normalizeStr = (str) => (str || "").toLowerCase().replace(/[\s-_]+/g, "");
    const matching = normalizeStr(storedName) === normalizeStr(username) || normalizeStr(localUser.gmail) === normalizeStr(username);
    setIsOwner(matching);

    if (matching) {
      fetchNetlifyTokenStatus();
    }

    async function fetchProfileAndRepos() {
      try {
        startLoading();
        setNotFound(false);

        // Fetch user profile info
        let fetchedUser = null;
        try {
          const userRes = await apiFetch(`${API_BASE_URL}/api/auth/user/${encodeURIComponent(username)}`);
          if (userRes.ok) {
            const userData = await userRes.json();
            fetchedUser = userData.user;
          }
        } catch (err) {
          console.warn("Could not fetch user profile from auth API:", err);
        }

        // Fallback to localStorage if logged-in user matches username
        if (!fetchedUser && (normalizeStr(storedName) === normalizeStr(username) || normalizeStr(localUser.gmail) === normalizeStr(username))) {
          fetchedUser = {
            username: storedName || username,
            gmail: localUser.gmail || localUser.email || "",
            createdAt: localUser.createdAt || new Date().toISOString()
          };
        }

        // Fetch user's repositories
        const repoParams = new URLSearchParams({ owner: username });
        const profileEmail = fetchedUser?.gmail || localUser.gmail || localUser.email || "";
        const storedIdentityMatchesProfile =
          normalizeStr(storedName) === normalizeStr(username) ||
          normalizeStr(localUser.username) === normalizeStr(username) ||
          normalizeStr(localUser.name) === normalizeStr(username);

        if (fetchedUser?.gmail || storedIdentityMatchesProfile) {
          if (profileEmail) {
            repoParams.append("ownerEmail", profileEmail);
          }
        }

        const repoRes = await apiFetch(`${API_BASE_URL}/api/repos?${repoParams.toString()}`);
        let fetchedRepos = [];
        if (repoRes.ok) {
          fetchedRepos = await repoRes.json();
        }

        // Fallback to the signed-in user's email when the URL slug differs from the stored display name.
        if (fetchedRepos.length === 0 && profileEmail) {
          const repoEmailRes = await apiFetch(`${API_BASE_URL}/api/repos?ownerEmail=${encodeURIComponent(profileEmail)}`);
          if (repoEmailRes.ok) {
            const emailRepos = await repoEmailRes.json();
            if (emailRepos.length > 0) {
              fetchedRepos = emailRepos;
            }
          }
        }

        // Display profile if user exists, repos exist, or if matching username format
        const cleanName = (fetchedUser?.username || username).replace(/[-_]/g, " ");
        setUserInfo(fetchedUser || { username: cleanName, gmail: localUser.gmail || "" });
        setRepos(fetchedRepos);
      } catch (error) {
        console.error("Error loading profile:", error);
        setNotFound(true);
      } finally {
        stopLoading();
      }
    }

    fetchProfileAndRepos();
  }, [username]);

  if (notFound) {
    return (
      <NotFound
        title="User Not Found"
        message={`The user "@${username}" does not exist on GitRepo.`}
      />
    );
  }

  return (
    <main className="app">
      <User_header />
      <div className="user-page" style={{ paddingTop: "20px" }}>
        {/* Profile Sidebar */}
        <aside className="workspace-sidebar" style={{ alignSelf: "flex-start" }}>


          <div className="activity-stat">
            <strong>{repos.length}</strong>
            <span>Repositories</span>
          </div>

          <div className="activity-stat">
            <strong>{repos.reduce((acc, r) => acc + (r.commits || 0), 0)}</strong>
            <span>Total Commits</span>
          </div>

          <div className="sidebar-note" style={{ marginTop: "20px" }}>
            <span className="note-line" />
            <p>Gitrepo public profile page for @{username}.</p>
          </div>
        </aside>

        {/* Repositories Panel */}
        <section className="repository-panel">
          {isOwner && (
            <div style={{
              background: "rgba(12, 26, 22, 0.75)",
              border: "1px solid rgba(167, 221, 166, 0.3)",
              borderRadius: "14px",
              padding: "16px 20px",
              marginBottom: "24px",
              backdropFilter: "blur(12px)",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#f5f6ef", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🚀</span> Netlify Account Configuration
                </h3>
                {netlifyStatus.hasToken && !editingToken && (
                  <span style={{ fontSize: "0.75rem", background: "rgba(167, 221, 166, 0.2)", color: "#a7dda6", padding: "3px 10px", borderRadius: "99px", fontWeight: "600" }}>
                    ✅ Token Connected
                  </span>
                )}
              </div>

              <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#9eafa3", lineHeight: "1.4" }}>
                GitRepo deploys your websites directly to <strong>your personal Netlify account</strong>. Save your Personal Access Token below to enable deployments.
              </p>

              {netlifyMsg.text && (
                <div style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontSize: "0.82rem",
                  marginBottom: "12px",
                  background: netlifyMsg.type === "success" ? "rgba(167, 221, 166, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: netlifyMsg.type === "success" ? "#a7dda6" : "#f87171",
                  border: `1px solid ${netlifyMsg.type === "success" ? "rgba(167, 221, 166, 0.3)" : "rgba(239, 68, 68, 0.3)"}`
                }}>
                  {netlifyMsg.text}
                </div>
              )}

              {netlifyStatus.hasToken && !editingToken ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255, 255, 255, 0.04)", padding: "10px 14px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <div style={{ fontSize: "0.85rem", color: "#d1d5db" }}>
                    Personal Token: <code style={{ background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: "4px", color: "#a7dda6" }}>{netlifyStatus.tokenMasked}</code>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setEditingToken(true)}
                      style={{ background: "rgba(167, 221, 166, 0.15)", border: "1px solid rgba(167, 221, 166, 0.3)", color: "#a7dda6", padding: "5px 12px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" }}
                    >
                      Update Token
                    </button>
                    <button
                      type="button"
                      onClick={() => { setNetlifyTokenInput(""); handleSaveNetlifyToken(); }}
                      style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", padding: "5px 12px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveNetlifyToken} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <input
                    type="password"
                    placeholder="Paste your Netlify Personal Access Token (e.g. nfp_...)"
                    value={netlifyTokenInput}
                    onChange={(e) => setNetlifyTokenInput(e.target.value)}
                    required={!netlifyStatus.hasToken}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "rgba(0, 0, 0, 0.4)",
                      border: "1px solid rgba(167, 221, 166, 0.3)",
                      color: "#fff",
                      fontSize: "0.85rem"
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <a
                      href="https://app.netlify.com/user/applications#personal-access-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.78rem", color: "#818cf8", textDecoration: "none" }}
                    >
                      ↗ Create Netlify Personal Access Token
                    </a>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {editingToken && (
                        <button
                          type="button"
                          onClick={() => setEditingToken(false)}
                          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#9ca3af", padding: "6px 12px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={netlifyLoading}
                        style={{
                          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                          border: "none",
                          color: "#fff",
                          padding: "6px 16px",
                          borderRadius: "6px",
                          fontSize: "0.82rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          opacity: netlifyLoading ? 0.7 : 1
                        }}
                      >
                        {netlifyLoading ? "Saving..." : "Save Netlify Token"}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="panel-heading">
            <div>
              <p className="eyebrow">USER PROFILE ({repos.length})</p>
              <h2>@{username}'s Repositories</h2>
            </div>
            <button className="new-repository" type="button" onClick={() => navigate("/Repository")}>
              <span aria-hidden="true">+</span> New repository
            </button>
          </div>

          {repos.length > 0 ? (
            <div className="repo-grid-list">
              {repos.map((repo) => {
                const displayName = repo.name || repo.repositoryName || "untitled-repository";
                const visibility = String(repo.visibility || "public").trim().toLowerCase();
                const isTeamOnly = visibility === "team member" || visibility === "team";
                return (
                  <div key={repo._id || repo.id} className="repo-item-card">
                    <div className="repo-card-top">
                      <h3 className="repo-card-title">
                        <Link
                          to={`/${username}/${encodeURIComponent(displayName)}`}
                          style={{ color: "#818cf8", textDecoration: "none" }}
                        >
                          {displayName}
                        </Link>
                      </h3>
                      <span className={`repo-badge ${visibility === "public" ? "public" : isTeamOnly ? "team" : "private"}`}>
                        {visibility === "public" ? "Public" : isTeamOnly ? (repo.groupName || "Team") : "Private"}
                      </span>
                    </div>

                    <p className="repo-card-desc">
                      {repo.description || "No description provided for this repository."}
                    </p>

                    <div className="repo-card-meta">
                      <span className="repo-owner">Owner: <strong>{repo.owner || username}</strong></span>
                      <span>🔨 {repo.commits || 0} commits</span>
                      <span className="repo-date">
                        📅 {repo.creationDate || (repo.createdAt ? repo.createdAt.split("T")[0] : "Recently")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-repository">
              <div className="folder-icon" aria-hidden="true">⌁</div>
              <h3>No public repositories</h3>
              <p>This user has not created any repositories yet.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default Profile;
