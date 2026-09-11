import React from "react";
import { useNavigate } from "react-router-dom";
import User_header from "./User_header";
import "./style/User.css";

function NotFound({ title, message }) {
  const navigate = useNavigate();

  return (
    <main className="app">
      <User_header />
      <div style={{
        maxWidth: "800px",
        margin: "60px auto",
        padding: "40px 24px",
        textAlign: "center",
        background: "rgba(15, 23, 42, 0.7)",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        color: "#ffffff"
      }}>
        <div style={{ fontSize: "4rem", marginBottom: "16px", color: "#f43f5e" }}>404</div>
        <h1 style={{ fontSize: "2rem", marginBottom: "12px" }}>
          {title || "Page Not Found"}
        </h1>
        <p style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "1.1rem", marginBottom: "32px" }}>
          {message || "The page, username, or repository you are looking for does not exist or has been moved."}
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              padding: "12px 24px",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.1)",
              color: "#fff",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            &larr; Go Back
          </button>
          <button
            type="button"
            onClick={() => navigate("/User")}
            style={{
              padding: "12px 24px",
              borderRadius: "8px",
              background: "#6366f1",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            Go to Home
          </button>
        </div>
      </div>
    </main>
  );
}

export default NotFound;
