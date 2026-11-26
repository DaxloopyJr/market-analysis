/** FILE: src/Auth/ProtectedRoute.jsx
 * FLOW: App.jsx protected route -> API/auth.jsx -> API/login.jsx -> API/axios.jsx -> Laravel /me; token cache in utils.
 */
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getDashboardUser } from "../API/auth";
import { clearAuthSession, hasAuthSession } from "../utils/tokenService";
import { clearVerifiedUser, getVerifiedUser } from "../utils/verifiedUserStore";

function initialAuthState() {
  const user = getVerifiedUser();
  if (user) return { status: "verified", user };
  return { status: hasAuthSession() ? "checking" : "signed-out", user: null };
}

/**
 * One authorization gate for the whole Dashboard.
 * On successful login the /me verified user is already cached, so navigating
 * from Login does NOT render a second spinner, text loader or fetch /me again.
 * On browser refresh, silently verify the stored Sanctum token before rendering.
 */
export default function ProtectedRoute() {
  const location = useLocation();
  const [auth, setAuth] = useState(initialAuthState);

  useEffect(() => {
    if (auth.status !== "checking") return;
    let active = true;

    getDashboardUser()
      .then((user) => {
        if (!active) return;
        setAuth({ status: "verified", user });
      })
      .catch(() => {
        if (!active) return;
        clearVerifiedUser();
        clearAuthSession();
        setAuth({ status: "signed-out", user: null });
      });

    return () => { active = false; };
  }, [auth.status]);

  // No visible loader before authorization. The coat-of-arms transition is
  // shown ONLY by Login after /login, /me and dashboard.view all succeed.
  if (auth.status === "checking") {
    return <span className="visually-hidden" role="status">Checking authorization</span>;
  }
  if (auth.status !== "verified") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet context={{ user: auth.user }} />;
}
