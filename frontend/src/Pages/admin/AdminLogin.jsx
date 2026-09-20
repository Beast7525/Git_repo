import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { isAdminCredentials } from "../../auth/adminAuth.js";
import { useLoading } from "../../context/LoadingContext";
import "./Admin.css";

export default function AdminLogin() {
  const [email, setEmail] = useState("gitrepo02@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { startLoading, stopLoading, loading } = useLoading();

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      startLoading();

      const API_BASE_URL = (
        import.meta.env.VITE_API_URL ||
        (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
          ? window.location.origin
          : "http://localhost:5000")
      ).replace(/\/+$/, "");

      const res = await fetch(`${API_BASE_URL}/api/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("username", data.user.username);
        localStorage.setItem("userId", data.user.id);
        navigate("/admin");
        return;
      }

      if (isAdminCredentials(email, password)) {
        const adminUser = {
          id: "admin-1",
          username: "Admin",
          name: "System Administrator",
          gmail: email.trim().toLowerCase(),
          role: "admin",
        };

        localStorage.setItem("user", JSON.stringify(adminUser));
        localStorage.setItem("username", adminUser.username);
        localStorage.setItem("userId", adminUser.id);
        navigate("/admin");
        return;
      }

      setError("Invalid admin email or password. Access denied.");
    } catch (err) {
      if (isAdminCredentials(email, password)) {
        const adminUser = {
          id: "admin-1",
          username: "Admin",
          name: "System Administrator",
          gmail: email.trim().toLowerCase(),
          role: "admin",
        };

        localStorage.setItem("user", JSON.stringify(adminUser));
        localStorage.setItem("username", adminUser.username);
        localStorage.setItem("userId", adminUser.id);
        navigate("/admin");
      } else {
        setError("Login error: " + err.message);
      }
    } finally {
      stopLoading();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at top, #1e293b 0%, #0f172a 100%)",
        color: "#f8fafc",
        padding: "20px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(30, 41, 59, 0.75)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "16px",
          padding: "36px 32px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
          textAlign: "center"
        }}
      >
        {/* Shield / Lock Icon */}
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)"
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>

        <h1 style={{ fontSize: "1.6rem", fontWeight: "700", marginBottom: "6px", color: "#ffffff" }}>
          GitRepo Admin Portal
        </h1>
        <p style={{ fontSize: "0.88rem", color: "#94a3b8", marginBottom: "28px" }}>
          Secure administrative sign-in
        </p>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid #ef4444",
              color: "#f87171",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: "600",
              marginBottom: "20px",
              textAlign: "left"
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleAdminLogin} style={{ textAlign: "left" }}>
          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
              Admin Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="gitrepo02@gmail.com"
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "8px",
                color: "#ffffff",
                fontSize: "0.95rem",
                outline: "none"
              }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "0.82rem", fontWeight: "600", color: "#cbd5e1", marginBottom: "6px" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "12px 40px 12px 14px",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "8px",
                  color: "#ffffff",
                  fontSize: "0.95rem",
                  outline: "none"
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  padding: 0
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "0.95rem",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
              transition: "all 0.2s ease"
            }}
          >
            {loading ? "Authenticating..." : "Sign In to Admin Dashboard"}
          </button>
        </form>

        <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid rgba(255, 255, 255, 0.1)", fontSize: "0.85rem", color: "#94a3b8" }}>
          <span>Regular developer user? </span>
          <Link to="/login" style={{ color: "#60a5fa", textDecoration: "none", fontWeight: "600" }}>
            User Login
          </Link>
        </div>
      </div>
    </div>
  );
}
