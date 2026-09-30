import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import User_header from "./User_header";
import "./style/Teams.css";
import { useLoading } from "../context/LoadingContext";
import { apiFetch } from "../auth/apiFetch";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}") || {};
  } catch {
    return {};
  }
}

export default function Teams() {
  const { startLoading, stopLoading } = useLoading();
  const { groupId: focusedGroupId } = useParams();
  const [groups, setGroups] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroupForMember, setSelectedGroupForMember] = useState(null);
  const teamCardRefs = useRef({});

  // Form States
  const [newGroupForm, setNewGroupForm] = useState({ name: "", description: "" });
  const [newMemberForm, setNewMemberForm] = useState({ identifier: "", role: "editor" });
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  // Retrieve logged-in user
  const currentUser = readStoredUser();
  const loggedInUsername = localStorage.getItem("username") || currentUser.username || currentUser.name || "";
  // The account email never changes when the profile display name is edited, so it is the
  // reliable key for deciding who the signed-in account is.
  const loggedInEmail = currentUser.gmail || currentUser.email || "";
  const lookupUsername = loggedInUsername;
  const lookupEmail = loggedInEmail;

  // Sent with every membership change so the API can verify the team owner
  const identityHeaders = {
    "Content-Type": "application/json",
    "x-user-name": loggedInUsername,
    "x-user-email": loggedInEmail,
  };

  // Load user groups
  const loadUserGroups = useCallback(async () => {
    if (!lookupUsername && !lookupEmail) {
      setGroups([]);
      return;
    }
    try {
      startLoading();
      const params = new URLSearchParams();
      if (lookupUsername) params.append("username", lookupUsername);
      if (lookupEmail) params.append("email", lookupEmail);

      const res = await fetch(`${API_BASE_URL}/api/groups/my-groups?${params.toString()}`);
      if (!res.ok) {
        setGroups([]);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];

      // A deep link such as /teams/<groupId> must always resolve, even for a member
      // who is not signed in, so pull that single team directly.
      if (focusedGroupId && !list.some((g) => g._id === focusedGroupId)) {
        const teamParams = new URLSearchParams();
        if (lookupUsername) teamParams.append("username", lookupUsername);
        if (lookupEmail) teamParams.append("email", lookupEmail);
        const teamRes = await fetch(`${API_BASE_URL}/api/groups/${focusedGroupId}/team?${teamParams.toString()}`);
        if (teamRes.ok) {
          const team = await teamRes.json();
          if (team && team._id) list.unshift(team);
        }
      }

      setGroups(list);
    } catch (err) {
      console.error("Failed to load user groups:", err);
    } finally {
      stopLoading();
    }
  }, [lookupUsername, lookupEmail, focusedGroupId, startLoading, stopLoading]);

  useEffect(() => {
    loadUserGroups();
  }, [loadUserGroups]);

  // Scroll the team the member just accepted into view
  useEffect(() => {
    if (!focusedGroupId || groups.length === 0) return;
    const node = teamCardRefs.current[focusedGroupId];
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedGroupId, groups]);

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

  // Invite Member Submit - the team owner invites a member, who accepts it from their
  // own notifications. Nobody is added to the team until that happens.
  async function handleAddMember(e) {
    e.preventDefault();
    if (!selectedGroupForMember) return;
    const rawVal = (newMemberForm.identifier || "").trim();
    if (!rawVal) return;

    const usernameToSend = rawVal.includes("@") ? "" : rawVal;
    const emailToSend = rawVal.includes("@") ? rawVal : "";

    try {
      startLoading();
      const res = await fetch(`${API_BASE_URL}/api/groups/${selectedGroupForMember._id}/members`, {
        method: "POST",
        headers: identityHeaders,
        body: JSON.stringify({
          identifier: rawVal,
          username: usernameToSend,
          email: emailToSend,
          role: newMemberForm.role,
          requester: loggedInUsername,
          requesterEmail: loggedInEmail
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIsError(false);
        setMessage(data.message || `Invitation created for ${rawVal}.`);
        setNewMemberForm({ identifier: "", role: "editor" });
        setSelectedGroupForMember(null);
        loadUserGroups();
      } else {
        setIsError(true);
        setMessage(data.message || "Failed to invite member.");
      }
    } catch (err) {
      setIsError(true);
      setMessage("Error inviting member: " + err.message);
    } finally {
      stopLoading();
    }
  }

  // Remove Member from Group
  async function handleRemoveMember(groupId, memberId, memberName) {
    if (!window.confirm(`Are you sure you want to remove "${memberName}" from this team?`)) return;
    try {
      startLoading();
      const res = await fetch(`${API_BASE_URL}/api/groups/${groupId}/members/${memberId}`, {
        method: "DELETE",
        headers: identityHeaders,
        body: JSON.stringify({ requester: loggedInUsername, requesterEmail: loggedInEmail })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setIsError(false);
        setMessage(data.message || `Member "${memberName}" removed successfully.`);
        loadUserGroups();
      } else {
        const errData = await res.json().catch(() => ({}));
        setIsError(true);
        setMessage(errData.message || "Failed to remove member.");
      }
    } catch (err) {
      setIsError(true);
      setMessage("Error removing member: " + err.message);
    } finally {
      stopLoading();
    }
  }

  async function handleDeleteGroup(group) {
    const confirmed = window.confirm(
      `Delete "${group.name}"? This cannot be undone. Its repositories will be kept and detached from the group.`
    );
    if (!confirmed) return;

    try {
      startLoading();
      const res = await apiFetch(`${API_BASE_URL}/api/groups/${group._id}`, {
        method: "DELETE",
        headers: identityHeaders,
        body: JSON.stringify({ requester: loggedInUsername, requesterEmail: loggedInEmail })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Failed to delete group.");
      }

      setGroups((currentGroups) => currentGroups.filter((item) => item._id !== group._id));
      setIsError(false);
      setMessage(data.message || `Group "${group.name}" deleted.`);
    } catch (err) {
      setIsError(true);
      setMessage(err.message || "Error deleting group.");
    } finally {
      stopLoading();
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
              const isCreator = Boolean(
                (group.creator && group.creator.toLowerCase() === (lookupUsername || "").toLowerCase()) ||
                  (loggedInEmail && group.creatorEmail && group.creatorEmail.toLowerCase() === loggedInEmail.toLowerCase())
              );
              const isFocused = focusedGroupId === group._id;
              return (
                <div
                  key={group._id}
                  ref={(node) => { teamCardRefs.current[group._id] = node; }}
                  className={`team-card ${isFocused ? "focused" : ""}`}
                >
                  <div className="team-card-header">
                    <h2 className="team-card-title">{group.name}</h2>
                    {isCreator && <span className="team-creator-badge">Owner (Creator)</span>}
                  </div>
                  <p className="team-description">
                    {group.description || "No group description provided."}
                  </p>

                  <div className="team-section-title">Members ({group.members ? group.members.length : 0})</div>
                  <div className="member-list">
                    {(group.members || []).map((m, idx) => {
                      const isMemberCreator = m.role === 'creator' || (m.username && m.username.toLowerCase() === (group.creator || "").toLowerCase());
                      // Invitations are no longer added here, so a "pending" row is only ever a
                      // leftover from the old email flow and can just be removed.
                      const isPending = m.status === "pending";
                      const isDeclined = m.status === "declined";
                      return (
                        <div key={m._id || idx} className="member-item">
                          <div className="member-info">
                            <span className="member-name">{m.username || m.email}</span>
                            {m.email && <span className="member-email">{m.email}</span>}
                            {isPending && <span className="member-status pending">Invited</span>}
                            {isDeclined && <span className="member-status declined">Declined</span>}
                            {!isPending && !isDeclined && !isMemberCreator && (
                              <span className="member-status accepted">Member</span>
                            )}
                          </div>
                          <div className="member-actions">
                            <span className={`team-role-badge ${isMemberCreator ? 'creator' : 'editor'}`}>
                              {isMemberCreator ? 'Owner / Creator' : 'Editor'}
                            </span>
                            {isCreator && !isMemberCreator && m._id && (
                              <button
                                type="button"
                                style={{
                                  background: "rgba(239, 68, 68, 0.15)",
                                  color: "#ef4444",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  borderRadius: "6px",
                                  padding: "3px 8px",
                                  fontSize: "0.75rem",
                                  fontWeight: "600",
                                  cursor: "pointer"
                                }}
                                onClick={() => handleRemoveMember(group._id, m._id, m.username || m.email)}
                                title="Remove member"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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

                  {isCreator ? (
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
                      <button
                        className="btn-delete-group"
                        type="button"
                        onClick={() => handleDeleteGroup(group)}
                      >
                        Delete Group
                      </button>
                    </div>
                  ) : (
                    <div className="team-card-footer-note">
                      Only the team owner can add or remove members.
                    </div>
                  )}
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
              <h3>Invite Member to {selectedGroupForMember.name}</h3>
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
                  The invitation appears in that account&apos;s notifications. They join the team only after
                  accepting it, and are not added to the member list until then.
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
                <button type="submit" className="btn-create-team">Send Invitation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
