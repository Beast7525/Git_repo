import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import User_header from "./User_header";
import NotFound from "./NotFound";
import profileImg from "./assert/profile.png";
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

function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username || RESERVED_KEYWORDS.includes(username.toLowerCase())) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    async function fetchProfileAndRepos() {
      try {
        setLoading(true);
        setNotFound(false);

        // Fetch user profile info
        let fetchedUser = null;
        try {
          const userRes = await fetch(`${API_BASE_URL}/api/auth/user/${encodeURIComponent(username)}`);
          if (userRes.ok) {
            const userData = await userRes.json();
            fetchedUser = userData.user;
          }
        } catch (err) {
          console.warn("Could not fetch user profile from auth API:", err);
        }

        // Fallback to localStorage if logged-in user matches username
        const localUser = JSON.parse(localStorage.getItem("user") || "{}");
        const storedName = localStorage.getItem("username") || localUser.username || "";

        if (!fetchedUser && storedName.toLowerCase() === username.toLowerCase()) {
          fetchedUser = {
            username: storedName,
            gmail: localUser.gmail || localUser.email || "",
            createdAt: localUser.createdAt || new Date().toISOString()
          };
        }

        // Fetch user's repositories
        const repoRes = await fetch(`${API_BASE_URL}/api/repos?owner=${encodeURIComponent(username)}`);
        let fetchedRepos = [];
        if (repoRes.ok) {
          fetchedRepos = await repoRes.json();
        }

        // If no user found in DB, local storage, and no repos exist, mark 404
        if (!fetchedUser && fetchedRepos.length === 0) {
          setNotFound(true);
        } else {
          setUserInfo(fetchedUser || { username, gmail: "" });
          setRepos(fetchedRepos);
        }
      } catch (error) {
        console.error("Error loading profile:", error);
        setNotFound(true);
      } finally {
        setLoading(false);
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
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <img
              src={profileImg}
              alt={username}
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                border: "3px solid #6366f1",
                objectFit: "cover",
                marginBottom: "12px"
              }}
            />
            <h2 style={{ fontSize: "1.5rem", color: "#fff", margin: "4px 0" }}>
              {userInfo?.username || username}
            </h2>
            <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: "0.9rem" }}>
              @{username}
            </p>
            {userInfo?.gmail && (
              <p style={{ color: "#818cf8", fontSize: "0.85rem", marginTop: "4px" }}>
                ✉️ {userInfo.gmail}
              </p>
            )}
          </div>

          <div className="activity-stat">
            <strong>{repos.length}</strong>
            <span>Repositories</span>
          </div>

          <div className="activity-stat">
            <strong>{repos.reduce((acc, r) => acc + (r.commits || 1), 0)}</strong>
            <span>Total Commits</span>
          </div>

          <div className="sidebar-note" style={{ marginTop: "20px" }}>
            <span className="note-line" />
            <p>Gitrepo public profile page for @{username}.</p>
          </div>
        </aside>

        {/* Repositories Panel */}
        <section className="repository-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">USER PROFILE ({repos.length})</p>
              <h2>@{username}'s Repositories</h2>
            </div>
            <button className="new-repository" type="button" onClick={() => navigate("/Repository")}>
              <span aria-hidden="true">+</span> New repository
            </button>
          </div>

          {loading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#87998d" }}>
              Loading user profile and repositories...
            </div>
          ) : repos.length > 0 ? (
            <div className="repo-grid-list">
              {repos.map((repo) => (
                <div key={repo._id || repo.id} className="repo-item-card">
                  <div className="repo-card-top">
                    <h3 className="repo-card-title">
                      <Link
                        to={`/${username}/${encodeURIComponent(repo.name || repo.repositoryName)}`}
                        style={{ color: "#818cf8", textDecoration: "none" }}
                      >
                        {repo.name}
                      </Link>
                    </h3>
                    <span className={`repo-badge ${repo.visibility === "public" || repo.visibility === "Public" ? "public" : "private"}`}>
                      {repo.visibility === "public" || repo.visibility === "Public" ? "Public" : "Private"}
                    </span>
                  </div>

                  <p className="repo-card-desc">
                    {repo.description || "No description provided for this repository."}
                  </p>

                  <div className="repo-card-meta">
                    <span className="repo-owner">👤 Owner: <strong>{repo.owner || username}</strong></span>
                    <span>🔨 {repo.commits || 1} commits</span>
                    <span className="repo-date">
                      📅 {repo.creationDate || (repo.createdAt ? repo.createdAt.split("T")[0] : "Recently")}
                    </span>
                  </div>
                </div>
              ))}
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
