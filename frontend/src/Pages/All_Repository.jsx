import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import User_header from "./User_header";
import "./style/User.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");

function All_Repository() {
  const navigate = useNavigate();
  const { username: paramUsername } = useParams();
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRepositories() {
      try {
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

        if (!params.toString()) {
          setRepos([]);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/api/repos?${params.toString()}`);
        if (!response.ok) throw new Error("Could not load repositories");
        setRepos(await response.json());
      } catch (error) {
        console.error("Error loading repositories:", error);
      } finally {
        setLoading(false);
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

        {loading ? (
          <div className="repository-message">Loading repositories...</div>
        ) : repos.length === 0 ? (
          <div className="empty-repository">
            <h3>No repositories found</h3>
            <p>You haven't created any repositories yet. Click 'New repository' to create one.</p>
          </div>
        ) : (
          <div className="repo-grid-list">
            {repos.map((repo) => (
              <article key={repo._id || repo.id} className="repo-item-card">
                <div className="repo-card-top">
                  <h3 className="repo-card-title">{repo.name}</h3>
                  <span className={`repo-badge ${repo.visibility === "public" || repo.visibility === "Public" ? "public" : "private"}`}>
                    {repo.visibility === "public" || repo.visibility === "Public" ? "Public" : "Private"}
                  </span>
                </div>
                <p className="repo-card-desc">{repo.description || "No description provided for this repository."}</p>
                <div className="repo-card-meta">
                  <span className="repo-owner">Owner: <strong>{repo.owner || "Developer"}</strong></span>
                  <span>Commits: {repo.commits || 1}</span>
                  <span>{repo.creationDate || (repo.createdAt ? repo.createdAt.split("T")[0] : "Recently")}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default All_Repository;