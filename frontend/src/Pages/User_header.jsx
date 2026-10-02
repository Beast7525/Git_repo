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
  const [searchMode, setSearchMode] = useState("user"); // "user" | "repo"
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef(null);

  // Debounced Search Request
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setDropdownOpen(true);
      try {
        const q = encodeURIComponent(trimmed);
        if (searchMode === "user") {
          const res = await apiFetch(`${API_BASE_URL}/api/auth/search?q=${q}`);
          if (res.ok) {
            const data = await res.json();
            setResults(Array.isArray(data) ? data : []);
          }
        } else {
          const res = await apiFetch(`${API_BASE_URL}/api/repos?search=${q}`);
          if (res.ok) {
            const data = await res.json();
            const publicOnly = Array.isArray(data)
              ? data.filter((r) => !r.visibility || String(r.visibility).trim().toLowerCase() === "public")
              : [];
            setResults(publicOnly);
          }
        }
      } catch (err) {
        console.error("Header search error:", err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, searchMode]);

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
    if (searchMode === "user") {
      navigate(`/${trimmed}`);
    } else {
      navigate(`/All_Repository?search=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleSelectUser = (userTarget) => {
    setDropdownOpen(false);
    setSearchQuery("");
    navigate(`/${userTarget}`);
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

      {/* Header Search Bar */}
      <div className="header-search-box" ref={searchRef}>
        <div className="search-mode-toggle">
          <button
            type="button"
            className={`search-mode-btn ${searchMode === 'user' ? 'active' : ''}`}
            onClick={() => { setSearchMode('user'); setResults([]); setDropdownOpen(false); }}
            title="Search Users"
          >
            <span>👤</span> User
          </button>
          <button
            type="button"
            className={`search-mode-btn ${searchMode === 'repo' ? 'active' : ''}`}
            onClick={() => { setSearchMode('repo'); setResults([]); setDropdownOpen(false); }}
            title="Search Repositories"
          >
            <span>📁</span> Repo
          </button>
        </div>

        <form className="header-search-form" onSubmit={handleSearchSubmit}>
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="header-search-input"
              placeholder={searchMode === 'user' ? "Search users..." : "Search repositories..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { if (searchQuery.trim()) setDropdownOpen(true); }}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => { setSearchQuery(''); setResults([]); setDropdownOpen(false); }}
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>
        </form>

        {/* Live Search Dropdown */}
        {dropdownOpen && (
          <div className="search-results-dropdown">
            {loading ? (
              <div className="search-status">Searching {searchMode === 'user' ? 'users' : 'repositories'}...</div>
            ) : results.length > 0 ? (
              <div className="search-results-list">
                <div className="search-results-header">
                  Matching {searchMode === 'user' ? 'Users' : 'Repositories'}
                </div>
                {searchMode === 'user' ? (
                  results.map((u) => (
                    <div
                      key={u._id || u.username}
                      className="search-result-item"
                      onClick={() => handleSelectUser(u.username)}
                    >
                      <div className="user-avatar-circle">
                        {(u.username || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="search-item-info">
                        <span className="search-item-title">@{u.username}</span>
                        {u.gmail && <span className="search-item-sub">{u.gmail}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  results.map((r) => (
                    <div
                      key={r._id || `${r.owner}/${r.name}`}
                      className="search-result-item"
                      onClick={() => handleSelectRepo(r.owner, r.name || r.repositoryName)}
                    >
                      <div className="repo-avatar-circle">
                        📁
                      </div>
                      <div className="search-item-info">
                        <div className="search-item-title-row">
                          <span className="search-item-title">{r.owner} / {r.name || r.repositoryName}</span>
                          <span className="search-badge public">
                            Public
                          </span>
                        </div>
                        {r.description && <span className="search-item-sub">{r.description}</span>}
                      </div>
                    </div>
                  ))
                )}
                <div className="search-footer-action" onClick={handleSearchSubmit}>
                  View all results for "{searchQuery}"
                </div>
              </div>
            ) : searchQuery.trim() ? (
              <div className="search-status">No matching {searchMode === 'user' ? 'users' : 'repositories'} found</div>
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