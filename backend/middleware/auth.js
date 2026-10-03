const crypto = require("crypto");
const User = require("../models/User");

const tokenSecret = process.env.AUTH_TOKEN_SECRET || "gitrepo_permanent_fallback_secret_key_2026";
if (process.env.NODE_ENV === "production" && !process.env.AUTH_TOKEN_SECRET) {
  console.warn("AUTH_TOKEN_SECRET is not set; using default fallback secret key.");
}
const tokenLifetimeMs = 7 * 24 * 60 * 60 * 1000;

// The app has stored the same identity under several spellings over time
// ("Alexander Wright", "alexander-wright", "alexanderwright"), so compare them in a
// separator-insensitive way instead of with a literal match.
function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function identityMatchesUser(value, user) {
  const candidate = normalizeIdentity(value);
  if (!candidate || !user) return false;
  return candidate === normalizeIdentity(user.username) ||
    (Boolean(user.gmail) && candidate === normalizeIdentity(user.gmail));
}

function createAuthToken(userId) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId.toString(),
    exp: Date.now() + tokenLifetimeMs,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyAuthToken(token) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra) return null;

  const expected = crypto.createHmac("sha256", tokenSecret).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims.sub && claims.exp > Date.now() ? claims : null;
  } catch {
    return null;
  }
}

async function optionalAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const claims = verifyAuthToken(token);

  if (claims) {
    const user = await User.findById(claims.sub).select("username gmail status netlifyToken");
    if (user && (user.status === "Active" || !user.status)) req.authUser = user;
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.authUser) return res.status(401).json({ message: "Authentication required." });
  next();
}

function normalizeUsername(value) {
  return String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
}

// A user counts as a member of a team only once they have ACCEPTED the invitation.
// Rows still waiting for a decision, and rows they declined, are not membership.
// The team owner always counts, even if their members row is missing.
function isGroupMember(group, user) {
  if (!group || !user) return false;
  if (identityMatchesUser(group.creator, user) || identityMatchesUser(group.creatorEmail, user)) return true;

  return (group.members || []).some(
    (member) => member.status === "accepted" && identityMatchesUser(member.username, user)
  );
}

function isRepoOwner(repo, user) {
  if (!repo || !user) return false;
  const email = String(user.gmail || "").trim().toLowerCase();
  const repoEmail = String(repo.ownerEmail || "").trim().toLowerCase();
  if (repoEmail) return Boolean(email && repoEmail === email);
  return normalizeUsername(repo.owner) === normalizeUsername(user.username) ||
    String(repo.owner || "").trim().toLowerCase() === email;
}

function isPublicRepo(repo) {
  return !repo.visibility || String(repo.visibility).trim().toLowerCase() === "public";
}

module.exports = {
  createAuthToken,
  isGroupMember,
  isPublicRepo,
  isRepoOwner,
  identityMatchesUser,
  normalizeIdentity,
  optionalAuth,
  requireAuth,
  verifyAuthToken,
};