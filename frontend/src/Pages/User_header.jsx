import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import logo from './assert/logo.png';
import profile from './assert/profile.png';
import Dashboard from './dashboard';
import './style/User.css';
import { auth } from "../firebase";
import { apiFetch } from "../auth/apiFetch";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");

function User_header() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [username] = useState(() => auth.currentUser?.displayName || localStorage.getItem('username') || 'User Name');
  const navigate = useNavigate();

  // Search Bar States
  const [searchQuery, setSearchQuery] = useState("");
  const [repoResults, setRepoResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef(null);

  // Debounced Public Repositories Search Request
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setRepoResults([]);
      setDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setDropdownOpen(true);
      try {
        const q = encodeURIComponent(trimmed);
        const repoRes = await apiFetch(`${API_BASE_URL}/api/repos?search=${q}`).catch(() => null);

        if (repoRes && repoRes.ok) {
          const repoData = await repoRes.json();
          const publicOnly = Array.isArray(repoData)
            ? repoData.filter((r) => !r.visibility || String(r.visibility).trim().toLowerCase() === "public")
            : [];
          setRepoResults(publicOnly);
        } else {
          setRepoResults([]);
        }
      } catch (err) {
        console.error("Header search error:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setDropdownOpen(false);
    if (trimmed.includes("/")) {
      const parts = trimmed.split("/").filter(Boolean);
      if (parts.length >= 2) {
        navigate(`/${parts[0]}/${parts[1]}`);
        return;
      }
    }
    navigate(`/All_Repository?search=${encodeURIComponent(trimmed)}`);
  };

  const handleSelectRepo = (owner, repoName) => {
    setDropdownOpen(false);
    setSearchQuery("");
    navigate(`/${owner}/${repoName}`);
  };

  return (
    <div className="box_user">
      <div className="user-brand">
        <img className="logo" src={logo} alt="Logo" onClick={() => navigate(`/${username}`)} style={{ cursor: "pointer" }} />
        <button
          className="button"
          onClick={() => setShowSidebar(true)}
          title="Open Menu"
        >
          ≣
        </button>
        <span className="header-username" style={{ cursor: "pointer" }} onClick={() => navigate(`/${username}`)}>{username}</span>
      </div>

      {/* Public Repository Search Bar */}
      <div className="header-search-box" ref={searchRef}>
        <form className="header-search-form" onSubmit={handleSearchSubmit}>
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="header-search-input"
              placeholder="Search public repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if (searchQuery.trim()) setDropdownOpen(true); }}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => { setSearchQuery(''); setRepoResults([]); setDropdownOpen(false); }}
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
        </form>

        {/* Live Search Results Dropdown */}
        {dropdownOpen && (
          <div className="search-results-dropdown">
            {loading ? (
              <div className="search-status">Searching public repositories...</div>
            ) : repoResults.length > 0 ? (
              <div className="search-results-list">
                <div className="search-results-header">Public Repositories</div>
                {repoResults.map((r) => (
                  <div
                    key={r._id || `${r.owner}/${r.name}`}
                    className="search-result-item"
                    onClick={() => handleSelectRepo(r.owner, r.name || r.repositoryName)}
                  >
                    <div className="repo-avatar-circle">📁</div>
                    <div className="search-item-info">
                      <div className="search-item-title-row">
                        <span className="search-item-title">{r.owner} / {r.name || r.repositoryName}</span>
                        <span className="search-badge public">Public</span>
                      </div>
                      {r.description && <span className="search-item-sub">{r.description}</span>}
                    </div>
                  </div>
                ))}

                <div className="search-footer-action" onClick={handleSearchSubmit}>
                  View all public repositories matching "{searchQuery}"
                </div>
              </div>
            ) : searchQuery.trim() ? (
              <div className="search-status">No public repositories found matching "{searchQuery}"</div>
            ) : null}
          </div>
        )}
      </div>

      <div className="user_info">
        <div className="details">
          <p onClick={() => navigate(`/${username}`)}>Home</p>
          <p onClick={() => navigate('/teams')}>Teams</p>
          <p onClick={() => navigate('/Stars')}>Stars</p>
          <p onClick={() => navigate('/notifications')}>Notifications</p>
          <p onClick={() => navigate('/Issue')}>Issues</p>
        </div>
      </div>
      <img className="profile-img" src={profile} alt="Profile" onClick={() => navigate('/User_Profile')} />
      {showSidebar && (
        <>
          <div
            className="backdrop"
            onClick={() => setShowSidebar(false)}
          ></div>

          <Dashboard closeSidebar={() => setShowSidebar(false)} />
        </>
      )}
    </div>
  );
}

export default User_header;