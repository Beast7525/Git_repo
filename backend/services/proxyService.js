const http = require("http");

const activeRoutes = new Map(); // projectName / subdomain -> { hostPort, deploymentId }

function registerProxyRoute(subdomain, hostPort, deploymentId) {
  activeRoutes.set(subdomain.toLowerCase(), { hostPort: Number(hostPort), deploymentId });
  console.log(`[ReverseProxy] Registered route: ${subdomain} -> http://127.0.0.1:${hostPort}`);
}

function unregisterProxyRoute(subdomain) {
  if (subdomain) {
    activeRoutes.delete(subdomain.toLowerCase());
    console.log(`[ReverseProxy] Unregistered route: ${subdomain}`);
  }
}

function generateSubdomain(repoName, existingSubdomains = []) {
  const sanitized = String(repoName || "api")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "my-api";

  const domainBase = process.env.DEPLOYMENT_DOMAIN || "gitrepo.app";
  let candidate = `${sanitized}.${domainBase}`;

  if (!existingSubdomains.includes(candidate) && !activeRoutes.has(candidate)) {
    return candidate;
  }

  const uniqueId = Math.random().toString(36).substring(2, 7);
  return `${sanitized}-${uniqueId}.${domainBase}`;
}

// Middleware to proxy incoming subdomain/path requests to target container hostPort
function createProxyMiddleware() {
  return (req, res, next) => {
    const hostHeader = req.get("host") || "";
    const cleanHost = hostHeader.split(":")[0].toLowerCase();
    
    // Check path prefix routing as fallback: /_deploy/:projectName/...
    let routeInfo = null;
    let targetPath = req.url;

    if (req.url.startsWith("/_deploy/")) {
      const parts = req.url.split("/");
      const projectName = parts[2];
      if (projectName && activeRoutes.has(projectName.toLowerCase())) {
        routeInfo = activeRoutes.get(projectName.toLowerCase());
        targetPath = "/" + parts.slice(3).join("/");
      }
    }

    if (!routeInfo && activeRoutes.has(cleanHost)) {
      routeInfo = activeRoutes.get(cleanHost);
    }

    if (!routeInfo) {
      return next();
    }

    const { hostPort } = routeInfo;

    const proxyReq = http.request(
      {
        host: "127.0.0.1",
        port: hostPort,
        path: targetPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: hostHeader,
          "x-forwarded-for": req.ip || req.socket.remoteAddress,
          "x-forwarded-proto": req.protocol || "http",
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on("error", (err) => {
      console.error(`[ReverseProxy Error] ${cleanHost} -> 127.0.0.1:${hostPort}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          message: "Deployment Unavailable: Container application failed to respond.",
          error: err.message,
        });
      }
    });

    req.pipe(proxyReq, { end: true });
  };
}

module.exports = {
  registerProxyRoute,
  unregisterProxyRoute,
  generateSubdomain,
  createProxyMiddleware,
};
