import { createContext, useCallback, useContext, useMemo } from "react";
import { showPortalToast, dismissPortalToast } from "../../utils/portalAlerts";
import "./Toast.css";

/**
 * Global VIWANDA notifications, displayed by SweetAlert2 at top-right.
 * API compatibility: showToast({type,title,message,duration}) works on every
 * page, with aliases attention => warning and details => info.
 * Confirmation / destructive actions remain interactive SweetAlert2 dialogs.
 * Only show Save success after an actual successful Laravel response/read-back.
 */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const showToast = useCallback((options = {}) => showPortalToast(options), []);
  const dismissToast = useCallback(() => dismissPortalToast(), []);
  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
