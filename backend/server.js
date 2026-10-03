require("dotenv").config();
require("./net-setup").preferIpv4();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dns = require("dns");
const path = require("path");
const { authorizeB2 } = require("./backblaze");

const { createProxyMiddleware } = require("./services/proxyService");

const app = express();

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(cors());
app.use(createProxyMiddleware());

// Serve static assets from frontend build if directory exists
const distPath = path.join(__dirname, "../frontend/dist");
if (require("fs").existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.get("/", (req, res) => {
  res.json({
    message: "Gitrepo API is running",
    status: "ok",
    endpoints: [
      "/api/auth",
      "/api/admin",
      "/api/repos",
      "/api/issues",
      "/api/groups",
      "/api/notifications"
    ]
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

const adminRoutes = require("./routes/admin");
app.use("/api/admin", adminRoutes);

const issueRoutes = require("./routes/issues");
app.use("/api/issues", issueRoutes);

const repoRoutes = require("./routes/repos");
app.use("/api/repos", repoRoutes);

const groupRoutes = require("./routes/groups");
app.use("/api/groups", groupRoutes);

const notificationRoutes = require("./routes/notifications");
app.use("/api/notifications", notificationRoutes);

const deployRoutes = require("./routes/deploy");
app.use("/api/deploy", deployRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// MongoDB Connection
// Some local DNS proxies (VPN clients / firewalls listening on 127.0.0.1) refuse the
// SRV lookups that a mongodb+srv:// connection string needs. When that happens every
// query just hangs until mongoose gives up with "buffering timed out", so fall back
// to public resolvers and try again.
function isDnsError(error) {
  const message = `${error && error.message}`;
  return /querySrv|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message);
}

async function connectMongo() {
  const uri = process.env.MONGO_URI;

  try {
    await mongoose.connect(uri);
  } catch (error) {
    if (!isDnsError(error)) throw error;

    console.warn("MongoDB DNS lookup failed on the system resolver, retrying with public DNS...");
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
    await mongoose.connect(uri);
  }
}

connectMongo()
  .then(() => {
    console.log("MongoDB Atlas connected successfully");
  })
  .catch((error) => {
    console.error("MongoDB connection error on startup:", error.message);
  });

authorizeB2().catch((err) => {
  console.error("❌ Backblaze connection failed:", err.message);
});
