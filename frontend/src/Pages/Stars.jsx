import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import User_header from "./User_header";
import { apiFetch } from "../auth/apiFetch";
import "./style/Stars.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

export default function Stars() {
  const navigate = useNavigate();
  const [starredRepos, setStarredRepos] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStarred = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/repos/starred`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.message) || `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setStarredRepos(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      console.error("Failed to load starred repositories:", err);
      setError(err.message || "Could not load your starred repositories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialLoad() {
      await loadStarred();
    }
    initialLoad();
  }, [loadStarred]);

  // The card path mirrors the /:username/:repoName route, and the API resolves owners
  // case-insensitively, so the repository the user stars is the one linked here.
  async function handleUnstar(repo, e) {
    e.stopPropagation();
    const previous = starredRepos;
    setStarredRepos((list) => list.filter((r) => r._id !== repo._id));
    try {
      const owner = repo.owner || repo.ownerEmail || "";
      const name = repo.name || repo.repositoryName || "";
      const res = await apiFetch(
        `${API_BASE_URL}/api/repos/find/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/star`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.message) || `Request failed with status ${res.status}`);
      }
    } catch (err) {
      console.error("Failed to unstar repository:", err);
      setStarredRepos(previous);
      alert(err.message || "Could not remove this repository from your stars.");
    }
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

        {loading ? (
          <div className="stars-empty-state">
            <h3>Loading your starred repositories...</h3>
          </div>
        ) : error ? (
          <div className="stars-empty-state">
            <h3>Could not load starred repositories</h3>
            <p>{error}</p>
            <button className="stars-browse-btn" onClick={loadStarred}>
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
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