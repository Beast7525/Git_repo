import { Routes, Route } from "react-router-dom";
import Home from "./Pages/Home";
import Login from "./Pages/Login";
import User from "./Pages/User";
import User_profile from "./Pages/User_Profile";
import dashboard from "./Pages/dashboard";
import User_header from "./Pages/User_header";
import Stars from "./Pages/Stars";
import Issue from "./Pages/Issue";
import All_Repository from "./Pages/All_Repository";
import Layout from "./Pages/Layout";
import ForgotPassword from "./Pages/ForgotPassword";
import Repository from "./Pages/Repostiory";
import Teams from "./Pages/Teams";
import AdminDashboard from "./Pages/admin/AdminDashboard";
import AdminLogin from "./Pages/admin/AdminLogin";
import Profile from "./Pages/Profile";
import RepoDetail from "./Pages/RepoDetail";
import NotFound from "./Pages/NotFound";
function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/User" element={<User />} />
        <Route path="/User_Profile" element={<User_profile />} />
        <Route path="/dashboard" element={<dashboard />} />
        <Route path="/User_header" element={<User_header />} />
        <Route path="/Stars" element={<Stars />} />
        <Route path="/Issue" element={<Issue />} />
        <Route path="/ForgotPassword" element={<ForgotPassword />} />
        <Route path="/Repository" element={<Repository />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/All_Repository" element={<All_Repository />} />

        {/* Dynamic Username and Repository Routes */}
        <Route path="/:username" element={<Profile />} />
        <Route path="/:username/:repoName" element={<RepoDetail />} />

        {/* 404 Not Found Fallback */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;