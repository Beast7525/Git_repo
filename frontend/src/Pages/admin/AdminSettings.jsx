import React, { useState } from "react";
import defaultProfile from "../assert/profile.png";
import { getAdminSettings, updateAdminSettings } from "./adminDataService";
import "./Admin.css";

export default function AdminSettings({ showToast }) {
  const [settings, setSettings] = useState(getAdminSettings());
  const [activeTab, setActiveTab] = useState("profile"); // profile | security | system | notifications

  // Profile Form
  const [profileForm, setProfileForm] = useState(settings.profile || {});

  // Password Form
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });

  // System Form
  const [systemForm, setSystemForm] = useState(settings.system || {});

  // Security Form
  const [securityForm, setSecurityForm] = useState(settings.security || {});

  // Notification Form
  const [notificationForm, setNotificationForm] = useState(settings.notifications || {});

  function handleSaveProfile(e) {
    e.preventDefault();
    const updated = updateAdminSettings("profile", profileForm);
    setSettings(updated);
    showToast("Admin profile updated successfully!");
  }

  function handleChangePassword(e) {
    e.preventDefault();
    if (passwordForm.next !== passwordForm.confirm) {
      alert("New password and confirmation do not match!");
      return;
    }
    if (passwordForm.next.length < 8) {
      alert("Password must be at least 8 characters long!");
      return;
    }
    setPasswordForm({ current: "", next: "", confirm: "" });
    showToast("Admin password changed successfully!");
  }

  function handleSaveSystem(e) {
    e.preventDefault();
    const updated = updateAdminSettings("system", systemForm);
    setSettings(updated);
    showToast("System settings updated!");
  }

  function handleSaveSecurity(e) {
    e.preventDefault();
    const updated = updateAdminSettings("security", securityForm);
    setSettings(updated);
    showToast("Security policies updated!");
  }

  function handleSaveNotifications(e) {
    e.preventDefault();
    const updated = updateAdminSettings("notifications", notificationForm);
    setSettings(updated);
    showToast("Notification preferences saved!");
  }

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Admin Profile & Settings</h1>
          <p className="page-subtitle">
            Configure system parameters, security policies, admin profile, and notification rules
          </p>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--admin-border)", marginBottom: "24px" }}>
        {[
          { id: "profile", label: "Profile Info & Security" },
          { id: "system", label: "System Configuration" },
          { id: "security", label: "Security & Sessions" },
          { id: "notifications", label: "Notifications & Alerts" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "12px 18px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "3px solid var(--admin-primary)" : "3px solid transparent",
              color: activeTab === tab.id ? "white" : "var(--admin-text-muted)",
              fontWeight: activeTab === tab.id ? "700" : "500",
              cursor: "pointer",
              fontSize: "0.92rem",
              transition: "all 0.2s ease"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PROFILE & PASSWORD */}
      {activeTab === "profile" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Profile Form */}
          <div className="panel-card">
            <h3 className="panel-card-title" style={{ marginBottom: "18px" }}>Admin Profile Details</h3>
            <form onSubmit={handleSaveProfile}>
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <img
                  src={defaultProfile}
                  alt="Admin Profile"
                  style={{ width: "72px", height: "72px", borderRadius: "50%", objectFit: "cover", border: "3px solid var(--admin-primary)" }}
                />
              </div>

              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={profileForm.name || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  required
                  value={profileForm.email || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Bio / Responsibility</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={profileForm.bio || ""}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: "100%" }}>
                Save Profile Changes
              </button>
            </form>
          </div>

          {/* Change Password */}
          <div className="panel-card">
            <h3 className="panel-card-title" style={{ marginBottom: "18px" }}>Change Admin Password</h3>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  value={passwordForm.current}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  value={passwordForm.next}
                  onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-secondary" style={{ width: "100%", marginTop: "12px" }}>
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM SETTINGS */}
      {activeTab === "system" && (
        <div className="panel-card" style={{ maxWidth: "650px" }}>
          <h3 className="panel-card-title" style={{ marginBottom: "18px" }}>System Configuration</h3>
          <form onSubmit={handleSaveSystem}>
            <div className="form-group">
              <label>System Platform Name</label>
              <input
                type="text"
                className="form-control"
                value={systemForm.systemName || ""}
                onChange={(e) => setSystemForm({ ...systemForm, systemName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Default Repository Visibility</label>
              <select
                className="form-control"
                value={systemForm.defaultRepoVisibility || "Public"}
                onChange={(e) => setSystemForm({ ...systemForm, defaultRepoVisibility: e.target.value })}
              >
                <option value="Public">Public (Anyone can read)</option>
                <option value="Private">Private (Invite only)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Max File Upload Size (MB)</label>
              <input
                type="number"
                className="form-control"
                value={systemForm.maxUploadSizeMB || 100}
                onChange={(e) => setSystemForm({ ...systemForm, maxUploadSizeMB: parseInt(e.target.value) || 50 })}
              />
            </div>

            <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "16px", borderRadius: "10px", border: "1px solid var(--admin-border)", marginBottom: "20px" }}>
              <label className="switch-label" style={{ margin: 0 }}>
                <div>
                  <strong>System Maintenance Mode</strong>
                  <div style={{ fontSize: "0.8rem", color: "var(--admin-text-muted)" }}>
                    When enabled, non-admin users cannot push or modify repositories.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={systemForm.maintenanceMode || false}
                  onChange={(e) => setSystemForm({ ...systemForm, maintenanceMode: e.target.checked })}
                />
              </label>
            </div>

            <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "16px", borderRadius: "10px", border: "1px solid var(--admin-border)", marginBottom: "20px" }}>
              <label className="switch-label" style={{ margin: 0 }}>
                <div>
                  <strong>Public User Registration Allowed</strong>
                  <div style={{ fontSize: "0.8rem", color: "var(--admin-text-muted)" }}>
                    Allow new developers to create accounts without admin invitation.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={systemForm.publicRegistration || false}
                  onChange={(e) => setSystemForm({ ...systemForm, publicRegistration: e.target.checked })}
                />
              </label>
            </div>

            <button type="submit" className="btn-primary">Save System Settings</button>
          </form>
        </div>
      )}

      {/* TAB 3: SECURITY & SESSIONS */}
      {activeTab === "security" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className="panel-card" style={{ maxWidth: "650px" }}>
            <h3 className="panel-card-title" style={{ marginBottom: "18px" }}>Security & Password Policy</h3>
            <form onSubmit={handleSaveSecurity}>
              <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "16px", borderRadius: "10px", border: "1px solid var(--admin-border)", marginBottom: "20px" }}>
                <label className="switch-label" style={{ margin: 0 }}>
                  <div>
                    <strong>Require Two-Factor Authentication (2FA)</strong>
                    <div style={{ fontSize: "0.8rem", color: "var(--admin-text-muted)" }}>
                      Mandate TOTP authenticator for all Administrator roles.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={securityForm.require2FA || false}
                    onChange={(e) => setSecurityForm({ ...securityForm, require2FA: e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-group">
                <label>Session Idle Timeout (Minutes)</label>
                <input
                  type="number"
                  className="form-control"
                  value={securityForm.sessionTimeoutMinutes || 60}
                  onChange={(e) => setSecurityForm({ ...securityForm, sessionTimeoutMinutes: parseInt(e.target.value) || 30 })}
                />
              </div>

              <button type="submit" className="btn-primary">Update Security Policies</button>
            </form>
          </div>

          <div className="panel-card">
            <h3 className="panel-card-title" style={{ marginBottom: "14px" }}>Active Admin Sessions</h3>
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>IP Address</th>
                    <th>Device / Browser</th>
                    <th>Location</th>
                    <th>Last Active</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.activeSessions && settings.activeSessions.map((sess) => (
                    <tr key={sess.id}>
                      <td style={{ fontFamily: "monospace" }}>{sess.ip}</td>
                      <td>{sess.device}</td>
                      <td>{sess.location}</td>
                      <td>{sess.lastActive}</td>
                      <td>
                        {sess.current ? (
                          <span className="badge badge-active">Current Session</span>
                        ) : (
                          <span className="badge badge-pending">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: NOTIFICATIONS */}
      {activeTab === "notifications" && (
        <div className="panel-card" style={{ maxWidth: "650px" }}>
          <h3 className="panel-card-title" style={{ marginBottom: "18px" }}>Notification Rules</h3>
          <form onSubmit={handleSaveNotifications}>
            <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "16px", borderRadius: "10px", border: "1px solid var(--admin-border)", marginBottom: "16px" }}>
              <label className="switch-label" style={{ margin: 0 }}>
                <div>
                  <strong>Email Security Event Alerts</strong>
                  <div style={{ fontSize: "0.8rem", color: "var(--admin-text-muted)" }}>
                    Receive immediate email when unauthorized admin access is attempted.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notificationForm.emailAlertsOnSecurityEvent || false}
                  onChange={(e) => setNotificationForm({ ...notificationForm, emailAlertsOnSecurityEvent: e.target.checked })}
                />
              </label>
            </div>

            <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "16px", borderRadius: "10px", border: "1px solid var(--admin-border)", marginBottom: "16px" }}>
              <label className="switch-label" style={{ margin: 0 }}>
                <div>
                  <strong>New User Registration Alerts</strong>
                  <div style={{ fontSize: "0.8rem", color: "var(--admin-text-muted)" }}>
                    Notify admin team when a new developer signs up.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notificationForm.notifyOnNewUserSignup || false}
                  onChange={(e) => setNotificationForm({ ...notificationForm, notifyOnNewUserSignup: e.target.checked })}
                />
              </label>
            </div>

            <button type="submit" className="btn-primary">Save Notification Preferences</button>
          </form>
        </div>
      )}
    </div>
  );
}
