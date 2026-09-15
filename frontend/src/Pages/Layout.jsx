import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import PageLoader from "./PageLoader";
import { useLoading } from "../context/LoadingContext";

function Layout() {
  const { loading, startLoading, stopLoading } = useLoading();
  const location = useLocation();

  useEffect(() => {
    startLoading();
    const timer = setTimeout(() => {
      stopLoading();
    }, 400);

    return () => clearTimeout(timer);
  }, [location.pathname, startLoading, stopLoading]);

  return (
    <>
      {loading && <PageLoader />}
      <Outlet />
    </>
  );
}

export default Layout;