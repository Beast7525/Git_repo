import React, { useEffect, useState } from "react";
import User_header from "./User_header";
import "./style/Issue.css";
import { useLoading } from "../context/LoadingContext";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

function Issue() {
  const { startLoading, stopLoading } = useLoading();

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const loggedInUsername = localStorage.getItem("username") || currentUser.username || currentUser.name || "";
  const currentUserId = localStorage.getItem("userId") || currentUser.id || "";

  const [issues, setIssues] = useState([]);
  const [filteredIssues, setFilteredIssues] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [view, setView] = useState("list"); // list | create | detail
  const [selectedIssue, setSelectedIssue] = useState(null);

  // Create issue form
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueRepo, setIssueRepo] = useState("");
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [formError, setFormError] = useState(false);

  // Detail actions
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [actionError, setActionError] = useState(false);

  async function loadIssues() {
    try {
      startLoading();
      setLoading(true);
      setError("");
      const res = await fetch(`${API_BASE_URL}/api/issues`);
      if (res.ok) {
        const data = await res.json();
        const relevant = (Array.isArray(data) ? data : []).filter(
          (i) =>
            (i.repositoryOwner && i.repositoryOwner.toLowerCase() === loggedInUsername.toLowerCase()) ||
            (i.author && i.author.toLowerCase() === loggedInUsername.toLowerCase())
        );
        setIssues(relevant);
      } else {
        setError("Failed to load issues from the server.");
      }
    } catch (err) {
      console.error("Error loading issues:", err);
      setError("Network error while loading issues.");
    } finally {
      setLoading(false);
      stopLoading();
    }
  }

  useEffect(() => {
    loadIssues();
  }, []);

  useEffect(() => {
    let list = issues;
    if (statusFilter !== "all") {
      list = list.filter((i) => i.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (i) =>
          (i.title || "").toLowerCase().includes(q) ||
          (i.repository || "").toLowerCase().includes(q) ||
          String(i.number || "").includes(q)
      );
    }
    setFilteredIssues(list);
  }, [issues, statusFilter, searchTerm]);

  function openDetail(issue) {
    setSelectedIssue(issue);
    setCommentText("");
    setActionMsg("");
    setActionError(false);
    setView("detail");
  }

  async function refreshIssueDetail(id) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/issues/${id}`);
      if (res.ok) {
        const updated = await res.json();
        setSelectedIssue(updated);
        const listRes = await fetch(`${API_BASE_URL}/api/issues`);
        if (listRes.ok) {
          const data = await listRes.json();
          setIssues(
            (Array.isArray(data) ? data : []).filter(
              (i) =>
                (i.repositoryOwner && i.repositoryOwner.toLowerCase() === loggedInUsername.toLowerCase()) ||
                (i.author && i.author.toLowerCase() === loggedInUsername.toLowerCase())
            )
          );
        }
      }
    } catch (err) {
      console.error("Error refreshing issue:", err);
    }
  }

  async function handleCreateIssue(e) {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDesc.trim()) {
      setFormError(true);
      setFormMsg("Please fill in both the title and description.");
      return;
    }
    setCreating(true);
    setFormMsg("");
    setFormError(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: issueTitle.trim(),
          description: issueDesc.trim(),
          author: loggedInUsername,
          userId: currentUserId,
          repository: issueRepo.trim() || "general",
          repositoryOwner: loggedInUsername
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }
      setFormError(false);
      setFormMsg(`Issue #${data.number || ""} created successfully.`);
      setIssueTitle("");
      setIssueDesc("");
      setIssueRepo("");
      await loadIssues();
      setTimeout(() => {
        setView("list");
        setFormMsg("");
      }, 1500);
    } catch (err) {
      setFormError(true);
      setFormMsg(err.message || "Failed to create issue.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleStatus(issue) {
    setTogglingStatus(true);
    setActionMsg("");
    setActionError(false);
    const nextStatus = issue.status === "open" ? "closed" : "open";
    try {
      const res = await fetch(`${API_BASE_URL}/api/issues/${issue._id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }
      setActionError(false);
      setActionMsg(nextStatus === "closed" ? `Issue #${issue.number} has been closed. Great job!` : `Issue #${issue.number} has been reopened.`);
      await refreshIssueDetail(issue._id);
    } catch (err) {
      setActionError(true);
      setActionMsg(err.message || "Failed to update issue status.");
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPostingComment(true);
    setActionMsg("");
    setActionError(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/issues/${selectedIssue._id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: loggedInUsername, body: commentText.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || res.statusText);
      }
      setCommentText("");
      await refreshIssueDetail(selectedIssue._id);
    } catch (err) {
      setActionError(true);
      setActionMsg(err.message || "Failed to add comment.");
    } finally {
      setPostingComment(false);
    }
  }

  function renderList() {
    return (
      <div>
        <div className="issues-header">
          <h1 className="title-heading">Issues</h1>
          <button className="create-issue-btn" onClick={() => { setView("create"); setFormMsg(""); setFormError(false); }}>
            + New Issue
          </button>
        </div>

        <div className="filter-search-bar">
          <div className="status-tabs">
            <button className={`status-tab ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>
              All
            </button>
            <button className={`status-tab ${statusFilter === "open" ? "active" : ""}`} onClick={() => setStatusFilter("open")}>
              Open
            </button>
            <button className={`status-tab ${statusFilter === "closed" ? "active" : ""}`} onClick={() => setStatusFilter("closed")}>
              Closed
            </button>
          </div>
          <input
            className="issue-search-input"
            type="text"
            placeholder="Search by title, repository, or issue number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="issues-list-box">
          {loading ? (
            <div className="issues-loading">Loading issues...</div>
          ) : filteredIssues.length === 0 ? (
            <div className="issues-empty">
              <h3>No issues found</h3>
              <p>
                {issues.length === 0
                  ? "You have no issues yet. Raise one from a repository, or press '+ New Issue' to create one."
                  : "No issues match the current filter."}
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => (
              <div className="issue-row" key={issue._id}>
                <div className="issue-row-left">
                  <span className="issue-status-dot">{issue.status === "open" ? "🟢" : "🔴"}</span>
                  <div className="issue-info">
                    <span
                      className="issue-title-link"
                      onClick={() => openDetail(issue)}
                    >
                      {issue.title}
                    </span>
                    <span className="issue-meta">
                      #{issue.number || ""} opened by {issue.author || "Unknown"}
                      {issue.repository ? ` in ${issue.repository} (${issue.repositoryOwner || ""})` : ""}
                    </span>
                  </div>
                </div>
                <div className="issue-row-right">
                  <span className="comment-bubble-icon">💬</span>
                  <span className="comment-count">{(issue.comments || []).length}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  function renderCreate() {
    return (
      <div className="new-issue-form-panel">
        <button className="back-btn" onClick={() => { setView("list"); setFormMsg(""); }}>
          ← Back to Issues
        </button>
        <form className="new-issue-form" onSubmit={handleCreateIssue}>
          <label className="form-label">Title *</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. Bug: API returns 500 on empty request"
            value={issueTitle}
            onChange={(e) => setIssueTitle(e.target.value)}
          />
          <label className="form-label">Description *</label>
          <textarea
            className="form-textarea"
            rows="6"
            placeholder="Describe the problem, steps to reproduce, and expected behavior..."
            value={issueDesc}
            onChange={(e) => setIssueDesc(e.target.value)}
          />
          <label className="form-label">Repository (optional)</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. my-awesome-ref (leave blank for general issue)"
            value={issueRepo}
            onChange={(e) => setIssueRepo(e.target.value)}
          />
          {formMsg && (
            <div style={{ color: formError ? "#f85149" : "#3fb950", fontWeight: 600, fontSize: "0.9rem" }}>
              {formMsg}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="back-btn" onClick={() => setView("list")}>
              Cancel
            </button>
            <button className="create-issue-btn" type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create Issue"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function renderDetail() {
    if (!selectedIssue) return null;
    const isOpen = selectedIssue.status === "open";
    const comments = selectedIssue.comments || [];

    return (
      <div className="issue-details-view">
        <div className="detail-header">
          <div className="detail-header-left">
            <button className="back-icon-btn" onClick={() => setView("list")}>
              ← Back to Issues
            </button>
            <h1 className="detail-title">
              {selectedIssue.title} <span className="detail-number">#{selectedIssue.number || ""}</span>
            </h1>
            <div className="detail-meta-row">
              <span className={`status-badge ${isOpen ? "open" : "closed"}`}>
                {isOpen ? "🟢 Open" : "🔴 Closed"}
              </span>
              <span className="meta-description">
                {selectedIssue.author || "Unknown"} opened this issue
                {selectedIssue.repository ? ` in ${selectedIssue.repository}` : ""} ·{" "}
                {selectedIssue.createdAt ? new Date(selectedIssue.createdAt).toLocaleDateString() : "Recently"}
              </span>
            </div>
          </div>
          <button
            className="status-toggle-btn"
            disabled={togglingStatus}
            onClick={() => handleToggleStatus(selectedIssue)}
          >
            {togglingStatus ? "Updating..." : isOpen ? "Close Issue" : "Reopen Issue"}
          </button>
        </div>

        {actionMsg && (
          <div style={{ color: actionError ? "#f85149" : "#3fb950", fontWeight: 600, marginBottom: "16px" }}>
            {actionMsg}
          </div>
        )}

        <hr className="divider" />

        <div className="detail-grid">
          <div className="detail-timeline">
            <div className="comment-box original-post">
              <div className="comment-box-header">
                <strong>{selectedIssue.author || "Unknown"}</strong> <span>posted this issue</span>
              </div>
              <div className="comment-box-body">{selectedIssue.description || "No description provided."}</div>
            </div>

            {comments.map((c, idx) => (
              <div className="comment-box" key={idx}>
                <div className="comment-box-header">
                  <strong>{c.author || "Unknown"}</strong> <span>commented · {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}</span>
                </div>
                <div className="comment-box-body">{c.body}</div>
              </div>
            ))}

            <div className="add-comment-section">
              <h3 className="section-title">Add a comment</h3>
              <form onSubmit={handleAddComment}>
                <textarea
                  className="comment-textarea"
                  rows="4"
                  placeholder="Leave a comment for the issue author or maintainers..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <div className="comment-actions">
                  <button className="create-issue-btn comment-submit" type="submit" disabled={postingComment || !commentText.trim()}>
                    {postingComment ? "Posting..." : "Comment"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="detail-sidebar">
            <div className="sidebar-group">
              <h4>Repository</h4>
              <p>{selectedIssue.repository || "General"}</p>
            </div>
            <div className="sidebar-group">
              <h4>Assigned To</h4>
              <p>{selectedIssue.repositoryOwner || "Owner / Maintainers"}</p>
            </div>
            <div className="sidebar-group">
              <h4>Reported By</h4>
              <p>{selectedIssue.author || "Unknown"}</p>
            </div>
            <div className="sidebar-group">
              <h4>Comments</h4>
              <p>{comments.length}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <User_header />
      <div className="issues-container">
        <div className="issues-panel">
          {view === "create" ? renderCreate() : view === "detail" ? renderDetail() : renderList()}
        </div>
      </div>
    </div>
  );
}

export default Issue;