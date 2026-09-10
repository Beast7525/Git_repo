import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import PageLoader from "./PageLoader";

function Layout() {
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);

    const timer = setTimeout(() => {
      setLoading(false);        
    }, 2800);

    return () => clearTimeout(timer);
  }, [location]);
          
  return (
    <>
      {loading && <PageLoader />}
      <Outlet />
    </>
  );
}

export default Layout;