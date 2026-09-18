import React from "react";
import "./Admin.css";

export default function AdminDashboardView({ stats, onNavigateTab }) {
  const cards = [
    { title: "Total Users", value: stats.totalUsers || 0, sub: "Database records" },
    { title: "Total Repositories", value: stats.totalRepos || 0, sub: "Public & Private" },
    { title: "Total Commits", value: stats.totalCommits || 0, sub: "Across all branches" },
    { title: "Open Issues", value: stats.openIssues || 0, sub: "Needs triage" },
    { title: "Closed Issues", value: stats.closedIssues || 0, sub: "Resolved" },
    { title: "Pending PRs", value: stats.pendingPRs || 0, sub: "Awaiting review" },
  ];

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">
            System metrics, repository activity, and platform health summary
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-secondary" onClick={() => onNavigateTab("reports")}>
            View Full Reports
          </button>
          <button className="btn-primary" onClick={() => onNavigateTab("repos")}>
            + New Repository
          </button>
        </div>
      </div>

      {/* Summary Stat Cards Grid */}
      <div className="stat-cards-grid">
        {cards.map((card, idx) => (
          <div key={idx} className="stat-card-widget">
            <div className="stat-info-group">
              <p>{card.title}</p>
              <h2>{card.value}</h2>
              <span style={{ fontSize: "0.75rem", color: "var(--admin-text-subtle)" }}>
                {card.sub}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* SVG Graphs & Activity Section */}
      <div className="charts-grid-row">
        {/* Repository and commit data coverage */}
        <div className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3 className="panel-card-title">Repository Data Coverage</h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--admin-text-muted)" }}>
                Values below are read directly from the repository collection
              </p>
            </div>
            <span className="badge badge-active">Database</span>
          </div>

          <div className="database-summary-list">
            <div><span>Repositories in database</span><strong>{stats.totalRepos || 0}</strong></div>
            <div><span>Stored commit total</span><strong>{stats.totalCommits || 0}</strong></div>
          </div>
        </div>

        {/* Issue & PR Status Distribution */}
        <div className="panel-card">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Issue & PR Health</h3>
            <span className="badge badge-open">Database counts</span>
          </div>

          <div style={{ padding: "10px 0" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>Open vs Closed Issues</span>
                <span style={{ color: "var(--admin-accent-green)", fontWeight: "600" }}>{stats.closedIssues || 0} / {(stats.openIssues || 0) + (stats.closedIssues || 0)} Closed</span>
              </div>
              <div style={{ height: "8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${((stats.closedIssues || 0) / Math.max((stats.openIssues || 0) + (stats.closedIssues || 0), 1)) * 100}%`, background: "var(--admin-accent-green)" }}></div>
                <div style={{ width: `${((stats.openIssues || 0) / Math.max((stats.openIssues || 0) + (stats.closedIssues || 0), 1)) * 100}%`, background: "var(--admin-accent-red)" }}></div>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>Pending Pull Requests</span>
                <span style={{ color: "var(--admin-accent-purple)", fontWeight: "600" }}>{stats.pendingPRs || 0} Awaiting Approval</span>
              </div>
              <div style={{ height: "8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${stats.pendingPRs ? 100 : 0}%`, background: "var(--admin-accent-purple)" }}></div>
              </div>
            </div>

            <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "14px", borderRadius: "10px", border: "1px solid var(--admin-border)", marginTop: "18px" }}>
              <h4 style={{ margin: "0 0 6px", fontSize: "0.9rem" }}>System Status</h4>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--admin-text-muted)" }}>
                MongoDB Atlas: <strong style={{ color: "var(--admin-accent-green)" }}>Connected</strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* System Activity Log */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div>
            <h3 className="panel-card-title">Recent System Activity</h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--admin-text-muted)" }}>
              Real-time audit trail of repository changes, security events, and PR reviews
            </p>
          </div>
          <button className="btn-secondary" onClick={() => onNavigateTab("users")}>
            Manage Users
          </button>
        </div>

        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User / Initiator</th>
                <th>Action Performed</th>
                <th>Target Resource</th>
                <th>Time</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentActivity && stats.recentActivity.map((act) => (
                <tr key={act.id}>
                  <td style={{ fontWeight: "600" }}>{act.user}</td>
                  <td>{act.action}</td>
                  <td style={{ color: "var(--admin-accent-blue)" }}>{act.target}</td>
                  <td style={{ color: "var(--admin-text-subtle)", fontSize: "0.8rem" }}>{act.time}</td>
                  <td>
                    <span className={`badge ${act.type === 'pr' ? 'badge-admin' : act.type === 'issue' ? 'badge-pending' : 'badge-active'}`}>
                      {act.type.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
