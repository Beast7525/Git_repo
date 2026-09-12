require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dns = require("dns");
const { authorizeB2 } = require("./backblaze");
// Set DNS servers for MongoDB Atlas SRV resolution
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(cors());

app.get("/", (req, res) => {
  res.json({
    message: "Gitrepo API is running",
    status: "ok",
    endpoints: [
      "/api/auth",
      "/api/admin",
      "/api/repos",
      "/api/issues"
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

const PORT = process.env.PORT || 5000;

// MongoDB Connection & Server Start
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Atlas connected successfully");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error on startup:", error);
    process.exit(1);
  });
authorizeB2().catch((err) => {
  console.error("❌ Backblaze connection failed:", err.message);
});
