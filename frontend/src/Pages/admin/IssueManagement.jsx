import React, { useEffect, useState } from "react";
import {
  fetchIssuesFromDB,
  updateIssue,
  deleteIssue,
  fetchUsersFromDB
} from "./adminDataService";
import "./Admin.css";

export default function IssueManagement({ showToast }) {
  const [issues, setIssues] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  useEffect(() => {
    fetchIssuesFromDB().then(setIssues);
    fetchUsersFromDB().then(setAllUsers);
  }, []);

  // Modals
  const [assigningIssue, setAssigningIssue] = useState(null);
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [moderatingIssue, setModeratingIssue] = useState(null);

  const filteredIssues = issues.filter((i) => {
    const matchesSearch =
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.repository.toLowerCase().includes(search.toLowerCase()) ||
      i.createdBy.toLowerCase().includes(search.toLowerCase()) ||
      i.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || i.status === statusFilter;
    const matchesPriority = priorityFilter === "All" || i.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  function handleStatusChange(issue, newStatus) {
    const updated = updateIssue({ ...issue, status: newStatus });
    setIssues(updated);
    showToast(`Issue ${issue.id} status changed to ${newStatus}`);
  }

  function handleSaveAssignee() {
    if (!assigningIssue) return;
    const updated = updateIssue({ ...assigningIssue, assignedUser: selectedAssignee });
    setIssues(updated);
    showToast(`Issue ${assigningIssue.id} reassigned to ${selectedAssignee}`);
    setAssigningIssue(null);
  }

  function handleRemoveInappropriate() {
    if (!moderatingIssue) return;
    const updated = deleteIssue(moderatingIssue.id);
    setIssues(updated);
    showToast(`Inappropriate issue ${moderatingIssue.id} removed from system.`);
    setModeratingIssue(null);
  }

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Issue Management & Moderation</h1>
          <p className="page-subtitle">
            Track, assign, prioritize, and moderate open and closed platform issues
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="filter-toolbar">
        <input
          type="text"
          className="filter-input-search"
          placeholder="Search issue title, repository, author, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Closed">Closed</option>
        </select>

        <select
          className="filter-select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="All">All Priorities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {/* Issue Table */}
      <div className="panel-card" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Issue ID</th>
                <th>Issue Title</th>
                <th>Repository</th>
                <th>Created By</th>
                <th>Assigned User</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: "center", padding: "40px", color: "var(--admin-text-muted)" }}>
                    No issues found matching filters.
                  </td>
                </tr>
              ) : (
                filteredIssues.map((i) => (
                  <tr key={i.id} style={{ background: i.isInappropriate ? "rgba(239, 68, 68, 0.08)" : "transparent" }}>
                    <td style={{ fontWeight: "700", color: "var(--admin-text-subtle)", fontSize: "0.8rem" }}>
                      {i.id}
                    </td>
                    <td>
                      <div>
                        <strong style={{ fontSize: "0.92rem", color: "white" }}>
                          {i.title}
                        </strong>
                        {i.isInappropriate && (
                          <span className="badge badge-rejected" style={{ marginLeft: "8px", fontSize: "0.7rem" }}>
                            ⚠️ Moderation Flagged
                          </span>
                        )}
                        <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--admin-text-subtle)", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {i.description}
                        </p>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-developer"> {i.repository}</span>
                    </td>
                    <td>{i.createdBy}</td>
                    <td style={{ fontWeight: "600" }}>{i.assignedUser}</td>
                    <td>
                      <span className={`badge ${i.priority === 'Critical' ? 'badge-critical' : i.priority === 'High' ? 'badge-high' : i.priority === 'Medium' ? 'badge-medium' : 'badge-low'}`}>
                        {i.priority}
                      </span>
                    </td>
                    <td>
                      <select
                        style={{
                          background: "var(--admin-surface)",
                          border: "1px solid var(--admin-border)",
                          color: "white",
                          borderRadius: "6px",
                          padding: "4px 8px",
                          fontSize: "0.8rem",
                          fontWeight: "600"
                        }}
                        value={i.status}
                        onChange={(e) => handleStatusChange(i, e.target.value)}
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </td>
                    <td style={{ color: "var(--admin-text-subtle)", fontSize: "0.82rem" }}>
                      {i.creationDate}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button
                          className="btn-sm-action"
                          style={{ background: "rgba(99, 102, 241, 0.15)", color: "var(--admin-primary)" }}
                          onClick={() => {
                            setAssigningIssue(i);
                            setSelectedAssignee(i.assignedUser);
                          }}
                        >
                          Assign
                        </button>
                        <button
                          className="btn-sm-action"
                          style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--admin-accent-red)" }}
                          onClick={() => setModeratingIssue(i)}
                          title="Remove Inappropriate Content"
                        >
                          Moderate / Remove
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

      {/* Assign User Modal */}
      {assigningIssue && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title">Reassign Issue: {assigningIssue.id}</h3>
              <button className="modal-close-btn" onClick={() => setAssigningIssue(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 14px", fontSize: "0.88rem" }}>
                <strong>Issue Title:</strong> {assigningIssue.title}
              </p>
              <div className="form-group">
                <label>Select Assigned User</label>
                <select
                  className="form-control"
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.name}>
                      {u.name} ({u.role} - {u.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setAssigningIssue(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveAssignee}>Confirm Assignment</button>
            </div>
          </div>
        </div>
      )}

      {/* Moderation / Remove Inappropriate Issue Modal */}
      {moderatingIssue && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "var(--admin-accent-red)" }}>Moderate & Remove Issue</h3>
              <button className="modal-close-btn" onClick={() => setModeratingIssue(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 10px" }}>
                You are performing an administrative content removal for issue:
              </p>
              <div style={{ padding: "12px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                <strong>{moderatingIssue.title}</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--admin-text-muted)" }}>
                  {moderatingIssue.description}
                </p>
              </div>
              <p style={{ margin: "14px 0 0", fontSize: "0.82rem", color: "var(--admin-text-subtle)" }}>
                Reason: Violation of platform content standards or inappropriate user behavior.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setModeratingIssue(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleRemoveInappropriate}>Remove Inappropriate Issue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
