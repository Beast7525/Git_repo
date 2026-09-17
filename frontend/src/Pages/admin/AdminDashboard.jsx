import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "./AdminLayout";
import AdminDashboardView from "./AdminDashboardView";
import UserManagementView from "./UserManagement";
import GroupManagementView from "./GroupManagement";
import RepoManagementView from "./RepoManagement";
import IssueManagementView from "./IssueManagement";
import PullRequestManagementView from "./PullRequestManagement";
import ReportsMonitoringView from "./ReportsMonitoring";
import AdminSettingsView from "./AdminSettings";

import {
  fetchAdminStats,
  fetchUsersFromDB,
  fetchReposFromDB,
  fetchIssuesFromDB,
  fetchPRsFromDB,
  getAdminSettings
} from "./adminDataService";
import "./Admin.css";

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState({});
  const [adminUser, setAdminUser] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [loadError, setLoadError] = useState("");

  // Initialize Admin profile & load DB data
  useEffect(() => {
    async function initData() {
      setLoading(true);
      setLoadError("");
      try {
        const currentUser = JSON.parse(localStorage.getItem("user") || "null");
        if (currentUser) {
          setAdminUser(currentUser);
        } else {
          const storedSettings = getAdminSettings();
          setAdminUser(storedSettings.profile);
        }

        // Fetch DB derived metrics in parallel
        const [resStats] = await Promise.all([
          fetchAdminStats(),
          fetchUsersFromDB(),
          fetchReposFromDB(),
          fetchIssuesFromDB(),
          fetchPRsFromDB()
        ]);

        if (resStats) setStats(resStats);
      } catch (err) {
        console.error("Failed to load admin DB stats:", err);
        setLoadError("The database could not be reached. No demo data was loaded.");
      } finally {
        setLoading(false);
      }
    }

    initData();
  }, [activeTab]);

  function showToast(msg) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }

  return (
    <AdminLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      adminUser={adminUser}
      onLogout={() => {
        localStorage.clear();
        navigate("/login");
      }}
    >
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: "var(--admin-surface)",
            color: "white",
            border: "1px solid var(--admin-primary)",
            padding: "14px 20px",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontWeight: "600",
            fontSize: "0.9rem",
            animation: "modalPop 0.2s ease"
          }}
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-panel">Loading Database Metrics & Records...</div>
      ) : loadError ? (
        <div className="loading-panel">
          <strong>{loadError}</strong>
        </div>
      ) : (
        <>
          {activeTab === "dashboard" && (
            <AdminDashboardView stats={stats} onNavigateTab={(tab) => setActiveTab(tab)} />
          )}
          {activeTab === "users" && (
            <UserManagementView stats={stats} onNavigateTab={(tab) => setActiveTab(tab)} />
          )}
          {activeTab === "groups" && (
            <GroupManagementView showToast={showToast} />
          )}
          {activeTab === "repos" && (
            <RepoManagementView showToast={showToast} />
          )}
          {activeTab === "issues" && (
            <IssueManagementView showToast={showToast} />
          )}
          {activeTab === "pull-requests" && (
            <PullRequestManagementView showToast={showToast} />
          )}
          {activeTab === "reports" && (
            <ReportsMonitoringView showToast={showToast} />
          )}
          {activeTab === "settings" && (
            <AdminSettingsView showToast={showToast} />
          )}
        </>
      )}
    </AdminLayout>
  );
}
