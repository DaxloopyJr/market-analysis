/** FILE: src/Auth/RouteAccess.jsx
 * FLOW: App.jsx route guard -> config/permissionService.js -> current user grants; Laravel still enforces data scope.
 */
import { Navigate, useLocation, useOutletContext } from "react-router-dom";
import { canAccessPath } from "../config/permissionService";

/**
 * UI route guard for direct URL navigation. It does NOT replace
 * Laravel middleware / policies or institution scope checks.
 */
export default function RouteAccess({ children }) {
  const { user } = useOutletContext();
  const location = useLocation();

  if (!user || !canAccessPath(user, location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
