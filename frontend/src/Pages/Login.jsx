import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import ForgotPassword from "./ForgotPassword";
import { isAdminCredentials } from "../auth/adminAuth";
import { useLoading } from "../context/LoadingContext";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");
const API_URL = `${API_BASE_URL}/api/auth`;

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { startLoading, stopLoading, loading } = useLoading();

  // =========================
  // LOGIN
  // =========================
  const handleLogin = async () => {
    try {
      startLoading();
      setError("");

      if (isAdminCredentials(email, password)) {
        const adminUser = {
          id: "admin-1",
          username: "Admin",
          gmail: email,
          role: "admin",
        };

        localStorage.setItem("user", JSON.stringify(adminUser));
        localStorage.setItem("username", adminUser.username);
        localStorage.setItem("userId", adminUser.id);
        navigate("/admin");
        return;
      }

      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gmail: email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Login failed");
        return;
      }

      // Save complete user details
      localStorage.setItem("user", JSON.stringify(data.user));

      // Save username and user ID separately
      localStorage.setItem("username", data.user.username);
      localStorage.setItem("userId", data.user.id);

      // Go to User Dashboard with clean dynamic username URL
      const userSlug = (data.user.username || "").trim().replace(/\s+/g, "-").toLowerCase();
      navigate(`/${userSlug}`);

    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      stopLoading();
    }
  };

  // =========================
  // REGISTER
  // =========================
  const handleRegister = async () => {
    if (!username || !email || !password || !confirmPassword) {
      setError("Please fill all fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      startLoading();
      setError("");

      const response = await fetch(`${API_URL}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          gmail: email,
          password,
          confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Registration failed");
        return;
      }

      // Clear form
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");

      // Go to Login
      setIsLogin(true);
      setError("Registration successful! Please login.");

    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      stopLoading();
    }
  };

  return (
    <div className="container">
      <div className="login-box">

        <h2>{isLogin ? "Login" : "Register"}</h2>

        {/* Username - Register only */}
        {!isLogin && (
          <input
            type="text"
            placeholder="Username"
            pattern="[A-Z][A-Z0-9_]{2,19}*"
            className="input-box"
            value={username}
            onChange={(e) => setUsername(e.target.value.toUpperCase())}
          />
        )}

        {/* Email */}
        <input
          type="email"
          placeholder="Email Address"
          className="input-box"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {/* Password */}
        <input
          type="password"
          placeholder="Password"
          className="input-box"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />{isLogin && <a href="/ForgotPassword"> Forgot Password?</a>}
        {/* Confirm Password - Register only */}
        {!isLogin && (
          <input
            type="password"
            placeholder="Confirm Password"
            className="input-box"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        )}

        {/* Error / Success message */}
        {error && (
          <p
            style={{
              color: error.includes("successful") ? "green" : "red",
              marginBottom: "10px",
            }}
          >
            {error}
          </p>
        )}

        <button
          className="login-btn"
          disabled={loading}
          onClick={isLogin ? handleLogin : handleRegister}
        >
          {loading ? (isLogin ? "Logging in..." : "Registering...") : (isLogin ? "Login" : "Register")}
        </button>

        {/* Switch Login / Register */}
        <p className="switch-text">
          {isLogin
            ? "Don't have an account?"
            : "Already have an account?"}

          <span
            style={{
              cursor: "pointer",
              color: "blue",
            }}
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
              setUsername("");
              setEmail("");
              setPassword("");
              setConfirmPassword("");
            }}
          >
            {isLogin ? " Register" : " Login"}
          </span>
        </p>

      </div>
    </div>
  );
}

export default Login;