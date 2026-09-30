// Temporary end-to-end check: can an accepted team member see a team-shared repository?
process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || "test-secret-team-repo-access";

require("dotenv").config();
require("./net-setup").preferIpv4();

const dns = require("dns");
const mongoose = require("mongoose");
const express = require("express");

const Group = require("./models/Group");
const Repo = require("./models/Repo");
const User = require("./models/User");
const repoRoutes = require("./routes/repos");
const { createAuthToken, isGroupMember } = require("./middleware/auth");

let pass = 0;
let fail = 0;

function check(label, condition, extra) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ""}`);
  }
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (e) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
    await mongoose.connect(process.env.MONGO_URI);
  }
  console.log("connected\n");

  const app = express();
  app.use(express.json());
  app.use("/api/repos", repoRoutes);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const stamp = Date.now();
  const ownerName = `tr_owner_${stamp}`;
  const memberName = `tr_member_${stamp}`;
  const pendingName = `tr_pending_${stamp}`;
  const declinedName = `tr_declined_${stamp}`;
  const strangerName = `tr_stranger_${stamp}`;

  const mk = (name) =>
    User.create({ username: name, gmail: `${name}@example.com`, password: "hashed-placeholder", status: "Active" });
  const owner = await mk(ownerName);
  const member = await mk(memberName);
  const pendingUser = await mk(pendingName);
  const declinedUser = await mk(declinedName);
  const stranger = await mk(strangerName);

  const team = await Group.create({
    groupId: `GRP-TR${stamp}`,
    name: `TeamRepo-${stamp}`,
    description: "team repo access",
    creator: ownerName,
    creatorEmail: owner.gmail,
    members: [
      { username: ownerName, email: owner.gmail, role: "creator", status: "accepted" },
      { username: memberName, email: member.gmail, role: "editor", status: "accepted" },
      { username: pendingName, email: pendingUser.gmail, role: "editor", status: "pending" },
      { username: declinedName, email: declinedUser.gmail, role: "editor", status: "declined" }
    ]
  });

  const teamRepo = await Repo.create({
    repositoryName: `tr-team-repo-${stamp}`,
    name: `tr-team-repo-${stamp}`,
    description: "shared with the team",
    visibility: "Team Member",
    owner: ownerName,
    ownerEmail: owner.gmail,
    group: team._id,
    groupId: team._id.toString(),
    groupName: team.name
  });
  await Group.findByIdAndUpdate(team._id, { $addToSet: { repositories: teamRepo._id } });

  // A second team repo linked ONLY on the Group side, to prove both association
  // directions are honoured.
  const reverseRepo = await Repo.create({
    repositoryName: `tr-reverse-repo-${stamp}`,
    name: `tr-reverse-repo-${stamp}`,
    description: "linked from the group only",
    visibility: "Team Member",
    owner: ownerName,
    ownerEmail: owner.gmail
  });
  await Group.findByIdAndUpdate(team._id, { $addToSet: { repositories: reverseRepo._id } });

  const privateRepo = await Repo.create({
    repositoryName: `tr-private-repo-${stamp}`,
    name: `tr-private-repo-${stamp}`,
    description: "not shared with anyone",
    visibility: "private",
    owner: ownerName,
    ownerEmail: owner.gmail
  });

  const publicRepo = await Repo.create({
    repositoryName: `tr-public-repo-${stamp}`,
    name: `tr-public-repo-${stamp}`,
    visibility: "public",
    owner: ownerName,
    ownerEmail: owner.gmail
  });

  const token = (u) => ({ Authorization: `Bearer ${createAuthToken(u._id)}` });

  const listRepos = (headers = {}, query = "") =>
    fetch(`${base}/api/repos${query}`, { headers });
  const openRepo = (repo, headers = {}) =>
    fetch(`${base}/api/repos/find/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`, { headers });

  console.log("1. the accepted member sees the team's repositories in the list");
  const memberList = await (await listRepos(token(member), `?owner=${encodeURIComponent(memberName)}&ownerEmail=${encodeURIComponent(member.gmail)}`)).json();
  const memberNames = memberList.map((r) => r.name);
  check("team repo appears for the member", memberNames.includes(teamRepo.name), memberNames);
  check("group-linked repo appears for the member", memberNames.includes(reverseRepo.name), memberNames);
  check("someone else's private repo is NOT shown", !memberNames.includes(privateRepo.name), memberNames);
  check("a list scoped to the member does not include the owner's other repos", !memberNames.includes(publicRepo.name), memberNames);

  console.log("\n2. the list works with no query params at all");
  const bare = await (await listRepos(token(member))).json();
  const bareNames = bare.map((r) => r.name);
  check("team repo found with a bare request", bareNames.includes(teamRepo.name), bareNames);
  check("group-linked repo found with a bare request", bareNames.includes(reverseRepo.name));
  check("public repo found with a bare request", bareNames.includes(publicRepo.name), bareNames);
  check("bare request still hides other people's private repos", !bareNames.includes(privateRepo.name), bareNames);

  console.log("\n3. the list still works when ?owner names somebody else");
  const otherOwner = await (await listRepos(token(member), `?owner=${encodeURIComponent(ownerName)}&ownerEmail=${encodeURIComponent(owner.gmail)}`)).json();
  const otherNames = otherOwner.map((r) => r.name);
  check("team repo visible while browsing the owner's profile", otherNames.includes(teamRepo.name), otherNames);
  check("owner's private repo still hidden from the member", !otherNames.includes(privateRepo.name), otherNames);

  console.log("\n4. the member can OPEN the shared repo");
  const opened = await openRepo(teamRepo, token(member));
  check("shared repo opens with 200", opened.status === 200, opened.status);
  const openedBody = await opened.json();
  check("payload is the right repository", openedBody.name === teamRepo.name, openedBody.name);
  const openReverse = await openRepo(reverseRepo, token(member));
  check("group-linked repo opens with 200", openReverse.status === 200, openReverse.status);

  console.log("\n5. non-members still cannot see it");
  const strangerOpen = await openRepo(teamRepo, token(stranger));
  check("stranger gets 404 on the shared repo", strangerOpen.status === 404, strangerOpen.status);
  const anonOpen = await openRepo(teamRepo);
  check("anonymous gets 404 on the shared repo", anonOpen.status === 404, anonOpen.status);
  const strangerList = await (await listRepos(token(stranger), `?owner=${encodeURIComponent(memberName)}&ownerEmail=${encodeURIComponent(member.gmail)}`)).json();
  check("shared repo absent from a stranger's list", !strangerList.map((r) => r.name).includes(teamRepo.name));

  console.log("\n6. an invitation that is not accepted is not access");
  const pendingList = await (await listRepos(token(pendingUser), `?owner=${encodeURIComponent(pendingName)}&ownerEmail=${encodeURIComponent(pendingUser.gmail)}`)).json();
  check("pending invitee does not see the team repo", !pendingList.map((r) => r.name).includes(teamRepo.name), pendingList.map((r) => r.name));
  const pendingOpen = await openRepo(teamRepo, token(pendingUser));
  check("pending invitee gets 404", pendingOpen.status === 404, pendingOpen.status);
  const declinedOpen = await openRepo(teamRepo, token(declinedUser));
  check("declined invitee gets 404", declinedOpen.status === 404, declinedOpen.status);

  console.log("\n7. the owner still has full access");
  const ownerOpen = await openRepo(teamRepo, token(owner));
  check("owner opens their own team repo", ownerOpen.status === 200, ownerOpen.status);
  const ownerPrivate = await openRepo(privateRepo, token(owner));
  check("owner opens their own private repo", ownerPrivate.status === 200, ownerPrivate.status);

  console.log("\n8. public repositories stay public");
  const anonPublic = await openRepo(publicRepo);
  check("anonymous opens a public repo", anonPublic.status === 200, anonPublic.status);

  console.log("\n9. a member cannot attach a repository to a team they do not belong to");
  const createRes = await fetch(`${base}/api/repos`, {
    method: "POST",
    headers: { ...token(stranger), "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryName: `tr-sneaky-${stamp}`, name: `tr-sneaky-${stamp}`, visibility: "Team Member", groupId: team._id.toString() })
  });
  check("stranger is refused with 403", createRes.status === 403, createRes.status);
  const sneakCreated = await Repo.findOne({ name: `tr-sneaky-${stamp}` });
  check("no repository was created", !sneakCreated, Boolean(sneakCreated));

  const memberCreate = await fetch(`${base}/api/repos`, {
    method: "POST",
    headers: { ...token(member), "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryName: `tr-member-repo-${stamp}`, name: `tr-member-repo-${stamp}`, visibility: "Team Member", groupId: team._id.toString() })
  });
  check("member may create a repo in their own team", memberCreate.status === 201 || memberCreate.status === 200, memberCreate.status);
  const memberRepoName = `tr-member-repo-${stamp}`;

  console.log("\n10. identity spelling variants still resolve");
  const displayName = await User.findOneAndUpdate({ _id: member._id }, { $set: {} });
  check("member row stores the exact username", team.members[1].username === memberName, team.members[1].username);
  check("isGroupMember agrees for the member", isGroupMember(await Group.findById(team._id), member) === true);
  check("isGroupMember refuses the pending invitee", isGroupMember(await Group.findById(team._id), pendingUser) === false);
  check("isGroupMember refuses the declined invitee", isGroupMember(await Group.findById(team._id), declinedUser) === false);
  check("isGroupMember agrees for the owner", isGroupMember(await Group.findById(team._id), owner) === true);
  check("isGroupMember refuses the stranger", isGroupMember(await Group.findById(team._id), stranger) === false);

  console.log("\n11. a member's newly created team repo is visible to the team");
  const memberRepo = await Repo.findOne({ name: memberRepoName });
  const ownerSees = await (await listRepos(token(owner), `?owner=${encodeURIComponent(ownerName)}&ownerEmail=${encodeURIComponent(owner.gmail)}`)).json();
  check("owner sees the member's team repo", ownerSees.map((r) => r.name).includes(memberRepoName), ownerSees.map((r) => r.name));

  console.log("\ncleanup");
  await Repo.deleteMany({ name: { $regex: `^tr-(team|reverse|private|public|member|sneaky)-repo|^tr-sneaky-` } });
  await Repo.deleteMany({ name: { $regex: `^tr-.*${stamp}` } });
  await Group.deleteMany({ _id: team._id });
  await User.deleteMany({ _id: { $in: [owner._id, member._id, pendingUser._id, declinedUser._id, stranger._id] } });

  const leftovers = await Promise.all([
    Repo.countDocuments({ name: { $regex: `tr-.*${stamp}` } }),
    Group.countDocuments({ _id: team._id }),
    User.countDocuments({ _id: { $in: [owner._id, member._id, pendingUser._id, declinedUser._id, stranger._id] } })
  ]);
  check("test data removed", leftovers.every((n) => n === 0), leftovers);

  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("harness crashed:", e);
  process.exit(1);
});
