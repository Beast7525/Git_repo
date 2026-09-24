import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { isAdminCredentials } from "../auth/adminAuth.js";
import { useLoading } from "../context/LoadingContext";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");
const API_URL = `${API_BASE_URL}/api/auth`;

function Login() {
  const [isLogin, setIsLogin] = useState(true);

  // Form inputs
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const navigate = useNavigate();
  const { startLoading, stopLoading, loading } = useLoading();

  const toggleMode = (targetLogin) => {
    setIsLogin(targetLogin);
    setError("");
    setSuccess("");
  };

  // =========================
  // LOGIN HANDLER
  // =========================
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    try {
      startLoading();
      setError("");
      setSuccess("");

      if (isAdminCredentials(loginEmail, loginPassword)) {
        const adminUser = {
          id: "admin-1",
          username: "Admin",
          gmail: loginEmail,
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail: loginEmail, password: loginPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Login failed");
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("username", data.user.username);
      localStorage.setItem("userId", data.user.id);

      const userSlug = (data.user.username || "").trim().replace(/\s+/g, "-").toLowerCase();
      navigate(`/${userSlug}`);
    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      stopLoading();
    }
  };

  // =========================
  // REGISTER HANDLER
  // =========================
  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    if (!regUsername || !regEmail || !regPassword || !regConfirmPassword) {
      setError("Please fill all fields");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      startLoading();
      setError("");
      setSuccess("");

      const response = await fetch(`${API_URL}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: regUsername,
          gmail: regEmail,
          password: regPassword,
          confirmPassword: regConfirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Registration failed");
        return;
      }

      setRegUsername("");
      setRegEmail("");
      setRegPassword("");
      setRegConfirmPassword("");

      setIsLogin(true);
      setSuccess("Registration successful! Please login.");
    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      stopLoading();
    }
  };

  return (
    <div className="container">
      <div className="glass-3d-perspective">
        <div className={`glass-card-3d ${isLogin ? "show-login" : "show-register"}`}>
          
          {/* FRONT FACE: LOGIN */}
          <div className="glass-face glass-front login-box">
            <h2>Login</h2>

            <form onSubmit={handleLogin}>
              <input
                type="email"
                placeholder="Email Address"
                className="input-box"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />

              <input
                type="password"
                placeholder="Password"
                className="input-box"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />

              <div className="forgot-container">
                <a href="/ForgotPassword" className="forgot-link">
                  Forgot Password?
                </a>
              </div>

              {error && isLogin && <p className="error-text">{error}</p>}
              {success && isLogin && <p className="success-text">{success}</p>}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>

            <p className="switch-text">
              Don't have an account?{" "}
              <span className="switch-link" onClick={() => toggleMode(false)}>
                Register
              </span>
            </p>
          </div>

          {/* BACK FACE: REGISTER */}
          <div className="glass-face glass-back login-box">
            <h2>Register</h2>

            <form onSubmit={handleRegister}>
              <input
                type="text"
                placeholder="Username"
                pattern="[A-Z][A-Z0-9_]{2,19}*"
                className="input-box"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value.toUpperCase())}
                required
              />

              <input
                type="email"
                placeholder="Email Address"
                className="input-box"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />

              <input
                type="password"
                placeholder="Password"
                className="input-box"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
              />

              <input
                type="password"
                placeholder="Confirm Password"
                className="input-box"
                value={regConfirmPassword}
                onChange={(e) => setRegConfirmPassword(e.target.value)}
                required
              />

              {error && !isLogin && <p className="error-text">{error}</p>}
              {success && !isLogin && <p className="success-text">{success}</p>}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Registering..." : "Register"}
              </button>
            </form>

            <p className="switch-text">
              Already have an account?{" "}
              <span className="switch-link" onClick={() => toggleMode(true)}>
                Login
              </span>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

export default Login;