import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import User_header from "./User_header";
import { getStarredRepos, toggleStarRepo } from "../utils/starredUtils";
import "./style/Stars.css";

export default function Stars() {
  const navigate = useNavigate();
  const [starredRepos, setStarredRepos] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setStarredRepos(getStarredRepos());
  }, []);

  function handleUnstar(repo, e) {
    e.stopPropagation();
    toggleStarRepo(repo);
    setStarredRepos(getStarredRepos());
  }

  const filtered = starredRepos.filter((r) => {
    const q = search.toLowerCase();
    const name = (r.name || r.repositoryName || "").toLowerCase();
    const owner = (r.owner || "").toLowerCase();
    const desc = (r.description || "").toLowerCase();
    return name.includes(q) || owner.includes(q) || desc.includes(q);
  });

  return (
    <div className="stars-page-container">
      <User_header />
      <main className="stars-content-inner">
        <div className="stars-header-banner">
          <div>
            <h1 className="page-title">
              <span>⭐ Starred Repositories</span>
              <span className="stars-count-badge">{starredRepos.length}</span>
            </h1>
            <p style={{ color: "#8b949e", fontSize: "0.9rem", marginTop: "6px" }}>
              Repositories you have bookmarked for quick access
            </p>
          </div>
          <button
            className="stars-browse-btn"
            onClick={() => navigate("/all_repository")}
          >
            Explore Repositories
          </button>
        </div>

        {starredRepos.length > 0 && (
          <div className="stars-search-bar">
            <input
              type="text"
              className="stars-search-input"
              placeholder="Search your starred repositories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="stars-empty-state">
            <div className="stars-empty-icon">⭐</div>
            <h3>
              {starredRepos.length === 0
                ? "No starred repositories yet"
                : "No matching starred repositories"}
            </h3>
            <p>
              {starredRepos.length === 0
                ? "Click the '⭐ Star' button on any repository to save it here for fast navigation."
                : "Try a different search query."}
            </p>
            {starredRepos.length === 0 && (
              <button
                className="stars-browse-btn"
                onClick={() => navigate("/all_repository")}
              >
                Browse All Repositories
              </button>
            )}
          </div>
        ) : (
          <div className="stars-grid-list">
            {filtered.map((repo) => {
              const ownerName = repo.owner || "Developer";
              const displayName = repo.name || repo.repositoryName || "untitled-repo";
              const ownerSlug = ownerName.trim().replace(/\s+/g, "-").toLowerCase();
              const repoPath = `/${ownerSlug}/${encodeURIComponent(displayName)}`;

              return (
                <div
                  key={repo._id || repo.id}
                  className="starred-card"
                  onClick={() => navigate(repoPath)}
                  style={{ cursor: "pointer" }}
                >
                  <div>
                    <div className="starred-card-header">
                      <Link
                        to={repoPath}
                        className="starred-card-title"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ownerName} / {displayName}
                      </Link>
                      <span
                        className={`starred-badge ${
                          repo.visibility === "Public" || repo.visibility === "public"
                            ? "public"
                            : "private"
                        }`}
                      >
                        {repo.visibility || "Public"}
                      </span>
                    </div>

                    <p className="starred-card-desc">
                      {repo.description || "No description provided for this repository."}
                    </p>
                  </div>

                  <div className="starred-card-footer">
                    <span className="starred-meta-info">
                      Owner: <strong>{ownerName}</strong>
                    </span>
                    <button
                      className="starred-unstar-btn"
                      onClick={(e) => handleUnstar(repo, e)}
                      title="Unstar repository"
                    >
                      ★ Starred
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}