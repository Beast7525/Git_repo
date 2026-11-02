const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminAccountSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "primary" },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email address."],
    },
    password: { type: String, required: true, select: false },
    bio: { type: String, default: "" },
  },
  { timestamps: true }
);

adminAccountSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

adminAccountSchema.methods.comparePassword = function (passwordInput) {
  return bcrypt.compare(passwordInput, this.password);
};

module.exports = mongoose.model("AdminAccount", adminAccountSchema);
