import { Navigate, Outlet, useLocation } from "react-router-dom";

function hasSignedInUser() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return Boolean(
      user && (user.id || user._id) && (user.username || user.gmail || user.email) &&
      (user.role === "admin" || localStorage.getItem("authToken"))
    );
  } catch {
    return false;
  }
}

function RequireAuth() {
  const location = useLocation();

  if (!hasSignedInUser()) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }

  return <Outlet />;
}

export default RequireAuth;