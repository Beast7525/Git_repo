import React, { useEffect, useState } from "react";
import {
  fetchPRsFromDB,
  updatePRStatus
} from "./adminDataService";
import "./Admin.css";

export default function PullRequestManagement({ showToast }) {
  const [prs, setPRs] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Modals
  const [selectedPR, setSelectedPR] = useState(null);
  const [actionPR, setActionPR] = useState(null);
  const [actionType, setActionType] = useState(""); // "Approve" | "Reject"
  const [reviewReason, setReviewReason] = useState("");

  useEffect(() => {
    fetchPRsFromDB().then(setPRs);
  }, []);

  const filteredPRs = prs.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.repository.toLowerCase().includes(search.toLowerCase()) ||
      p.createdBy.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function handleOpenAction(pr, type) {
    setActionPR(pr);
    setActionType(type);
    setReviewReason("");
  }

  function handleConfirmPRAction() {
    if (!actionPR) return;
    const nextStatus = actionType === "Approve" ? "Merged" : "Rejected";
    const updated = updatePRStatus(actionPR.id, nextStatus, reviewReason);
    setPRs(updated);
    showToast(`Pull Request ${actionPR.id} ${nextStatus.toLowerCase()} successfully.`);
    setActionPR(null);
    setSelectedPR(null);
  }

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Pull Request Management</h1>
          <p className="page-subtitle">
            Monitor, inspect diffs, approve, reject, and review branch integrations across all repositories
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="filter-toolbar">
        <input
          type="text"
          className="filter-input-search"
          placeholder="Search PR title, repository, author, or PR ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All PR Statuses</option>
          <option value="Pending">Pending Review</option>
          <option value="Merged">Merged</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {/* Pull Requests Table */}
      <div className="panel-card" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>PR ID</th>
                <th>Pull Request Title</th>
                <th>Repository</th>
                <th>Created By</th>
                <th>Branches</th>
                <th>Status</th>
                <th>Created Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPRs.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "var(--admin-text-muted)" }}>
                    No pull requests found matching filters.
                  </td>
                </tr>
              ) : (
                filteredPRs.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: "700", color: "var(--admin-text-subtle)", fontSize: "0.8rem" }}>
                      {p.id}
                    </td>
                    <td>
                      <div>
                        <strong
                          style={{ fontSize: "0.92rem", color: "white", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => setSelectedPR(p)}
                        >
                          {p.title}
                        </strong>
                        <div style={{ display: "flex", gap: "10px", marginTop: "4px", fontSize: "0.75rem" }}>
                          <span style={{ color: "var(--admin-accent-green)" }}>+{p.additions} lines</span>
                          <span style={{ color: "var(--admin-accent-red)" }}>-{p.deletions} lines</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-developer">📦 {p.repository}</span>
                    </td>
                    <td>{p.createdBy}</td>
                    <td>
                      <div style={{ fontSize: "0.78rem", fontFamily: "monospace" }}>
                        <span style={{ color: "var(--admin-accent-blue)" }}>{p.sourceBranch}</span>
                        <span style={{ color: "var(--admin-text-subtle)", margin: "0 4px" }}>➔</span>
                        <span style={{ color: "var(--admin-accent-purple)" }}>{p.targetBranch}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${p.status === 'Merged' ? 'badge-merged' : p.status === 'Pending' ? 'badge-pending' : 'badge-rejected'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--admin-text-subtle)", fontSize: "0.82rem" }}>
                      {p.creationDate}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button
                          className="btn-sm-action"
                          style={{ background: "rgba(99, 102, 241, 0.15)", color: "var(--admin-primary)" }}
                          onClick={() => setSelectedPR(p)}
                        >
                          Inspect Details
                        </button>
                        {p.status === "Pending" && (
                          <>
                            <button
                              className="btn-sm-action"
                              style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--admin-accent-green)" }}
                              onClick={() => handleOpenAction(p, "Approve")}
                            >
                              Approve
                            </button>
                            <button
                              className="btn-sm-action"
                              style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--admin-accent-red)" }}
                              onClick={() => handleOpenAction(p, "Reject")}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PR Details Inspector Modal */}
      {selectedPR && (
        <div className="modal-backdrop">
          <div className="modal-container" style={{ maxWidth: "680px" }}>
            <div className="modal-header">
              <div>
                <span className={`badge ${selectedPR.status === 'Merged' ? 'badge-merged' : selectedPR.status === 'Pending' ? 'badge-pending' : 'badge-rejected'}`}>
                  {selectedPR.status}
                </span>
                <h3 className="modal-title" style={{ marginTop: "6px" }}>{selectedPR.id}: {selectedPR.title}</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedPR(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={{ fontSize: "0.78rem", color: "var(--admin-text-subtle)", display: "block" }}>Repository</label>
                  <strong>📦 {selectedPR.repository}</strong>
                </div>
                <div>
                  <label style={{ fontSize: "0.78rem", color: "var(--admin-text-subtle)", display: "block" }}>Created By</label>
                  <strong>👤 {selectedPR.createdBy}</strong>
                </div>
              </div>

              <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "14px", borderRadius: "10px", border: "1px solid var(--admin-border)", marginBottom: "16px" }}>
                <label style={{ fontSize: "0.78rem", color: "var(--admin-text-subtle)", display: "block", marginBottom: "4px" }}>Branch Source ➔ Target</label>
                <code style={{ fontSize: "0.88rem", color: "var(--admin-accent-blue)" }}>
                  {selectedPR.sourceBranch} ➔ {selectedPR.targetBranch}
                </code>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 6px", fontSize: "0.9rem" }}>Description</h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--admin-text-muted)", lineHeight: 1.5 }}>
                  {selectedPR.description}
                </p>
              </div>

              <div style={{ background: "#060b13", padding: "14px", borderRadius: "10px", border: "1px solid var(--admin-border)", fontFamily: "monospace", fontSize: "0.8rem" }}>
                <div style={{ color: "var(--admin-text-subtle)", marginBottom: "6px" }}>Diff Summary:</div>
                <div style={{ color: "#10b981" }}>+ {selectedPR.additions} additions added across 4 files</div>
                <div style={{ color: "#ef4444" }}>- {selectedPR.deletions} deletions removed</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedPR(null)}>Close</button>
              {selectedPR.status === "Pending" && (
                <>
                  <button
                    className="btn-danger"
                    onClick={() => handleOpenAction(selectedPR, "Reject")}
                  >
                    Reject PR
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => handleOpenAction(selectedPR, "Approve")}
                  >
                    Approve & Merge PR
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve or Reject Modal */}
      {actionPR && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title">
                {actionType === "Approve" ? "Approve & Merge Pull Request" : "Reject Pull Request"}
              </h3>
              <button className="modal-close-btn" onClick={() => setActionPR(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 12px", fontSize: "0.88rem" }}>
                You are about to <strong>{actionType.toLowerCase()}</strong> PR <strong>{actionPR.id}</strong> ({actionPR.title}).
              </p>
              <div className="form-group">
                <label>Reviewer Notes / Commit Message (Optional)</label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder={actionType === "Approve" ? "Enter merge message..." : "Provide reason for rejection..."}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setActionPR(null)}>Cancel</button>
              <button
                className={actionType === "Approve" ? "btn-primary" : "btn-danger"}
                onClick={handleConfirmPRAction}
              >
                Confirm {actionType}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
