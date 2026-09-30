// Temporary diagnostic: report the real state of team/repository sharing.
require("dotenv").config();
require("./net-setup").preferIpv4();

const dns = require("dns");
const mongoose = require("mongoose");
const Group = require("./models/Group");
const Repo = require("./models/Repo");
const User = require("./models/User");
const { isGroupMember } = require("./middleware/auth");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (e) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
    await mongoose.connect(process.env.MONGO_URI);
  }

  const groups = await Group.find({}).populate("repositories", "name repositoryName visibility owner ownerEmail group groupId");
  console.log(`\n=== ${groups.length} group(s) ===`);

  for (const g of groups) {
    console.log(`\n[${g.groupId}] "${g.name}"  creator=${g.creator} <${g.creatorEmail}>`);
    const memberSummary = (g.members || [])
      .map((m) => `${m.username}|${m.email || "-"}|${m.status}|${m.role}`)
      .join("  ,  ");
    console.log(`  members: ${memberSummary || "(none)"}`);
    console.log(`  repositories[]: ${(g.repositories || []).map((r) => (r && r.name) || r).join(", ") || "(none)"}`);

    const memberRows = g.members || [];
    for (const m of memberRows) {
      const user = await User.findOne({
        $or: [{ username: m.username }, { gmail: m.email }].filter(Boolean)
      });
      const verdict = user ? isGroupMember(g, user) : "no matching User record";
      console.log(`    -> ${m.username}: status=${m.status} isGroupMember=${verdict}`);
    }

    for (const r of g.repositories || []) {
      if (!r) continue;
      const real = await Repo.findById(r._id || r);
      if (!real) {
        console.log(`    !! Group.repositories points at a repo that no longer exists: ${r}`);
        continue;
      }
      const objId = String(real.group || "");
      const pointsAtThisGroup = objId === String(g._id);
      const backLinkOk = String(g._id) === objId || real.groupId === g.groupId;
      console.log(
        `    repo "${real.name}" visibility=${real.visibility} group=${objId || "(none)"} ` +
        `groupId=${real.groupId || "(none)"} groupName=${real.groupName || "(none)"} backLink=${backLinkOk}`
      );
      if (real.visibility !== "Team Member") {
        console.log(`       note: visibility is "${real.visibility}", not "Team Member"`);
      }
      if (!pointsAtThisGroup && !backLinkOk) {
        console.log(`       note: Repo does not point back at this group (one-sided link)`);
      }
    }
  }

  const teamRepos = await Repo.find({ $or: [{ visibility: /^team/i }, { group: { $ne: null } }, { groupId: { $nin: ["", null] } }] });
  console.log(`\n=== ${teamRepos.length} repository/repositories with a team association ===`);
  for (const r of teamRepos) {
    const group = r.group ? await Group.findById(r.group).catch(() => null) : null;
    console.log(
      `  "${r.name}" visibility=${r.visibility} owner=${r.owner} <${r.ownerEmail}> ` +
      `group=${r.group || "(none)"} groupName=${r.groupName || "(none)"} resolvedGroup=${group ? `"${group.name}"` : "(unresolved)"}`
    );
    if (!group) console.log(`    !! group reference does not resolve to an existing group`);
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
