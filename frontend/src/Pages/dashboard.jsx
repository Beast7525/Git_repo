import "./style/dashboard.css";
import { useNavigate } from "react-router-dom";
import User_profile  from "./User_Profile";
import User from "./User";
import Issue from "./Issue"
import Home from "./Home"
 
function Dashboard({ closeSidebar }) {
  const navigate = useNavigate();
  return (
    <div className="sidebar">
      <button className="close-btn" onClick={closeSidebar}>
        ✕
      </button>

      <h3>Dashboard</h3>

      <div className="box">
        <p onClick={() => { navigate('/User'); closeSidebar(); }}>Home</p>
        <p onClick={() => { navigate('/Issue'); closeSidebar(); }}>All Issues</p>
        <p>All Pull Requests</p>
        <p>All Repositories</p>
        <p>Team Member</p>
        <p onClick={() => { navigate('/User_Profile'); closeSidebar(); }}>Profile</p>
        <p onClick={() => { navigate('/'); closeSidebar(); }}>logout</p>
      </div>
    </div>
  );
}

export default Dashboard;