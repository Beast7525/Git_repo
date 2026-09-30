import React, { useState, useEffect } from "react";
import { fetchGroupsFromDB, deleteGroupFromDB } from "./adminDataService";
import "./Admin.css";

export default function GroupManagement({ showToast = (msg) => console.log(msg) }) {
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadGroups() {
      setLoading(true);
      const data = await fetchGroupsFromDB();
      setGroups(data);
      setLoading(false);
    }
    loadGroups();
  }, []);

  const filteredGroups = groups.filter((g) => {
    const q = search.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.groupId && g.groupId.toLowerCase().includes(q)) ||
      (g.creator && g.creator.toLowerCase().includes(q))
    );
  });

  async function handleConfirmDeleteGroup() {
    if (!confirmDeleteGroup || deleting) return;
    setDeleting(true);
    const result = await deleteGroupFromDB(confirmDeleteGroup.id);
    setDeleting(false);

    if (result.ok) {
      showToast(
        result.message ||
          `Group ${confirmDeleteGroup.name} deleted${
            result.detachedRepositories ? `, ${result.detachedRepositories} repositories detached` : ""
          }.`
      );
      setConfirmDeleteGroup(null);
      setGroups((current) => current.filter((g) => g.id !== confirmDeleteGroup.id));
    } else {
      showToast(result.message || "Failed to delete group.");
    }
  }

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Group &amp; Team Management</h1>
          <p className="page-subtitle">
            System Admin view of all team groups, member roles, and unique Group IDs (Restricted to Admins)
          </p>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="filter-toolbar">
        <input
          type="text"
          className="filter-input-search"
          placeholder="Search by group name, unique Group ID, or creator..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Groups Table */}
      <div className="panel-card" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ color: "#e4bd71" }}>Unique Group ID</th>
                <th>Group Name</th>
                <th>Creator / Owner</th>
                <th>Members Count</th>
                <th>Members &amp; Roles</th>
                <th>Created Date</th>
                <th style={{ color: "var(--admin-accent-red)" }}>Actions (Admin)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "var(--admin-text-muted)" }}>
                    Loading system groups...
                  </td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "var(--admin-text-muted)" }}>
                    No system groups found.
                  </td>
                </tr>
              ) : (
                filteredGroups.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: "700",
                          color: "#e4bd71",
                          background: "rgba(228, 189, 113, 0.15)",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid rgba(228, 189, 113, 0.3)"
                        }}
                      >
                        {g.groupId || "N/A"}
                      </span>
                    </td>
                    <td style={{ fontWeight: "600", color: "#ffffff" }}>{g.name}</td>
                    <td>{g.creator}</td>
                    <td>
                      <span className="badge badge-developer">{g.membersCount} members</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {(g.members || []).map((m, idx) => (
                          <span
                            key={m._id || idx}
                            style={{
                              fontSize: "0.75rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: m.role === "creator" ? "rgba(167, 221, 166, 0.15)" : "rgba(99, 102, 241, 0.15)",
                              color: m.role === "creator" ? "#a7dda6" : "#818cf8",
                              border: `1px solid ${m.role === "creator" ? "rgba(167, 221, 166, 0.3)" : "rgba(99, 102, 241, 0.3)"}`
                            }}
                          >
                            {m.username} ({m.role})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ color: "var(--admin-text-subtle)", fontSize: "0.82rem" }}>
                      {g.creationDate}
                    </td>
                    <td>
                      <button
                        className="btn-sm-action"
                        style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--admin-accent-red)" }}
                        onClick={() => setConfirmDeleteGroup(g)}
                        title="Delete this group permanently"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog: Delete Group (Admin only) */}
      {confirmDeleteGroup && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "var(--admin-accent-red)" }}>Confirm Delete Group</h3>
              <button className="modal-close-btn" onClick={() => setConfirmDeleteGroup(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 10px" }}>
                Are you sure you want to permanently delete the group{" "}
                <strong>{confirmDeleteGroup.name}</strong> ({confirmDeleteGroup.groupId || "no group id"}) owned by{" "}
                <strong>{confirmDeleteGroup.creator}</strong>?
              </p>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--admin-text-subtle)" }}>
                All {confirmDeleteGroup.membersCount} member record(s) and every pending team verification will be
                removed. Repositories assigned to this team are kept and simply detached.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDeleteGroup(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleConfirmDeleteGroup} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete Group"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
