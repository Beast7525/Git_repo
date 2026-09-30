import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import User_header from "./User_header";
import { apiFetch } from "../auth/apiFetch";
import "./style/Notifications.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "REJECTED", label: "Rejected" }
];

function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/notifications`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.message) || `Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      console.error("Failed to load notifications:", err);
      setError(err.message || "Could not load your notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialLoad() {
      await loadNotifications();
    }
    initialLoad();
  }, [loadNotifications]);

  // Accepting joins the team, so only the clicked card changes until the server confirms.
  async function respond(notification, decision) {
    setBusyId(notification._id);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/notifications/${notification._id}/${decision}`, {
        method: "POST"
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.message) || `Request failed with status ${res.status}`);
      }

      setNotifications((list) =>
        list.map((n) =>
          n._id === notification._id
            ? { ...n, status: (data && data.status) || decision, responded_at: new Date().toISOString() }
            : n
        )
      );
      setError("");
    } catch (err) {
      console.error(`Failed to ${decision} invitation:`, err);
      setError(err.message || "Could not record your response.");
      // The server is the source of truth for status, so resync after a rejected action.
      await loadNotifications();
    } finally {
      setBusyId("");
    }
  }

  const visible = notifications.filter((n) => {
    if (filter === "ALL") return true;
    if (n.type === "MEMBER_INVITATION") return n.status === filter;
    return filter === "ALL";
  });

  const pendingCount = notifications.filter(
    (n) => n.type === "MEMBER_INVITATION" && n.status === "PENDING"
  ).length;

  return (
    <div className="notifications-page-container">
      <User_header />
      <main className="notifications-content-inner">
        <div className="notifications-header-banner">
          <div>
            <h1 className="page-title">
              <span>🔔 Notifications</span>
              {pendingCount > 0 && <span className="notifications-count-badge">{pendingCount}</span>}
            </h1>
            <p style={{ color: "#8b949e", fontSize: "0.9rem", marginTop: "6px" }}>
              Team invitations and activity addressed to your account
            </p>
          </div>
          <button className="notifications-refresh-btn" onClick={loadNotifications} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="notifications-filter-bar">
          {FILTERS.map((f) => {
            const count =
              f.key === "ALL"
                ? notifications.length
                : notifications.filter((n) => n.type === "MEMBER_INVITATION" && n.status === f.key).length;
            return (
              <button
                key={f.key}
                className={`notifications-filter-btn ${filter === f.key ? "active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>

        {error && (
          <div className="notifications-error-banner">
            <span>{error}</span>
            <button onClick={loadNotifications}>Try again</button>
          </div>
        )}

        {loading ? (
          <div className="notifications-empty-state">
            <h3>Loading your notifications...</h3>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notifications-empty-state">
            <div className="notifications-empty-icon">🔔</div>
            <h3>No notifications yet</h3>
            <p>When someone invites you to a team, the invitation will show up here.</p>
            <button className="notifications-refresh-btn" onClick={() => navigate("/teams")}>
              Browse teams
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="notifications-empty-state">
            <div className="notifications-empty-icon">🔍</div>
            <h3>No {filter.toLowerCase()} notifications</h3>
            <p>Try a different filter.</p>
          </div>
        ) : (
          <div className="notifications-list">
            {visible.map((n) => {
              const isInvitation = n.type === "MEMBER_INVITATION";
              const isPending = isInvitation && n.status === "PENDING";
              const busy = busyId === n._id;

              return (
                <div key={n._id} className={`notification-card ${isPending ? "pending" : ""}`}>
                  <div className="notification-card-header">
                    <div className="notification-card-title">
                      {isInvitation ? "👥 Team invitation" : "Notification"}
                      <span className={`notification-status-badge ${String(n.status || "").toLowerCase()}`}>
                        {String(n.status || "").toLowerCase()}
                      </span>
                    </div>
                    <span className="notification-time">{formatWhen(n.created_at)}</span>
                  </div>

                  <p className="notification-card-message">
                    {n.message ||
                      `${n.sender_name || "A team owner"} invited you to join "${n.project_name || "a team"}".`}
                  </p>

                  <div className="notification-card-footer">
                    <span className="notification-meta">
                      Team: <strong>{n.project_name || "Unknown team"}</strong>
                      {n.role ? ` · Role: ${n.role}` : ""}
                    </span>

                    {isInvitation && (
                      <div className="notification-actions">
                        {isPending ? (
                          <>
                            <button
                              className="notification-accept-btn"
                              disabled={busy}
                              onClick={() => respond(n, "accept")}
                            >
                              {busy ? "Working..." : "Accept"}
                            </button>
                            <button
                              className="notification-reject-btn"
                              disabled={busy}
                              onClick={() => respond(n, "reject")}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="notification-responded-note">
                            {n.status === "ACCEPTED" ? "You joined this team" : "You declined this invitation"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
