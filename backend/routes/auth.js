const express = require("express");
const User = require("../models/User");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const router = express.Router();

const hashValue = (value) => crypto.createHash("sha256").update(value).digest("hex");
const DAILY_RESET_LIMIT = 3;
const MONTHLY_RESET_LIMIT = 20;
const mailUser = process.env.MAIL_USER;
const mailPassword = process.env.MAIL_PASSWORD || process.env.MAIL_PASS;

const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: mailUser,
    pass: mailPassword,
  },
});

const sendOtpEmail = async (gmail, otp) => {
  await mailTransport.sendMail({
    from: `Gitrepo <${mailUser}>`,
    to: gmail,
    subject: "Your Gitrepo password reset OTP",
    text: `Your Gitrepo password reset OTP is ${otp}. It expires in 10 minutes.`,
  });
};

const getUtcWindow = (date, monthly = false) => {
  const window = new Date(date);
  if (monthly) {
    window.setUTCDate(1);
  }
  window.setUTCHours(0, 0, 0, 0);
  return window;
};

// Signup Route
router.post("/signup", async (req, res) => {
  try {
    const { username, gmail, password, confirmPassword } = req.body;

    // Validation
    if (!username || !gmail || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { gmail }],
    });

    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ message: "Username already taken" });
      }
      if (existingUser.gmail === gmail) {
        return res.status(400).json({ message: "Email already registered" });
      }
    }

    // Create new user
    const newUser = new User({ username, gmail, password });
    await newUser.save();

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser._id,
        username: newUser.username,
        gmail: newUser.gmail,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { gmail, password } = req.body;

    // Validation
    if (!gmail || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // Find user and include password field
    const user = await User.findOne({ gmail }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Compare password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        gmail: user.gmail,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

// Send a one-time password to an existing user's email.
router.post("/forgot-password", async (req, res) => {
  try {
    const gmail = req.body.gmail || req.body.email;

    if (!gmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedGmail = gmail.trim().toLowerCase();
    const user = await User.findOne({ gmail: normalizedGmail });

    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    if (!mailUser || !mailPassword) {
      return res.status(500).json({ message: "Email service is not configured. Set MAIL_USER and MAIL_PASSWORD in backend/.env using a Gmail app password." });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    user.resetOtpHash = hashValue(otp);
    user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    try {
      await sendOtpEmail(normalizedGmail, otp);
    } catch (mailError) {
      console.error("OTP email error:", mailError);
      user.resetOtpHash = undefined;
      user.resetOtpExpires = undefined;
      try {
        await user.save();
      } catch (cleanupError) {
        console.error("OTP cleanup error:", cleanupError);
      }
      return res.status(502).json({
        message: "OTP email could not be sent. Check the Gmail app password in backend/.env",
      });
    }

    res.json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Unable to send OTP" });
  }
});

// Verify the OTP and issue a short-lived reset token.
router.post("/verify-otp", async (req, res) => {
  try {
    const { gmail, otp } = req.body;

    if (!gmail || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({
      gmail: gmail.trim().toLowerCase(),
      resetOtpHash: hashValue(otp.trim()),
      resetOtpExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetOtpHash = undefined;
    user.resetOtpExpires = undefined;
    user.resetTokenHash = hashValue(resetToken);
    user.resetTokenExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    res.json({ message: "OTP verified", resetToken });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ message: "Unable to verify OTP" });
  }
});

// Set a new password using the token issued after OTP verification.
router.post("/reset-password", async (req, res) => {
  try {
    const { gmail, resetToken, password, confirmPassword } = req.body;

    if (!gmail || !resetToken || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({
      gmail: gmail.trim().toLowerCase(),
      resetTokenHash: hashValue(resetToken),
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset session" });
    }

    const now = new Date();
    const currentDailyWindow = getUtcWindow(now);
    const currentMonthlyWindow = getUtcWindow(now, true);
    const dailyWindow = user.passwordResetDailyWindow || currentDailyWindow;
    const monthlyWindow = user.passwordResetMonthlyWindow || currentMonthlyWindow;
    const dailyCount = getUtcWindow(dailyWindow).getTime() === currentDailyWindow.getTime()
      ? user.passwordResetDailyCount || 0
      : 0;
    const monthlyCount = getUtcWindow(monthlyWindow, true).getTime() === currentMonthlyWindow.getTime()
      ? user.passwordResetMonthlyCount || 0
      : 0;

    if (dailyCount >= DAILY_RESET_LIMIT) {
      return res.status(429).json({ message: "Password reset limit reached. You can reset your password at most 3 times per day." });
    }

    if (monthlyCount >= MONTHLY_RESET_LIMIT) {
      return res.status(429).json({ message: "Password reset limit reached. You can reset your password at most 20 times per month." });
    }

    user.password = password;
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.passwordResetDailyCount = dailyCount + 1;
    user.passwordResetDailyWindow = currentDailyWindow;
    user.passwordResetMonthlyCount = monthlyCount + 1;
    user.passwordResetMonthlyWindow = currentMonthlyWindow;
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Unable to reset password" });
  }
});

// Google Login/Signup Route
router.post("/google", async (req, res) => {
  try {
    const { username: displayName, gmail, uid } = req.body;

    if (!gmail || !uid) {
      return res.status(400).json({ message: "Gmail and UID are required" });
    }

    // Check if user already exists by gmail
    let user = await User.findOne({ gmail });

    if (!user) {
      // Create a unique username
      let baseUsername = displayName ? displayName.replace(/\s+/g, "_").toLowerCase() : gmail.split("@")[0];
      let uniqueUsername = baseUsername;
      let usernameExists = await User.findOne({ username: uniqueUsername });

      while (usernameExists) {
        uniqueUsername = `${baseUsername}_${Math.floor(Math.random() * 10000)}`;
        usernameExists = await User.findOne({ username: uniqueUsername });
      }

      // Generate a secure, random dummy password for the schema requirement
      const dummyPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);

      user = new User({
        username: uniqueUsername,
        gmail,
        password: dummyPassword,
      });

      await user.save();
    }

    res.status(200).json({
      message: "Google login successful",
      user: {
        id: user._id,
        username: user.username,
        gmail: user.gmail,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

// GET /api/auth/user/:username - Get user profile details by username
router.get("/user/:username", async (req, res) => {
  try {
    const rawParam = req.params.username.trim();
    const flexiblePattern = rawParam.replace(/[\s-_]+/g, "[\\s-_]?");
    const regex = new RegExp(`^${flexiblePattern}$`, "i");

    const user = await User.findOne({
      $or: [
        { username: regex },
        { gmail: regex }
      ]
    }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        gmail: user.gmail,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Server error: " + error.message });
  }
});

module.exports = router;
