import React, { useState, useEffect } from "react";
import User_header from "./User_header";
import "./style/Teams.css";
import { useLoading } from "../context/LoadingContext";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

export default function Teams() {
  const { startLoading, stopLoading } = useLoading();
  const [groups, setGroups] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroupForMember, setSelectedGroupForMember] = useState(null);

  // Form States
  const [newGroupForm, setNewGroupForm] = useState({ name: "", description: "" });
  const [newMemberForm, setNewMemberForm] = useState({ identifier: "", role: "editor" });
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  // Retrieve logged-in user
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const loggedInUsername = localStorage.getItem("username") || currentUser.username || currentUser.name || "";
  const loggedInEmail = currentUser.gmail || currentUser.email || "";

  // Load user groups
  async function loadUserGroups() {
    if (!loggedInUsername && !loggedInEmail) return;
    try {
      startLoading();
      const params = new URLSearchParams();
      if (loggedInUsername) params.append("username", loggedInUsername);
      if (loggedInEmail) params.append("email", loggedInEmail);

      const res = await fetch(`${API_BASE_URL}/api/groups/my-groups?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load user groups:", err);
    } finally {
      stopLoading();
    }
  }

  useEffect(() => {
    loadUserGroups();
  }, [loggedInUsername, loggedInEmail]);

  // Create Group Submit
  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupForm.name.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupForm.name.trim(),
          description: newGroupForm.description.trim(),
          creator: loggedInUsername || "Developer",
          creatorEmail: loggedInEmail
        })
      });

      if (res.ok) {
        setNewGroupForm({ name: "", description: "" });
        setShowCreateModal(false);
        loadUserGroups();
      } else {
        const errData = await res.json().catch(() => ({}));
        setIsError(true);
        setMessage(errData.message || "Failed to create group.");
      }
    } catch (err) {
      setIsError(true);
      setMessage("Error connecting to server: " + err.message);
    }
  }

  // Add Member Submit
  async function handleAddMember(e) {
    e.preventDefault();
    if (!selectedGroupForMember) return;
    const rawVal = (newMemberForm.identifier || "").trim();
    if (!rawVal) return;

    let usernameToSend = "";
    let emailToSend = "";
    if (rawVal.includes("@")) {
      emailToSend = rawVal;
      usernameToSend = rawVal.split("@")[0];
    } else {
      usernameToSend = rawVal;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/groups/${selectedGroupForMember._id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameToSend,
          email: emailToSend,
          role: newMemberForm.role
        })
      });

      if (res.ok) {
        setNewMemberForm({ identifier: "", role: "editor" });
        setSelectedGroupForMember(null);
        loadUserGroups();
      } else {
        const errData = await res.json().catch(() => ({}));
        setIsError(true);
        setMessage(errData.message || "Failed to add member.");
      }
    } catch (err) {
      setIsError(true);
      setMessage("Error adding member: " + err.message);
    }
  }

  return (
    <main className="teams-page-layout">
      <User_header />
      <div className="teams-page">
        <header className="teams-header">
          <div className="teams-header-text">
            <p className="teams-eyebrow">TEAM WORKSPACE</p>
            <h1>Joined Teams &amp; Groups</h1>
            <p>Collaborate with creators and editors across your team projects.</p>
          </div>
          <button className="btn-create-team" onClick={() => { setMessage(""); setIsError(false); setShowCreateModal(true); }}>
            <span>+</span> Create New Group
          </button>
        </header>

        {message && (
          <div style={{ maxWidth: "1000px", margin: "0 auto 20px", color: isError ? "#ef4444" : "#10b981", fontWeight: "600" }}>
            {message}
          </div>
        )}

        <div className="teams-container">
          {groups.length > 0 ? (
            groups.map((group) => {
              const isCreator = group.creator && group.creator.toLowerCase() === loggedInUsername.toLowerCase();
              return (
                <div key={group._id} className="team-card">
                  <div className="team-card-header">
                    <h2 className="team-card-title">{group.name}</h2>
                    {isCreator && <span className="team-creator-badge">Owner (Creator)</span>}
                  </div>
                  <p className="team-description">
                    {group.description || "No group description provided."}
                  </p>

                  <div className="team-section-title">Members ({group.members ? group.members.length : 0})</div>
                  <div className="member-list">
                    {(group.members || []).map((m, idx) => (
                      <div key={m._id || idx} className="member-item">
                        <div className="member-info">
                          <span className="member-name">{m.username || m.email}</span>
                        </div>
                        <span className={`team-role-badge ${m.role === 'creator' ? 'creator' : 'editor'}`}>
                          {m.role === 'creator' ? 'Owner / Creator' : 'Editor'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {group.repositories && group.repositories.length > 0 && (
                    <>
                      <div className="team-section-title">Group Repositories</div>
                      <div className="team-repos-list">
                        {group.repositories.map((r) => (
                          <span key={r._id || r.name} className="team-repo-chip">
                            {r.name || r.repositoryName || "repo"}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="team-card-actions">
                    <button
                      className="btn-add-member"
                      onClick={() => {
                        setMessage("");
                        setIsError(false);
                        setSelectedGroupForMember(group);
                      }}
                    >
                      + Add Member
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-teams-state">
              <h3>No Joined Groups Yet</h3>
              <p>Create a group to start collaborating on shared repositories with your team.</p>
              <button className="btn-create-team" style={{ margin: "0 auto" }} onClick={() => setShowCreateModal(true)}>
                + Create Your First Group
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Group */}
      {showCreateModal && (
        <div className="teams-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="teams-modal" onClick={(e) => e.stopPropagation()}>
            <div className="teams-modal-header">
              <h3>Create New Group</h3>
              <button className="teams-modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreateGroup}>
              <div className="teams-form-group">
                <label htmlFor="group-name">Group Name</label>
                <input
                  id="group-name"
                  type="text"
                  required
                  placeholder="e.g. Core Engineering Team"
                  value={newGroupForm.name}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
                />
              </div>
              <div className="teams-form-group">
                <label htmlFor="group-desc">Description (Optional)</label>
                <textarea
                  id="group-desc"
                  rows="3"
                  placeholder="Describe the purpose of this group..."
                  value={newGroupForm.description}
                  onChange={(e) => setNewGroupForm({ ...newGroupForm, description: e.target.value })}
                />
              </div>
              <div className="teams-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-create-team">Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Member */}
      {selectedGroupForMember && (
        <div className="teams-modal-backdrop" onClick={() => setSelectedGroupForMember(null)}>
          <div className="teams-modal" onClick={(e) => e.stopPropagation()}>
            <div className="teams-modal-header">
              <h3>Add Member to {selectedGroupForMember.name}</h3>
              <button className="teams-modal-close" onClick={() => setSelectedGroupForMember(null)}>&times;</button>
            </div>
            <form onSubmit={handleAddMember}>
              <div className="teams-form-group">
                <label htmlFor="member-identifier">Username or Email Address</label>
                <input
                  id="member-identifier"
                  type="text"
                  required
                  placeholder="Enter username (e.g. alexander) or email (e.g. alex@tech.io)"
                  value={newMemberForm.identifier || ""}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, identifier: e.target.value })}
                />
                <small style={{ color: "#748779", fontSize: "0.78rem", marginTop: "4px", display: "block" }}>
                  Provide either the member's registered username or their email address.
                </small>
              </div>
              <div className="teams-form-group">
                <label htmlFor="member-role">Role</label>
                <select
                  id="member-role"
                  value={newMemberForm.role}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, role: e.target.value })}
                >
                  <option value="editor">Editor (Can commit, push, pull, or merge code)</option>
                  <option value="creator">Creator / Owner (Full Admin Rights)</option>
                </select>
              </div>
              <div className="teams-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setSelectedGroupForMember(null)}>Cancel</button>
                <button type="submit" className="btn-create-team">Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
