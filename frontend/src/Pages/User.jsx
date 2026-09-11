import User_header from './User_header';
import "./style/User.css";
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';

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

function User() {
  const navigate = useNavigate();
  const { username: paramUsername } = useParams();
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Retrieve logged-in user details
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const loggedInUsername = localStorage.getItem("username") || currentUser.username || currentUser.name || "";
  const activeUsername = paramUsername || loggedInUsername || "Developer";

  // Redirect /User to /:username if logged in
  useEffect(() => {
    if (!paramUsername && loggedInUsername && !RESERVED_KEYWORDS.includes(loggedInUsername.toLowerCase())) {
      navigate(`/${loggedInUsername}`, { replace: true });
    }
  }, [paramUsername, loggedInUsername, navigate]);

  useEffect(() => {
    async function loadUserRepos() {
      try {
        setLoading(true);
        const ownerEmail = currentUser.gmail || currentUser.email || "";

        let query = "";
        if (paramUsername) {
          query = `?owner=${encodeURIComponent(paramUsername)}`;
        } else if (ownerEmail) {
          query = `?ownerEmail=${encodeURIComponent(ownerEmail)}`;
        } else if (loggedInUsername) {
          query = `?owner=${encodeURIComponent(loggedInUsername)}`;
        }

        const res = await fetch(`${API_BASE_URL}/api/repos${query}`);
        if (res.ok) {
          const data = await res.json();
          setRepos(data);
        }
      } catch (err) {
        console.error("Error loading user repos:", err);
      } finally {
        setLoading(false);
      }
    }

    loadUserRepos();
  }, [paramUsername, loggedInUsername]);

  return (
    <main className="app">
      <User_header />
      <div className="user-page">
        <section className="welcome-panel">
          <div>
            <p className="eyebrow">@{activeUsername.toUpperCase()}'S WORKSPACE</p>
            <h1>Build something<br /><em>worth sharing.</em></h1>
            <p className="welcome-copy">Keep your projects close, collaborate with your team, and turn good ideas into repositories.</p>
          </div>
          <div className="orbit-mark" aria-hidden="true">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="orbit-dot" />
          </div>
        </section>

        <aside className="workspace-sidebar">
          <div className="dash-header">
            <div>
              <p className="eyebrow">OVERVIEW</p>
              <h2>Your activity</h2>
            </div>
            <span className="status-dot" aria-label="All systems operational" />
          </div>
          <div className="activity-stat">
            <strong>{repos.length}</strong>
            <span>Repositories</span>
          </div>
          <div className="activity-stat">
            <strong>{repos.reduce((acc, r) => acc + (r.commits || 1), 0)}</strong>
            <span>Contributions</span>
          </div>
          <div className="sidebar-note">
            <span className="note-line" />
            <p>
              {repos.length > 0
                ? `${repos.length} active repository available in your workspace.`
                : "Your workspace is ready for its first project."}
            </p>
          </div>
        </aside>

        <section className="repository-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">COLLECTION ({repos.length})</p>
              <h2>@{activeUsername}'s Repositories</h2>
            </div>
            <button className="new-repository" type="button" onClick={() => navigate('/Repository')}>
              <span aria-hidden="true">+</span> New repository
            </button>
          </div>

          {loading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#87998d" }}>
              Loading repositories from database...
            </div>
          ) : repos.length > 0 ? (
            <div className="repo-grid-list">
              {repos.map((repo) => {
                const ownerName = repo.owner || activeUsername;
                const repoPath = `/${ownerName}/${encodeURIComponent(repo.name || repo.repositoryName)}`;
                return (
                  <div
                    key={repo._id || repo.id}
                    className="repo-item-card"
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(repoPath)}
                  >
                    <div className="repo-card-top">
                      <h3 className="repo-card-title">
                        <Link to={repoPath} style={{ color: "inherit", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                          {repo.name}
                        </Link>
                      </h3>
                      <span className={`repo-badge ${repo.visibility === 'public' || repo.visibility === 'Public' ? 'public' : 'private'}`}>
                        {repo.visibility === 'public' || repo.visibility === 'Public' ? 'Public' : 'Private'}
                      </span>
                    </div>

                    <p className="repo-card-desc">
                      {repo.description || "No description provided for this repository."}
                    </p>

                    <div className="repo-card-meta">
                      <span className="repo-owner">👤 Owner: <strong>{ownerName}</strong></span>
                      {repo.ignoreGitignore ? (
                        <span className="repo-gitignore-tag no-gitignore">🚫 No .gitignore</span>
                      ) : (
                        <span className="repo-gitignore-tag">📄 Standard .gitignore</span>
                      )}
                      <span className="repo-date">
                        📅 {repo.creationDate || (repo.createdAt ? repo.createdAt.split('T')[0] : "Recently")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-repository">
              <div className="folder-icon" aria-hidden="true">⌁</div>
              <h3>No repositories yet</h3>
              <p>Create your first repository to start organizing and sharing your work.</p>
              <button className="empty-action" type="button" onClick={() => navigate('/Repository')}>
                Create a repository <span aria-hidden="true">-&gt;</span>
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default User;
