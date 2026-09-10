import React, { useEffect, useState } from "react";
import {
  fetchReposFromDB,
  saveRepository,
  deleteRepository
} from "./adminDataService";
import "./Admin.css";

export default function RepoManagement({ showToast }) {
  const [repos, setRepos] = useState([]);
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const loadRepos = async () => {
    const data = await fetchReposFromDB();
    if (data) setRepos(data);
  };

  useEffect(() => {
    loadRepos();
  }, []);

  // Modal states
  const [editingRepo, setEditingRepo] = useState(null);
  const [permissionsRepo, setPermissionsRepo] = useState(null);
  const [confirmDeleteRepo, setConfirmDeleteRepo] = useState(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  // Form states
  const [repoForm, setRepoForm] = useState({
    name: "",
    owner: "Alexander Wright",
    ownerEmail: "alexander.wright@gitrepo.org",
    visibility: "Public",
    status: "Active",
    description: "",
    ignoreGitignore: false, // "No .gitignore" option
    contributors: 1,
    commits: 1
  });

  const filteredRepos = repos.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.owner.toLowerCase().includes(search.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(search.toLowerCase()));
    const matchesVis = visibilityFilter === "All" || r.visibility === visibilityFilter;
    const matchesStatus = statusFilter === "All" || r.status === statusFilter;
    return matchesSearch && matchesVis && matchesStatus;
  });

  function handleOpenCreate() {
    setRepoForm({
      name: "",
      owner: "Alexander Wright",
      ownerEmail: "alexander.wright@gitrepo.org",
      visibility: "Public",
      status: "Active",
      description: "",
      ignoreGitignore: false,
      contributors: 1,
      commits: 1
    });
    setEditingRepo({ isNew: true });
  }

  function handleOpenEdit(repo) {
    setRepoForm({
      name: repo.name,
      owner: repo.owner,
      ownerEmail: repo.ownerEmail || "",
      visibility: repo.visibility,
      status: repo.status,
      description: repo.description || "",
      ignoreGitignore: repo.ignoreGitignore || false,
      contributors: repo.contributors || 1,
      commits: repo.commits || 1
    });
    setEditingRepo(repo);
  }

  async function handleSaveRepoSubmit(e) {
    e.preventDefault();
    const payload = { ...editingRepo, ...repoForm };

    try {
      let res = await fetch("http://localhost:5000/api/admin/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.status === 404) {
        res = await fetch("http://localhost:5000/api/repos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        showToast(`Repository "${repoForm.name}" created and stored in database collection 'repositories'!`);
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(`Error saving to database: ${errorData.message || res.statusText}`);
      }
    } catch (err) {
      console.error("Database Save Error:", err);
      showToast(`Database error: Could not connect to backend server at http://localhost:5000`);
    }

    setEditingRepo(null);
    loadRepos();
  }

  function handleConfirmDelete() {
    if (!confirmDeleteRepo) return;
    if (deleteConfirmInput.trim() !== confirmDeleteRepo.name) {
      alert("Repository name confirmation does not match!");
      return;
    }
    const updated = deleteRepository(confirmDeleteRepo.id);
    setRepos(updated);
    showToast(`Repository "${confirmDeleteRepo.name}" permanently deleted.`);
    setConfirmDeleteRepo(null);
    setDeleteConfirmInput("");
  }

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Repository Management</h1>
          <p className="page-subtitle">
            System repositories derived from database table 'repositories'
          </p>
        </div>
        <button className="btn-primary" onClick={handleOpenCreate}>
          + Create Repository
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-toolbar">
        <input
          type="text"
          className="filter-input-search"
          placeholder="Search repository name, owner, or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
        >
          <option value="All">All Visibility</option>
          <option value="Public">Public</option>
          <option value="Private">Private</option>
        </select>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Archived">Archived</option>
          <option value="Locked">Locked</option>
        </select>
      </div>

      {/* Repository Table */}
      <div className="panel-card" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Repository Name</th>
                <th>Owner</th>
                <th>Visibility</th>
                <th>.gitignore Status</th>
                <th>Commits</th>
                <th>Created Date</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRepos.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "var(--admin-text-muted)" }}>
                    No repositories found matching filters.
                  </td>
                </tr>
              ) : (
                filteredRepos.map((r) => (
                  <tr key={r.id || r._id}>
                    <td>
                      <div>
                        <strong style={{ fontSize: "0.95rem", color: "var(--admin-accent-blue)" }}>
                          📦 {r.name}
                        </strong>
                        {r.description && (
                          <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--admin-text-subtle)", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <div>
                        <span style={{ fontWeight: "600" }}>{r.owner}</span>
                        {r.ownerEmail && (
                          <div style={{ fontSize: "0.75rem", color: "var(--admin-text-subtle)" }}>{r.ownerEmail}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${r.visibility === 'Public' || r.visibility === 'public' ? 'badge-public' : 'badge-private'}`}>
                        {r.visibility === 'Public' || r.visibility === 'public' ? '🌐 Public' : '🔒 Private'}
                      </span>
                    </td>
                    <td>
                      {r.ignoreGitignore ? (
                        <span className="badge badge-rejected" style={{ fontSize: "0.72rem" }}>
                          🚫 No .gitignore (Ignored)
                        </span>
                      ) : (
                        <span className="badge badge-active" style={{ fontSize: "0.72rem" }}>
                          📄 Standard .gitignore
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: "600" }}>🔨 {r.commits || 1}</td>
                    <td style={{ color: "var(--admin-text-subtle)", fontSize: "0.82rem" }}>
                      {r.creationDate || (r.createdAt ? r.createdAt.split("T")[0] : "Recently")}
                    </td>
                    <td>
                      <span className={`badge ${r.status === 'Active' ? 'badge-active' : 'badge-pending'}`}>
                        {r.status || 'Active'}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button
                          className="btn-sm-action"
                          style={{ background: "rgba(99, 102, 241, 0.15)", color: "var(--admin-primary)" }}
                          onClick={() => handleOpenEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-sm-action"
                          style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--admin-accent-red)" }}
                          onClick={() => {
                            setConfirmDeleteRepo(r);
                            setDeleteConfirmInput("");
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {editingRepo && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title">{editingRepo.isNew ? "Create Repository" : `Edit Repo: ${editingRepo.name}`}</h3>
              <button className="modal-close-btn" onClick={() => setEditingRepo(null)}>&times;</button>
            </div>
            <form onSubmit={handleSaveRepoSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Repository Name</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={repoForm.name}
                    onChange={(e) => setRepoForm({ ...repoForm, name: e.target.value })}
                    placeholder="e.g. design-system"
                  />
                </div>
                <div className="form-group">
                  <label>Owner Name</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={repoForm.owner}
                    onChange={(e) => setRepoForm({ ...repoForm, owner: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={repoForm.description}
                    onChange={(e) => setRepoForm({ ...repoForm, description: e.target.value })}
                    placeholder="Short description of this repository..."
                  />
                </div>
                <div className="form-group" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label>Visibility</label>
                    <select
                      className="form-control"
                      value={repoForm.visibility}
                      onChange={(e) => setRepoForm({ ...repoForm, visibility: e.target.value })}
                    >
                      <option value="Public">Public</option>
                      <option value="Private">Private</option>
                    </select>
                  </div>
                  <div>
                    <label>Status</label>
                    <select
                      className="form-control"
                      value={repoForm.status}
                      onChange={(e) => setRepoForm({ ...repoForm, status: e.target.value })}
                    >
                      <option value="Active">Active</option>
                      <option value="Archived">Archived</option>
                      <option value="Locked">Locked</option>
                    </select>
                  </div>
                </div>

                {/* No .gitignore Option */}
                <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "14px", borderRadius: "10px", border: "1px solid var(--admin-border)", marginTop: "14px" }}>
                  <label className="switch-label" style={{ margin: 0, fontSize: "0.88rem" }}>
                    <div>
                      <strong>No .gitignore</strong>
                      <div style={{ fontSize: "0.78rem", color: "var(--admin-text-muted)" }}>
                        Tells the website to ignore .gitignore rules and include all files.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={repoForm.ignoreGitignore}
                      onChange={(e) => setRepoForm({ ...repoForm, ignoreGitignore: e.target.checked })}
                    />
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingRepo(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Repository & Save to DB</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Delete */}
      {confirmDeleteRepo && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "var(--admin-accent-red)" }}>Confirm Delete Repository</h3>
              <button className="modal-close-btn" onClick={() => setConfirmDeleteRepo(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 10px", fontSize: "0.9rem" }}>
                Deleting <strong>{confirmDeleteRepo.name}</strong> will remove all commits, issues, and pull requests.
              </p>
              <p style={{ margin: "0 0 14px", fontSize: "0.85rem", color: "var(--admin-text-muted)" }}>
                To confirm, type <strong style={{ color: "white" }}>{confirmDeleteRepo.name}</strong> in the box below:
              </p>
              <input
                type="text"
                className="form-control"
                placeholder={confirmDeleteRepo.name}
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setConfirmDeleteRepo(null)}>Cancel</button>
              <button
                className="btn-danger"
                disabled={deleteConfirmInput.trim() !== confirmDeleteRepo.name}
                onClick={handleConfirmDelete}
              >
                Delete Repository
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
