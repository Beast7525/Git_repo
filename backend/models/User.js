const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },
    gmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, 
    },
    resetOtpHash: String,
    resetOtpExpires: Date,
    resetTokenHash: String,
    resetTokenExpires: Date,
    passwordResetDailyCount: { type: Number, default: 0 },
    passwordResetDailyWindow: { type: Date, default: Date.now },
    passwordResetMonthlyCount: { type: Number, default: 0 },
    passwordResetMonthlyWindow: { type: Date, default: Date.now },
    status: { type: String, enum: ["Active", "Suspended", "Inactive"], default: "Active" },
    suspensionReason: { type: String, default: "" },
    suspendedUntil: { type: Date, default: null },
    suspendedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (passwordInput) {
  return await bcrypt.compare(passwordInput, this.password);
};

module.exports = mongoose.model("User", userSchema);
