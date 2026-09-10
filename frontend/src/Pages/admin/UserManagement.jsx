import React, { useState, useEffect } from "react";
import {
  fetchUsersFromDB,
  saveUser,
  toggleUserStatus,
  deleteUser
} from "./adminDataService";
import "./Admin.css";

export default function UserManagement({ showToast }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  // Load from DB
  useEffect(() => {
    async function loadDBUsers() {
      const dbUsers = await fetchUsersFromDB();
      setUsers(dbUsers);
    }
    loadDBUsers();
  }, []);

  // Modal states
  const [editingUser, setEditingUser] = useState(null);
  const [permissionsUser, setPermissionsUser] = useState(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [confirmStatusUser, setConfirmStatusUser] = useState(null);

  // Form states
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    role: "Developer",
    status: "Active"
  });

  // Filtered Users list
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.id.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "All" || u.role === roleFilter;
    const matchesStatus = statusFilter === "All" || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  function handleOpenAddModal() {
    setUserForm({ name: "", email: "", role: "Developer", status: "Active" });
    setEditingUser({ isNew: true });
  }

  function handleOpenEditModal(user) {
    setUserForm({ name: user.name, email: user.email, role: user.role, status: user.status });
    setEditingUser(user);
  }

  function handleSaveUserSubmit(e) {
    e.preventDefault();
    const updated = saveUser({ ...editingUser, ...userForm });
    setUsers(updated);
    showToast(`User "${userForm.name}" saved successfully!`);
    setEditingUser(null);
  }

  function handleConfirmStatusToggle() {
    if (!confirmStatusUser) return;
    const updated = toggleUserStatus(confirmStatusUser.id);
    setUsers(updated);
    showToast(`Status updated for user ${confirmStatusUser.name}`);
    setConfirmStatusUser(null);
  }

  function handleConfirmDelete() {
    if (!confirmDeleteUser) return;
    const updated = deleteUser(confirmDeleteUser.id);
    setUsers(updated);
    showToast(`User ${confirmDeleteUser.name} deleted`);
    setConfirmDeleteUser(null);
  }

  function handleSavePermissions(permList) {
    const updated = saveUser({ ...permissionsUser, permissions: permList });
    setUsers(updated);
    showToast(`Permissions updated for ${permissionsUser.name}`);
    setPermissionsUser(null);
  }

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">
            Manage system administrators, developers, maintainers, roles, and permissions (Derived from Database)
          </p>
        </div>
        <button className="btn-primary" onClick={handleOpenAddModal}>
          + Add New User
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="filter-toolbar">
        <input
          type="text"
          className="filter-input-search"
          placeholder="Search by name, email, or user ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="All">All Roles</option>
          <option value="Admin">Admin</option>
          <option value="Maintainer">Maintainer</option>
          <option value="Developer">Developer</option>
          <option value="Viewer">Viewer</option>
        </select>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {/* User Table */}
      <div className="panel-card" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name & Avatar</th>
                <th>Email</th>
                <th>Role</th>
                <th>Account Status</th>
                <th>Reg. Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "var(--admin-text-muted)" }}>
                    No database users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: "700", color: "var(--admin-text-subtle)", fontSize: "0.8rem" }}>
                      {u.id}
                    </td>
                    <td>
                      <div className="user-cell">
                        <img src={u.avatar} alt={u.name} className="user-cell-avatar" />
                        <span style={{ fontWeight: "600" }}>{u.name}</span>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'Admin' ? 'badge-admin' : u.role === 'Maintainer' ? 'badge-in-progress' : 'badge-developer'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.status === 'Active' ? 'badge-active' : u.status === 'Suspended' ? 'badge-suspended' : 'badge-pending'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--admin-text-subtle)", fontSize: "0.82rem" }}>
                      {u.registrationDate}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <button
                          className="btn-sm-action"
                          style={{ background: "rgba(99, 102, 241, 0.15)", color: "var(--admin-primary)" }}
                          onClick={() => handleOpenEditModal(u)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-sm-action"
                          style={{ background: "rgba(168, 85, 247, 0.15)", color: "var(--admin-accent-purple)" }}
                          onClick={() => setPermissionsUser(u)}
                        >
                          Permissions
                        </button>
                        <button
                          className="btn-sm-action"
                          style={{
                            background: u.status === "Active" ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)",
                            color: u.status === "Active" ? "var(--admin-accent-amber)" : "var(--admin-accent-green)"
                          }}
                          onClick={() => setConfirmStatusUser(u)}
                        >
                          {u.status === "Active" ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          className="btn-sm-action"
                          style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--admin-accent-red)" }}
                          onClick={() => setConfirmDeleteUser(u)}
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

      {/* Edit / Add User Modal */}
      {editingUser && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title">{editingUser.isNew ? "Add New User" : `Edit User: ${editingUser.name}`}</h3>
              <button className="modal-close-btn" onClick={() => setEditingUser(null)}>&times;</button>
            </div>
            <form onSubmit={handleSaveUserSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    required
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>System Role</label>
                  <select
                    className="form-control"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    <option value="Admin">Admin</option>
                    <option value="Maintainer">Maintainer</option>
                    <option value="Developer">Developer</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {permissionsUser && (
        <PermissionsModal
          user={permissionsUser}
          onClose={() => setPermissionsUser(null)}
          onSave={handleSavePermissions}
        />
      )}

      {/* Confirmation Dialog: Deactivate / Activate */}
      {confirmStatusUser && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title">Confirm Account Status Change</h3>
              <button className="modal-close-btn" onClick={() => setConfirmStatusUser(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                Are you sure you want to <strong>{confirmStatusUser.status === "Active" ? "Deactivate" : "Activate"}</strong> user <strong>{confirmStatusUser.name}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setConfirmStatusUser(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleConfirmStatusToggle}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Delete */}
      {confirmDeleteUser && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: "var(--admin-accent-red)" }}>Confirm Delete User</h3>
              <button className="modal-close-btn" onClick={() => setConfirmDeleteUser(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                Are you sure you want to delete account: <strong>{confirmDeleteUser.name}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setConfirmDeleteUser(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleConfirmDelete}>Delete User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PermissionsModal({ user, onClose, onSave }) {
  const allAvailablePermissions = [
    "Full System Admin",
    "Manage Users",
    "Manage Repos",
    "Delete Projects",
    "System Config",
    "Approve PRs",
    "Manage Issues",
    "Push Code"
  ];

  const [selectedPerms, setSelectedPerms] = useState(user.permissions || []);

  function togglePerm(perm) {
    if (selectedPerms.includes(perm)) {
      setSelectedPerms(selectedPerms.filter((p) => p !== perm));
    } else {
      setSelectedPerms([...selectedPerms, perm]);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-container">
        <div className="modal-header">
          <h3 className="modal-title">Manage Permissions: {user.name}</h3>
          <button className="modal-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {allAvailablePermissions.map((perm) => (
              <label
                key={perm}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  background: selectedPerms.includes(perm) ? "rgba(99, 102, 241, 0.15)" : "rgba(15, 23, 42, 0.5)",
                  border: `1px solid ${selectedPerms.includes(perm) ? "var(--admin-primary)" : "var(--admin-border)"}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "0.85rem"
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPerms.includes(perm)}
                  onChange={() => togglePerm(perm)}
                />
                <span>{perm}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onSave(selectedPerms)}>Save Permissions</button>
        </div>
      </div>
    </div>
  );
}
