import "./style/dashboard.css";
import { useNavigate } from "react-router-dom";
import User_profile  from "./User_Profile";
import User from "./User";
import Issue from "./Issue"
import Home from "./Home"
import All_Repository from "./All_Repository"
 
function Dashboard({ closeSidebar }) {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const username = localStorage.getItem("username") || currentUser.username || "";
  const userPath = username ? `/${username}` : "/User";

  return (
    <div className="sidebar">
      <button className="close-btn" onClick={closeSidebar}>
        ✕
      </button>

      <h3>Dashboard</h3>

      <div className="box">
        <p onClick={() => { navigate(userPath); closeSidebar(); }}>Home</p>
        <p onClick={() => { navigate('/Issue'); closeSidebar(); }}>All Issues</p>
        <p>All Pull Requests</p>
        <p onClick={() => { navigate('/All_Repository'); closeSidebar(); }}>All Repositories</p>
        <p>Team Member</p>
        <p onClick={() => { navigate('/User_Profile'); closeSidebar(); }}>Profile</p>
        <p onClick={() => { navigate('/'); closeSidebar(); }}>logout</p>
      </div>
    </div>
  );
}

export default Dashboard;