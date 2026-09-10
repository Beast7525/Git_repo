// Data Service for Git Repository Management System Admin Panel
// Connects directly to backend DB API endpoints with fallback for offline state

const API_BASE_URL = "http://localhost:5000/api/admin";

const STORAGE_KEYS = {
  USERS: "git_admin_users_v1",
  REPOS: "git_admin_repos_v1",
  ISSUES: "git_admin_issues_v1",
  PULL_REQUESTS: "git_admin_prs_v1",
  ACTIVITY_LOGS: "git_admin_activity_v1",
  SETTINGS: "git_admin_settings_v1",
};

const SEED_USERS = [
  {
    id: "USR-1001",
    name: "Alexander Wright",
    email: "alexander.wright@gitrepo.org",
    role: "Admin",
    status: "Active",
    registrationDate: "2025-01-15",
    permissions: ["Full System Admin", "Manage Users", "Manage Repos", "Delete Projects", "System Config"]
  },
  {
    id: "USR-1002",
    name: "Sarah Jenkins",
    email: "sarah.j@techlab.io",
    role: "Maintainer",
    status: "Active",
    registrationDate: "2025-02-04",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80",
    permissions: ["Manage Repos", "Manage Issues", "Approve PRs", "View Metrics"]
  },
  {
    id: "USR-1003",
    name: "David Chen",
    email: "d.chen@devops.net",
    role: "Developer",
    status: "Active",
    registrationDate: "2025-02-18",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&h=120&q=80",
    permissions: ["Push Code", "Create Issues", "Open PRs"]
  }
];

const SEED_REPOS = [
  {
    id: "REPO-501",
    name: "react-core-dashboard",
    owner: "Alexander Wright",
    ownerEmail: "alexander.wright@gitrepo.org",
    visibility: "Public",
    contributors: 14,
    commits: 482,
    creationDate: "2025-01-20",
    status: "Active",
    description: "Enterprise grade modular react dashboard framework with customizable theme tokens.",
    stars: 342,
    forks: 89
  },
  {
    id: "REPO-502",
    name: "auth-service-micro",
    owner: "Sarah Jenkins",
    ownerEmail: "sarah.j@techlab.io",
    visibility: "Private",
    contributors: 6,
    commits: 215,
    creationDate: "2025-02-10",
    status: "Active",
    description: "OAuth2 and JWT high performance authentication microservice built with Node.js and Express."
  }
];

const SEED_ISSUES = [
  {
    id: "ISS-801",
    title: "Fix Memory Leak in Auth Session Middleware",
    repository: "auth-service-micro",
    createdBy: "Elena Rostova",
    assignedUser: "Sarah Jenkins",
    status: "Open",
    priority: "Critical",
    creationDate: "2025-09-02",
    description: "Redis session store fails to invalidate unauthenticated tokens causing memory growth over time."
  }
];

const SEED_PULL_REQUESTS = [
  {
    id: "PR-301",
    title: "Feature: Implement OAuth2 Refresh Token Rotation",
    repository: "auth-service-micro",
    createdBy: "Sarah Jenkins",
    targetBranch: "main",
    sourceBranch: "feature/oauth-refresh-rotation",
    status: "Pending",
    creationDate: "2025-09-06",
    additions: 340,
    deletions: 85,
    description: "Enhances authentication security by invalidating old refresh tokens upon reuse."
  }
];

const DEFAULT_SETTINGS = {
  profile: {
    name: "Alexander Wright",
    email: "gitrepo02@gmail.com",
    role: "System Administrator",
    department: "Engineering Ops",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80",
    bio: "Lead Infrastructure & Security Administrator for Git Repository Platform."
  },
  system: {
    maintenanceMode: false,
    publicRegistration: true,
    defaultRepoVisibility: "Public",
    maxUploadSizeMB: 100,
    systemName: "GitCraft Repository Platform"
  },
  security: {
    require2FA: true,
    sessionTimeoutMinutes: 60
  },
  notifications: {
    emailAlertsOnSecurityEvent: true,
    notifyOnNewUserSignup: true
  },
  activeSessions: [
    { id: "SESS-1", ip: "192.168.1.104", device: "Chrome on Windows 11", location: "New York, USA", current: true, lastActive: "Just now" }
  ]
};

function getStoredData(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (err) {
    return fallback;
  }
}

function setStoredData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {}
}

export function initAdminDataStore() {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) setStoredData(STORAGE_KEYS.USERS, SEED_USERS);
  if (!localStorage.getItem(STORAGE_KEYS.REPOS)) setStoredData(STORAGE_KEYS.REPOS, SEED_REPOS);
  if (!localStorage.getItem(STORAGE_KEYS.ISSUES)) setStoredData(STORAGE_KEYS.ISSUES, SEED_ISSUES);
  if (!localStorage.getItem(STORAGE_KEYS.PULL_REQUESTS)) setStoredData(STORAGE_KEYS.PULL_REQUESTS, SEED_PULL_REQUESTS);
  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) setStoredData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

// --- STATS & OVERVIEW DB API ---
export async function fetchAdminStats() {
  const res = await fetch(`${API_BASE_URL}/stats`);
  if (!res.ok) {
    throw new Error(`Admin stats request failed with status ${res.status}`);
  }
  return res.json();
}

// --- USER MANAGEMENT DB API ---
export async function fetchUsersFromDB() {
  try {
    const res = await fetch(`${API_BASE_URL}/users`);
    if (res.ok) {
      const dbUsers = await res.json();
      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        setStoredData(STORAGE_KEYS.USERS, dbUsers);
        return dbUsers;
      }
    }
  } catch (e) {
    console.error("Fetch users from database failed:", e);
  }
  return [];
}

export function getUsers() {
  initAdminDataStore();
  return getStoredData(STORAGE_KEYS.USERS, SEED_USERS);
}

export function saveUser(user) {
  const users = getUsers();
  let updated;
  if (user.id) {
    updated = users.map(u => u.id === user.id ? { ...u, ...user } : u);
  } else {
    const newUser = {
      ...user,
      id: `USR-${Math.floor(1000 + Math.random() * 9000)}`,
      registrationDate: new Date().toISOString().split("T")[0],
      status: user.status || "Active",
      avatar: user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.name}`
    };
    updated = [newUser, ...users];
  }
  setStoredData(STORAGE_KEYS.USERS, updated);
  return updated;
}

export function toggleUserStatus(userId) {
  const users = getUsers();
  const updated = users.map(u => {
    if (u.id === userId) {
      return { ...u, status: u.status === "Active" ? "Suspended" : "Active" };
    }
    return u;
  });
  setStoredData(STORAGE_KEYS.USERS, updated);
  return updated;
}

export function deleteUser(userId) {
  const users = getUsers();
  const updated = users.filter(u => u.id !== userId);
  setStoredData(STORAGE_KEYS.USERS, updated);
  return updated;
}

// --- REPOSITORY MANAGEMENT DB API ---
export async function fetchReposFromDB() {
  try {
    const res = await fetch(`${API_BASE_URL}/repos`);
    if (res.ok) {
      const dbRepos = await res.json();
      if (Array.isArray(dbRepos) && dbRepos.length > 0) {
        setStoredData(STORAGE_KEYS.REPOS, dbRepos);
        return dbRepos;
      }
    }
  } catch (e) {
    console.error("Fetch repositories from database failed:", e);
  }
  return [];
}

export function getRepositories() {
  initAdminDataStore();
  return getStoredData(STORAGE_KEYS.REPOS, SEED_REPOS);
}

export function saveRepository(repo) {
  const repos = getRepositories();
  let updated;
  if (repo.id) {
    updated = repos.map(r => r.id === repo.id ? { ...r, ...repo } : r);
  } else {
    const newRepo = {
      ...repo,
      id: `REPO-${Math.floor(500 + Math.random() * 500)}`,
      contributors: repo.contributors || 1,
      commits: repo.commits || 1,
      creationDate: new Date().toISOString().split("T")[0],
      status: repo.status || "Active"
    };
    updated = [newRepo, ...repos];
    
    // Also post to DB asynchronously
    fetch(`${API_BASE_URL}/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRepo)
    }).catch(() => {});
  }
  setStoredData(STORAGE_KEYS.REPOS, updated);
  return updated;
}

export function deleteRepository(repoId) {
  const repos = getRepositories();
  const updated = repos.filter(r => r.id !== repoId);
  setStoredData(STORAGE_KEYS.REPOS, updated);
  return updated;
}

// --- ISSUE MANAGEMENT DB API ---
export async function fetchIssuesFromDB() {
  try {
    const res = await fetch(`${API_BASE_URL}/issues`);
    if (res.ok) {
      const dbIssues = await res.json();
      if (Array.isArray(dbIssues) && dbIssues.length > 0) {
        setStoredData(STORAGE_KEYS.ISSUES, dbIssues);
        return dbIssues;
      }
    }
  } catch (e) {
    console.error("Fetch issues from database failed:", e);
  }
  return [];
}

export function getIssues() {
  initAdminDataStore();
  return getStoredData(STORAGE_KEYS.ISSUES, SEED_ISSUES);
}

export function updateIssue(issue) {
  const issues = getIssues();
  const updated = issues.map(i => i.id === issue.id ? { ...i, ...issue } : i);
  setStoredData(STORAGE_KEYS.ISSUES, updated);
  return updated;
}

export function deleteIssue(issueId) {
  const issues = getIssues();
  const updated = issues.filter(i => i.id !== issueId);
  setStoredData(STORAGE_KEYS.ISSUES, updated);
  return updated;
}

// --- PULL REQUEST MANAGEMENT DB API ---
export async function fetchPRsFromDB() {
  try {
    const res = await fetch(`${API_BASE_URL}/prs`);
    if (res.ok) {
      const dbPRs = await res.json();
      if (Array.isArray(dbPRs) && dbPRs.length > 0) {
        setStoredData(STORAGE_KEYS.PULL_REQUESTS, dbPRs);
        return dbPRs;
      }
    }
  } catch (e) {
    console.error("Fetch pull requests from database failed:", e);
  }
  return [];
}

export function getPullRequests() {
  initAdminDataStore();
  return getStoredData(STORAGE_KEYS.PULL_REQUESTS, SEED_PULL_REQUESTS);
}

export function updatePRStatus(prId, status, reason = "") {
  const prs = getPullRequests();
  const updated = prs.map(p => {
    if (p.id === prId) {
      return { ...p, status, reviewNotes: reason };
    }
    return p;
  });
  setStoredData(STORAGE_KEYS.PULL_REQUESTS, updated);
  return updated;
}

// --- SETTINGS API ---
export function getAdminSettings() {
  initAdminDataStore();
  return getStoredData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export function updateAdminSettings(section, values) {
  const settings = getAdminSettings();
  const updated = {
    ...settings,
    [section]: {
      ...settings[section],
      ...values
    }
  };
  setStoredData(STORAGE_KEYS.SETTINGS, updated);
  return updated;
}
