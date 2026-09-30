// Temporary check: replay the real team member's access against a live server.
process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || "real-data-check-secret";
require("dotenv").config();
require("./net-setup").preferIpv4();

const dns = require("dns");
const mongoose = require("mongoose");
const Group = require("./models/Group");
const Repo = require("./models/Repo");
const User = require("./models/User");
const repoRoutes = require("./routes/repos");
const { createAuthToken } = require("./middleware/auth");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (e) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
    await mongoose.connect(process.env.MONGO_URI);
  }

  const app = require("express")();
  app.use(require("express").json());
  app.use("/api/repos", repoRoutes);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const team = await Group.findOne({ name: "repo" });
  if (!team) {
    console.log('no team named "repo" found');
    process.exit(0);
  }

  const memberRow = (team.members || []).find((m) => m.status === "accepted" && m.role !== "creator");
  console.log(`\nteam "${team.name}" / member row: ${memberRow.username} <${memberRow.email}> status=${memberRow.status}\n`);

  // What the browser would send, based on what the login page stores.
  const candidates = await User.find({
    $or: [{ username: memberRow.username }, { gmail: memberRow.email }].filter(Boolean)
  });
  console.log(`matching User account(s): ${candidates.map((u) => `${u.username} <${u.gmail}> status=${u.status}`).join(" | ") || "NONE"}`);

  for (const user of candidates) {
    const token = user.status === "Active"
      ? createAuthToken(user._id)
      : null;

    if (!token) {
      console.log(`\n${user.username}: account status is "${user.status}" - a token is NOT issued for suspended accounts, so the app would have no identity at all.`);
    }
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    // 1. The request the repositories page actually makes.
    const params = new URLSearchParams();
    if (user.gmail) params.set("ownerEmail", user.gmail);
    params.set("owner", user.username);
    const list = await (await fetch(`${base}/api/repos?${params.toString()}`, { headers })).json();
    const names = list.map((r) => r.name);
    console.log(`\n${user.username}:`);
    console.log(`  list (?owner=${user.username}) -> ${names.length} repos: ${names.join(", ") || "(none)"}`);
    console.log(`  sees the team repos: ${names.filter((n) => ["my_repo", "my_repo1"].includes(n)).join(", ") || "NO"}`);

    // 2. Opening the shared repo directly.
    for (const repoName of ["my_repo", "my_repo1"]) {
      const repo = await Repo.findOne({ name: repoName });
      if (!repo) continue;
      const res = await fetch(
        `${base}/api/repos/find/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`,
        { headers }
      );
      console.log(`  open "${repoName}" -> HTTP ${res.status}`);
    }
  }

  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
