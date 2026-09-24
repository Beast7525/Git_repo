import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [step, setStep] = useState("email");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const request = async (path, body) => {
    try {
      const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");
      const response = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : { message: "The backend returned an unexpected response. Start the backend server and try again." };

      if (!response.ok) {
        throw new Error(data.message || "Request failed");
      }

      return data;
    } catch (err) {
      setIsError(true);
      setMessage(
        err instanceof TypeError
          ? "Cannot connect to the backend server. Start it with: cd backend && node server.js"
          : err.message,
      );
      return null;
    }
  };

  const handleSendOtp = async () => {
    setMessage("");
    setIsError(false);
    const data = await request("forgot-password", { gmail: email });
    if (data) {
      setStep("otp");
      setMessage("OTP sent successfully. Check your email.");
    }
  };

  const handleVerifyOtp = async () => {
    setMessage("");
    setIsError(false);
    const data = await request("verify-otp", { gmail: email, otp });
    if (data) {
      setResetToken(data.resetToken);
      setStep("password");
      setMessage("OTP verified. Create a new password.");
    }
  };

  const handleResetPassword = async () => {
    setMessage("");
    setIsError(false);
    const data = await request("reset-password", {
      gmail: email,
      resetToken,
      password,
      confirmPassword,
    });
    if (data) {
      setStep("complete");
      const handleNavigate = async () => {
        navigate("/login");
        setMessage("Password reset successfully. You can now log in.");
      };
      await handleNavigate();
    }
  };

  return (
    <div className="container">
      <div className="login-box">
        <h2>Forgot Password</h2>

        {step === "email" && (
          <>
            <p className="step-desc">Enter your email address to receive an OTP</p>
            <input
              type="email"
              placeholder="Email Address"
              className="input-box"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="login-btn" onClick={handleSendOtp}>
              Send OTP
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <p className="step-desc">Enter the 6-digit OTP sent to your email</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength="6"
              placeholder="6-digit OTP"
              className="input-box"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            />
            <button className="login-btn" onClick={handleVerifyOtp}>
              Verify OTP
            </button>
          </>
        )}

        {step === "password" && (
          <>
            <p className="step-desc">Create your new password</p>
            <input
              type="password"
              placeholder="New Password"
              className="input-box"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="Confirm Password"
              className="input-box"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button className="login-btn" onClick={handleResetPassword}>
              Reset Password
            </button>
          </>
        )}

        {message && (
          <p className={isError ? "error-text" : "success-text"}>{message}</p>
        )}

        <p className="switch-text">
          <span className="switch-link" onClick={() => navigate("/login")}>
            ← Back to Login
          </span>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;