import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Admin.css";

export default function AdminLayout({ activeTab, setActiveTab, adminUser, children, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const navigate = useNavigate();

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "users", label: "Users", icon: "👥" },
    { id: "groups", label: "Groups & Teams", icon: "🔑" },
    { id: "repos", label: "Repositories", icon: "📦" },
    { id: "issues", label: "Issues", icon: "⚠️" },
    { id: "pull-requests", label: "Pull Requests", icon: "🔀" },
    { id: "reports", label: "Reports & Monitoring", icon: "📈" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  function handleNavClick(tabId) {
    setActiveTab(tabId);
    setMobileOpen(false);
  }

  function confirmLogout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    if (onLogout) onLogout();
    navigate("/login");
  }

  return (
    <div className="admin-shell">
      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="modal-backdrop"
          style={{ opacity: 0.5, zIndex: 99 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Navigation Sidebar */}
      <aside className={`admin-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="admin-sidebar-brand">
          <div>
            <h2 className="brand-title">GitRepo Admin</h2>
            <span className="brand-subtitle">Repo Platform</span>
          </div>
        </div>

        <nav className="admin-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? "active" : ""}`}
              onClick={() => handleNavClick(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-nav-btn" onClick={() => setShowLogoutModal(true)}>
            <span className="nav-icon">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="admin-main">
        {/* Top Header */}
        <header className="admin-header">
          <div className="header-left">
            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileOpen(!mobileOpen)}
              title="Toggle Menu"
            >
              ☰
            </button>
            <div className="header-search">
              <span className="search-icon-inside">🔍</span>
              <input
                type="text"
                placeholder="Global search repos, users, issues..."
              />
            </div>
          </div>

          <div className="header-right">
            <div className="system-status-chip">
              <span className="pulse-dot"></span>
              <span>System Healthy</span>
            </div>

            <div
              className="admin-profile-pill"
              onClick={() => setActiveTab("settings")}
              title="View Admin Profile"
            >
              <div className="admin-user-info">
                <span className="admin-name">
                  {adminUser?.name || "Administrator"}
                </span>
                <span className="admin-role">
                  {adminUser?.role || "System Admin"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Dynamic Page Content View */}
        <main className="admin-content">{children}</main>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <h3 className="modal-title">Confirm Logout</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowLogoutModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, color: "var(--admin-text-muted)" }}>
                Are you sure you want to log out of the Git Repository Management Admin Panel?
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
              <button className="btn-danger" onClick={confirmLogout}>
                Logout Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
