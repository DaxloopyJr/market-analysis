/**
 * FILE: src/contexts/AppearanceContext.jsx
 * FLOW: ProtectedRoute /me -> DashboardLayout -> AppearanceProvider(user)
 * -> My Profile (theme only) / Portal Settings System Preferences (admin loaders)
 * -> user-scoped browser localStorage -> CSS tokens.
 * PERMISSION: any authenticated user, OWN browser only. No Laravel API or global admin setting.
 * SAFETY: Never store credentials, and never affect the Login / public Home layout.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const DEFAULT_APPEARANCE = Object.freeze({ theme: "light", accent: "blue", pageLoader: "none", tableLoader: "calm" });
const VALID = {
  theme: ["light", "dark", "auto"],
  accent: ["blue", "green", "teal"],
  pageLoader: ["none", "skeleton", "spinner", "dots", "logo"],
  tableLoader: ["none", "calm", "skeleton", "overlay", "progress", "logo"],
};
const AppearanceContext = createContext(null);

export function normalizeAppearance(raw = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_APPEARANCE).map(([key, fallback]) =>
    [key, VALID[key].includes(raw?.[key]) ? raw[key] : fallback]));
}
function keyForUser(user) {
  const identity = user?.id ?? user?.user_id ?? user?.username ?? user?.email;
  return identity == null || identity === "" ? null : `viwanda.appearance.v1.${String(identity)}`;
}
function readAppearance(key) {
  if (!key) return DEFAULT_APPEARANCE;
  try { return normalizeAppearance(JSON.parse(window.localStorage.getItem(key) || "{}")); }
  catch { return DEFAULT_APPEARANCE; }
}

export function AppearanceProvider({ user, children }) {
  // Only an admin authorized to manage Portal Settings may configure loader choices.
  // They affect this browser/account only (no backend endpoint for global distribution).
  const canManageLoaders = !!user?.permissions?.includes("portal_settings.manage");
  const storageKey = keyForUser(user);
  const [stored, setStored] = useState(() => ({ key: storageKey, value: readAppearance(storageKey) }));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false);
  const rawPreferences = stored.key === storageKey ? stored.value : readAppearance(storageKey);
  const preferences = canManageLoaders ? rawPreferences : {
    ...rawPreferences, pageLoader: DEFAULT_APPEARANCE.pageLoader, tableLoader: DEFAULT_APPEARANCE.tableLoader,
  };

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const update = (event) => setSystemDark(event.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    const update = (event) => {
      if (event.key === storageKey || event.key === null) {
        setStored({ key: storageKey, value: readAppearance(storageKey) });
      }
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [storageKey]);
  const saveAppearance = useCallback((draft) => {
    const normal = normalizeAppearance(draft);
    // A non-admin cannot modify loader preferences through this context or storage.
    const value = canManageLoaders ? normal : {
      ...normal, pageLoader: DEFAULT_APPEARANCE.pageLoader, tableLoader: DEFAULT_APPEARANCE.tableLoader,
    };
    if (!storageKey) throw new Error("Verified user identity is required to save browser preferences.");
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    setStored({ key: storageKey, value });
  }, [storageKey, canManageLoaders]);
  const resetAppearance = useCallback(() => {
    if (storageKey) window.localStorage.removeItem(storageKey);
    setStored({ key: storageKey, value: DEFAULT_APPEARANCE });
  }, [storageKey]);
  const resolvedTheme = preferences.theme === "auto" ? (systemDark ? "dark" : "light") : preferences.theme;
  // Body receives the scoped theme only while the authenticated workspace is mounted;
  // portaled modals and action menus are children of document.body, not dashboard-shell.
  useEffect(() => {
    document.body.dataset.vwTheme = resolvedTheme;
    document.body.dataset.vwAccent = preferences.accent;
    return () => { delete document.body.dataset.vwTheme; delete document.body.dataset.vwAccent; };
  }, [resolvedTheme, preferences.accent]);
  const value = useMemo(() => ({ preferences, resolvedTheme, saveAppearance, resetAppearance, canPersist: !!storageKey, canManageLoaders }),
    [preferences, resolvedTheme, saveAppearance, resetAppearance, storageKey, canManageLoaders]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance requires AppearanceProvider within DashboardLayout.");
  return context;
}
