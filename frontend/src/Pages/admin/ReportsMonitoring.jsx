import React, { useEffect, useState } from "react";
import { fetchAdminStats, fetchReposFromDB } from "./adminDataService";
import "./Admin.css";

export default function ReportsMonitoring() {
  const [repos, setRepos] = useState([]);
  const [stats, setStats] = useState({});
  const [dateRange, setDateRange] = useState("30d");
  const [selectedRepo, setSelectedRepo] = useState("All");

  useEffect(() => {
    fetchReposFromDB().then(setRepos);
    fetchAdminStats().then(setStats).catch(() => setStats({}));
  }, []);

  const publicRepos = repos.filter((repo) => repo.visibility === "Public").length;
  const privateRepos = repos.filter((repo) => repo.visibility === "Private").length;
  const totalIssues = (stats.openIssues || 0) + (stats.closedIssues || 0);
  const closedIssuePercent = totalIssues ? Math.round((stats.closedIssues / totalIssues) * 100) : 0;
  const totalPRs = (stats.pendingPRs || 0) + (stats.mergedPRs || 0) + (stats.rejectedPRs || 0);
  const mergedPRPercent = totalPRs ? Math.round((stats.mergedPRs / totalPRs) * 100) : 0;
  const publicRepoPercent = repos.length ? Math.round((publicRepos / repos.length) * 100) : 0;

  return (
    <div>
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Reports & Platform Monitoring</h1>
          <p className="page-subtitle">
            System performance analytics, user growth, repository velocity, and commit distribution
          </p>
        </div>
      </div>

      {/* Date & Repository Filter Bar */}
      <div className="filter-toolbar">
        <label style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--admin-text-muted)", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Date Range:</span>
          <select
            className="filter-select"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="1y">Past Year</option>
          </select>
        </label>

        <label style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--admin-text-muted)", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Filter Repository:</span>
          <select
            className="filter-select"
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
          >
            <option value="All">All Repositories</option>
            {repos.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ marginLeft: "auto" }}>
          <button
            className="btn-secondary"
            onClick={() => alert("Simulating Report Export as CSV/PDF...")}
          >
            📥 Export Report (CSV)
          </button>
        </div>
      </div>

      {/* High Level Key Performance Indicator Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card-widget">
          <div className="stat-icon-wrapper green">📈</div>
          <div className="stat-info-group">
            <p>Active Users Growth</p>
            <h2>{stats.totalUsers || 0}</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--admin-accent-green)" }}>Database users</span>
          </div>
        </div>

        <div className="stat-card-widget">
          <div className="stat-icon-wrapper blue">📦</div>
          <div className="stat-info-group">
            <p>Repo Growth Rate</p>
            <h2>{stats.totalRepos || 0}</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--admin-accent-blue)" }}>Database repositories</span>
          </div>
        </div>

        <div className="stat-card-widget">
          <div className="stat-icon-wrapper purple">🔨</div>
          <div className="stat-info-group">
            <p>Total Commit Volume</p>
            <h2>{stats.totalCommits || 0}</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--admin-text-subtle)" }}>Stored commit total</span>
          </div>
        </div>

        <div className="stat-card-widget">
          <div className="stat-icon-wrapper amber">⚡</div>
          <div className="stat-info-group">
            <p>PR Resolution Velocity</p>
            <h2>{stats.storageUsed || "Not tracked"}</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--admin-accent-amber)" }}>Database storage field</span>
          </div>
        </div>
      </div>

      {/* Database distributions */}
      <div className="charts-grid-row">
        <div className="panel-card">
          <div className="panel-card-header">
            <div>
              <h3 className="panel-card-title">Database Totals</h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--admin-text-muted)" }}>
                Current totals from MongoDB ({dateRange})
              </p>
            </div>
            <span className="badge badge-active">Live database</span>
          </div>

          <div className="database-summary-list">
            <div><span>Total users</span><strong>{stats.totalUsers || 0}</strong></div>
            <div><span>Total repositories</span><strong>{stats.totalRepos || 0}</strong></div>
            <div><span>Total commits</span><strong>{stats.totalCommits || 0}</strong></div>
          </div>
        </div>

        {/* Issue & PR Resolution Efficiency */}
        <div className="panel-card">
          <div className="panel-card-header">
            <h3 className="panel-card-title">Issue & PR Distribution</h3>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>Issue Resolution Rate</span>
                <span style={{ color: "var(--admin-accent-green)", fontWeight: "700" }}>{closedIssuePercent}% Resolved</span>
              </div>
              <div style={{ height: "10px", background: "rgba(255,255,255,0.08)", borderRadius: "5px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${closedIssuePercent}%`, background: "var(--admin-accent-green)" }}></div>
                <div style={{ width: `${100 - closedIssuePercent}%`, background: "var(--admin-accent-red)" }}></div>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>PR Approval vs Rejection</span>
                <span style={{ color: "var(--admin-accent-purple)", fontWeight: "700" }}>{mergedPRPercent}% Merged</span>
              </div>
              <div style={{ height: "10px", background: "rgba(255,255,255,0.08)", borderRadius: "5px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${mergedPRPercent}%`, background: "var(--admin-accent-purple)" }}></div>
                <div style={{ width: `${100 - mergedPRPercent}%`, background: "var(--admin-accent-amber)" }}></div>
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>Public vs Private Repositories</span>
                <span style={{ color: "var(--admin-accent-blue)", fontWeight: "700" }}>{publicRepoPercent}% Public</span>
              </div>
              <div style={{ height: "10px", background: "rgba(255,255,255,0.08)", borderRadius: "5px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${publicRepoPercent}%`, background: "var(--admin-accent-blue)" }}></div>
                <div style={{ width: `${100 - publicRepoPercent}%`, background: "rgba(255,255,255,0.2)" }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
