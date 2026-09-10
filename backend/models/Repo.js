const mongoose = require("mongoose");

const repoSchema = new mongoose.Schema(
  {
    repositoryName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
      lowercase: true
    },
    name: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      lowercase: true
    },
    description: { type: String, default: "" },
    visibility: { type: String, default: "public" },
    ignoreGitignore: { type: Boolean, default: false }, // Option to ignore .gitignore
    owner: { type: String, default: "Admin" },
    ownerEmail: { type: String, default: "" },
    status: { type: String, default: "Active" },
    contributors: { type: Number, default: 1 },
    commits: { type: Number, default: 1 },
    stars: { type: Number, default: 0 },
    forks: { type: Number, default: 0 }
  },
  { timestamps: true }
);

repoSchema.pre("save", function(next) {
  if (!this.repositoryName && this.name) {
    this.repositoryName = this.name;
  }

  if (this.repositoryName && !this.name) {
    this.name = this.repositoryName;
  }

  next();
});

// Map model to the explicit database collection named 'repositories'
module.exports = mongoose.model("Repo", repoSchema, "repositories");
