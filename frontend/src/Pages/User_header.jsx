import React, { useState } from "react"
import { useNavigate } from 'react-router-dom'
import logo from './assert/logo.png'
import profile from './assert/profile.png'
import Dashboard from './dashboard'
import User_profile from './User_Profile'
import Stars  from "./Stars"
import './style/User.css'
import Issue from "./Issue"
import { auth } from "../firebase"
function User_header(){
    const [showSidebar, setShowSidebar] = useState(false);
  const [username] = useState(() => auth.currentUser?.displayName || localStorage.getItem('username') || 'User Name');
    const navigate = useNavigate();
    return(
<div className="box_user">
        <div className="user-brand">
          <img className="logo" src={logo} alt="Logo" />
          <button
            className="button"
            onClick={() => setShowSidebar(true)}
          >
            ≣
          </button>
            <span className="header-username" style={{ cursor: "pointer" }} onClick={() => navigate(`/${username}`)}>{username}</span>
        </div>
        <div className="user_info">
          <div className="details">
            <p onClick={() => navigate(`/${username}`)}>Home</p>
            <p onClick={()=> navigate('/teams')}>Teams</p>
            <p onClick={()=> navigate('/Stars')}>Stars</p>
            <p onClick={()=> navigate('/Issue')}>Issues</p>
            <p>Pull Requests</p>
            
          </div>
        </div><img className="profile-img" src={profile} alt="Profile" onClick={() => navigate('/User_Profile')} />
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
      
    )
}
export default User_header