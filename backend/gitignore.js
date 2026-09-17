// Minimal .gitignore pattern matcher for filtering uploads.

function escapeRegexChar(char) {
  return char.replace(/[.+^${}()|]/g, "\\$&");
}

function globToRegexStr(pattern) {
  let re = "";
  let i = 0;
  const s = pattern;

  while (i < s.length) {
    const c = s[i];

    if (c === "*") {
      if (s[i + 1] === "*") {
        if (s[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else if (c === "[") {
      const close = s.indexOf("]", i + 1);
      if (close === -1) {
        re += "\\[";
        i += 1;
      } else {
        const cls = s.slice(i + 1, close).replace(/\\/g, "\\\\").replace(/\//g, "\\/");
        re += `[${cls}]`;
        i = close + 1;
      }
    } else if (c === "\\") {
      re += `\\${s[i + 1] || ""}`;
      i += 2;
    } else {
      re += escapeRegexChar(c);
      i += 1;
    }
  }

  return re;
}

function parseGitignore(content) {
  const rules = [];
  const lines = String(content || "").replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const rawLine of lines) {
    let line = rawLine.replace(/\s+$/, "");

    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("\\#")) line = line.slice(1);
    if (line.startsWith("\\!")) line = line.slice(1);

    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    if (!line) continue;

    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }

    let anchored = false;
    if (line.startsWith("/")) {
      anchored = true;
      line = line.slice(1);
    }

    if (!line) continue;

    const baseNameOnly = !anchored && !line.includes("/");
    rules.push({
      line,
      negated,
      dirOnly,
      anchored,
      baseNameOnly,
      regex: new RegExp(`^${globToRegexStr(line)}$`)
    });
  }

  return rules;
}

const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".env",
  ".env.local",
  ".ds_store",
  "dist",
  "build",
  "coverage",
  "*.log"
];

function isGitignoreFile(relPath) {
  const norm = normalizeRelPath(relPath).toLowerCase();
  return norm === ".gitignore" || norm.endsWith("/.gitignore");
}

function patternMatches(rule, relPath) {
  const normPath = relPath.toLowerCase();
  const normLine = rule.line.toLowerCase();
  const segments = normPath.split("/");
  const basename = segments[segments.length - 1];

  if (rule.baseNameOnly || rule.dirOnly) {
    if (segments.some((segment) => rule.regex.test(segment) || segment === normLine)) {
      return true;
    }
  }

  if (normPath === normLine || normPath.startsWith(`${normLine}/`)) {
    return true;
  }

  if (rule.baseNameOnly) {
    return rule.regex.test(basename);
  }

  return rule.regex.test(normPath);
}

// Returns true when relPath should be excluded (last matching rule wins,
// `!` rules re-include).
function isIgnored(relPath, customRules = []) {
  const normPath = normalizeRelPath(relPath);
  if (!normPath) return false;

  // Always exclude .gitignore files themselves
  if (isGitignoreFile(normPath)) return true;

  // Combine default ignore rules with custom .gitignore rules
  const defaultRules = parseGitignore(DEFAULT_IGNORE_PATTERNS.join("\n"));
  const allRules = [...defaultRules, ...(Array.isArray(customRules) ? customRules : [])];

  let ignored = false;
  for (const rule of allRules) {
    if (patternMatches(rule, normPath)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function normalizeRelPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

module.exports = {
  parseGitignore,
  isIgnored,
  isGitignoreFile,
  normalizeRelPath
};