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

adminAccountSchema.statics.findOrInitialize = async function (initialPassword) {
  let admin = await this.findById("primary").select("+password");
  if (admin) return admin;

  const expectedEmail = (process.env.ADMIN_EMAIL || "gitrepo02@gmail.com").trim().toLowerCase();
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin12345";
  if (initialPassword !== expectedPassword) return null;

  try {
    await this.create({
      _id: "primary",
      name: "System Administrator",
      email: expectedEmail,
      password: expectedPassword,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  return this.findById("primary").select("+password");
};

module.exports = mongoose.model("AdminAccount", adminAccountSchema);
