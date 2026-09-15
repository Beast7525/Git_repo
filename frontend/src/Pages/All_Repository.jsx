import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import User_header from "./User_header";
import "./style/User.css";
import { useLoading } from "../context/LoadingContext";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

function All_Repository() {
  const navigate = useNavigate();
  const { username: paramUsername } = useParams();
  const { startLoading, stopLoading } = useLoading();
  const [repos, setRepos] = useState([]);

  useEffect(() => {
    async function loadRepositories() {
      try {
        startLoading();
        const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
        const activeUsername = paramUsername || localStorage.getItem("username") || currentUser.username || currentUser.name || "";
        const ownerEmail = currentUser.gmail || currentUser.email || "";

        const params = new URLSearchParams();
        if (paramUsername) {
          params.append("owner", paramUsername);
        } else {
          if (ownerEmail) params.append("ownerEmail", ownerEmail);
          if (activeUsername) params.append("owner", activeUsername);
        }

        let response = await fetch(`${API_BASE_URL}/api/repos?${params.toString()}`);
        if (response.ok) {
          let data = await response.json();
          if (!Array.isArray(data) || data.length === 0) {
            const fallbackRes = await fetch(`${API_BASE_URL}/api/repos`);
            if (fallbackRes.ok) data = await fallbackRes.json();
          }
          setRepos(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Error loading repositories:", error);
      } finally {
        stopLoading();
      }
    }

    loadRepositories();
  }, [paramUsername]);

  return (
    <main className="app all-repository-page">
      <User_header />
      <section className="repository-panel all-repository-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">YOUR REPOSITORIES ({repos.length})</p>
            <h1>All repositories</h1>
            <p className="welcome-copy">Showing all repositories owned by your logged-in account.</p>
          </div>
          <button className="new-repository" type="button" onClick={() => navigate("/Repository")}>
            <span aria-hidden="true">+</span> New repository
          </button>
        </div>

        {repos.length === 0 ? (
          <div className="empty-repository">
            <h3>No repositories found</h3>
            <p>You haven't created any repositories yet. Click 'New repository' to create one.</p>
          </div>
        ) : (
          <div className="repo-grid-list">
            {repos.map((repo) => {
              const ownerName = repo.owner || "Developer";
              const displayName = repo.name || repo.repositoryName || "untitled-repository";
              const ownerSlug = ownerName.trim().replace(/\s+/g, "-").toLowerCase();
              const repoPath = `/${ownerSlug}/${encodeURIComponent(displayName)}`;
              const ownerPath = `/${ownerSlug}`;
              return (
                <article
                  key={repo._id || repo.id}
                  className="repo-item-card"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(repoPath)}
                >
                  <div className="repo-card-top">
                    <h3 className="repo-card-title">
                      <span style={{ color: "#a7dda6", textDecoration: "underline" }}>
                        {displayName}
                      </span>
                    </h3>
                    <span className={`repo-badge ${repo.visibility === "public" || repo.visibility === "Public" ? "public" : "private"}`}>
                      {repo.visibility === "public" || repo.visibility === "Public" ? "Public" : "Private"}
                    </span>
                  </div>
                  <p className="repo-card-desc">{repo.description || "No description provided for this repository."}</p>
                  <div className="repo-card-meta">
                    <span className="repo-owner" onClick={(e) => { e.stopPropagation(); navigate(ownerPath); }}>
                      Owner: <strong style={{ textDecoration: "underline", color: "#a7dda6" }}>{ownerName}</strong>
                    </span>
                    <span>Commits: {repo.commits || 0}</span>
                    <span>{repo.creationDate || (repo.createdAt ? repo.createdAt.split("T")[0] : "Recently")}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default All_Repository;
