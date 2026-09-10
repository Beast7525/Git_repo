const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    author: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true }
);

const issueSchema = new mongoose.Schema(
  {
    number: { type: Number, unique: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    author: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    comments: [commentSchema],
  },
  { timestamps: true }
);

// Pre-save hook to auto-increment the issue number
issueSchema.pre("save", async function (next) {
  if (!this.isNew) return next();
  try {
    const lastIssue = await mongoose.model("Issue").findOne({}, {}, { sort: { number: -1 } });
    this.number = lastIssue && lastIssue.number ? lastIssue.number + 1 : 1;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Issue", issueSchema);
