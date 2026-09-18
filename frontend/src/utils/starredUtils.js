// Utility functions to manage starred repositories per user

export function getStarredRepos() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const key = `starred_repos_${user.gmail || user.email || user.username || "default"}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function isRepoStarred(repoIdOrName) {
  if (!repoIdOrName) return false;
  const starred = getStarredRepos();
  const target = String(repoIdOrName).toLowerCase();
  return starred.some(r => {
    const id = String(r._id || r.id || "").toLowerCase();
    const name = String(r.name || r.repositoryName || "").toLowerCase();
    return id === target || name === target;
  });
}

export function toggleStarRepo(repo) {
  if (!repo) return false;
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const key = `starred_repos_${user.gmail || user.email || user.username || "default"}`;
    let starred = getStarredRepos();
    
    const targetId = String(repo._id || repo.id || "").toLowerCase();
    const targetName = String(repo.name || repo.repositoryName || "").toLowerCase();

    const existingIndex = starred.findIndex(r => {
      const id = String(r._id || r.id || "").toLowerCase();
      const name = String(r.name || r.repositoryName || "").toLowerCase();
      return (targetId && id === targetId) || (targetName && name === targetName);
    });

    let nowStarred = false;
    if (existingIndex >= 0) {
      starred.splice(existingIndex, 1);
      nowStarred = false;
    } else {
      starred.push({
        _id: repo._id || repo.id || `starred-${Date.now()}`,
        id: repo.id || repo._id,
        name: repo.name || repo.repositoryName,
        repositoryName: repo.repositoryName || repo.name,
        owner: repo.owner || repo.ownerEmail || "Developer",
        ownerEmail: repo.ownerEmail || "",
        visibility: repo.visibility || "Public",
        description: repo.description || "",
        commits: repo.commits || 0,
        creationDate: repo.creationDate || (repo.createdAt ? String(repo.createdAt).split('T')[0] : "Recently")
      });
      nowStarred = true;
    }

    localStorage.setItem(key, JSON.stringify(starred));
    return nowStarred;
  } catch (e) {
    console.error("Error toggling starred repo:", e);
    return false;
  }
}
