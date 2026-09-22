import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import User_header from "./User_header";
import "./style/Teams.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:5000")
).replace(/\/+$/, "");

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle"); // "idle", "success", "error"
  const [message, setMessage] = useState("");
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No invitation token provided in the URL.");
      return;
    }
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setLoading(true);
    setStatus("idle");
    setMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/groups/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "Invitation accepted successfully!");
        if (data.groupName) setGroupName(data.groupName);
      } else {
        setStatus("error");
        setMessage(data.message || "Failed to verify invitation token.");
      }
    } catch (err) {
      console.error("Accept invitation error:", err);
      setStatus("error");
      setMessage("Connection error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="teams-page-layout">
      <User_header />
      <div
        style={{
          minHeight: "80vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px"
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            background: "#0d1711",
            border: "1px solid rgba(167, 221, 166, 0.25)",
            borderRadius: "16px",
            padding: "36px 30px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            textAlign: "center"
          }}
        >
          {status === "success" ? (
            <>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.2)",
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  fontSize: "2rem"
                }}
              >
                ✓
              </div>
              <h2 style={{ color: "#ffffff", margin: "0 0 8px" }}>Invitation Accepted!</h2>
              {groupName && (
                <p style={{ color: "#a7dda6", fontWeight: "600", fontSize: "1.1rem", margin: "0 0 16px" }}>
                  You are now an active member of "{groupName}"
                </p>
              )}
              <p style={{ color: "#9eafa3", fontSize: "0.9rem", marginBottom: "24px" }}>
                {message}
              </p>
              <button
                className="btn-create-team"
                style={{ width: "100%", padding: "12px" }}
                onClick={() => navigate("/teams")}
              >
                Go to My Teams Workspace
              </button>
            </>
          ) : (
            <>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "rgba(167, 221, 166, 0.15)",
                  color: "#a7dda6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  fontSize: "1.8rem"
                }}
              >
                ✉️
              </div>
              <h2 style={{ color: "#ffffff", margin: "0 0 8px" }}>Team Group Invitation</h2>
              <p style={{ color: "#9eafa3", fontSize: "0.9rem", marginBottom: "24px" }}>
                You have been invited to join a team group on Gitrepo. Click below to accept and verify your membership.
              </p>

              {status === "error" && (
                <div
                  style={{
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid #ef4444",
                    color: "#f87171",
                    padding: "12px",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    marginBottom: "20px"
                  }}
                >
                  {message}
                </div>
              )}

              <button
                className="btn-create-team"
                style={{ width: "100%", padding: "12px", marginBottom: "12px" }}
                onClick={handleAccept}
                disabled={loading || !token}
              >
                {loading ? "Verifying..." : "Accept Invitation"}
              </button>

              <Link to="/teams" style={{ color: "#748779", fontSize: "0.85rem", textDecoration: "none" }}>
                Return to Teams
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
