import { Outlet } from "react-router-dom";
import PageLoader from "./PageLoader";
import { useLoading } from "../context/LoadingContext";

function Layout() {
  const { loading } = useLoading();

  return (
    <>
      {loading && <PageLoader />}
      <Outlet />
    </>
  );
}

export default Layout;