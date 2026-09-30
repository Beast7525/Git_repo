import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
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
  const errorFromLink = searchParams.get("status") === "error" ? searchParams.get("message") || "" : "";

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle"); // "idle" | "accepted" | "declined" | "error"
  const [message, setMessage] = useState(errorFromLink);
  const [groupName, setGroupName] = useState("");
  const [groupId, setGroupId] = useState("");

  useEffect(() => {
    if (errorFromLink) {
      setStatus("error");
      setMessage(errorFromLink);
      return;
    }

    if (!token) {
      setStatus("error");
      setMessage("No verification token provided in the URL.");
    }
  }, [token, errorFromLink]);

  async function respond(decision) {
    if (!token) return;
    setLoading(true);
    setStatus("idle");
    setMessage("");

    try {
      const endpoint = decision === "accept" ? "accept-invite" : "decline-invite";
      const res = await fetch(`${API_BASE_URL}/api/groups/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(decision === "accept" ? "accepted" : "declined");
        setMessage(data.message || (decision === "accept" ? "Verification accepted." : "Verification rejected."));
        if (data.groupName) setGroupName(data.groupName);
        if (data.groupId) setGroupId(data.groupId);
      } else {
        setStatus("error");
        setMessage(data.message || "Failed to verify this invitation link.");
      }
    } catch (err) {
      console.error("Team verification error:", err);
      setStatus("error");
      setMessage("Connection error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  const teamPageLink = (
    <Link to={groupId ? `/teams/${groupId}` : "/teams"} className="btn-invite-primary">
      Go to My Team Page
    </Link>
  );

  return (
    <main className="teams-page-layout">
      <User_header />
      <div className="invite-response-wrap">
        <div className="invite-response-card">
          {status === "accepted" && (
            <>
              <div className="invite-response-icon accepted">✓</div>
              <h2>Verification Accepted</h2>
              {groupName && <p className="invite-response-group">You are now a member of "{groupName}"</p>}
              <p className="invite-response-text">{message}</p>
              {teamPageLink}
            </>
          )}

          {status === "declined" && (
            <>
              <div className="invite-response-icon declined">✕</div>
              <h2>Verification Rejected</h2>
              {groupName && <p className="invite-response-group">You did not join "{groupName}"</p>}
              <p className="invite-response-text">{message}</p>
              <Link to="/teams" className="btn-invite-secondary">
                Back to Teams
              </Link>
            </>
          )}

          {status === "idle" && (
            <>
              <div className="invite-response-icon pending">✉️</div>
              <h2>Team Verification Request</h2>
              <p className="invite-response-text">
                A team owner added you to a team on Gitrepo. Confirm the request to finish joining.
              </p>

              <div className="invite-response-actions">
                <button
                  type="button"
                  className="btn-invite-primary"
                  onClick={() => respond("accept")}
                  disabled={loading || !token}
                >
                  {loading ? "Processing..." : "ACCEPT"}
                </button>
                <button
                  type="button"
                  className="btn-invite-secondary"
                  onClick={() => respond("decline")}
                  disabled={loading || !token}
                >
                  REJECT
                </button>
              </div>

              <small className="invite-response-hint">
                ACCEPT verifies your membership and takes you to your team page. REJECT keeps you out of the team.
              </small>
            </>
          )}

          {status === "error" && (
            <>
              <div className="invite-response-icon pending">⚠️</div>
              <h2>Verification Link Unavailable</h2>
              <div className="invite-response-error">{message}</div>
              <Link to="/teams" className="btn-invite-secondary">
                Back to Teams
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
