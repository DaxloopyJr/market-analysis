/** FILE: src/API/axios.jsx
 * FLOW: src/API/{login,auth,passwordReset,...}.jsx -> axios.jsx -> Laravel /api/v1
 * TOKEN: src/utils/tokenService.js; request/response interceptors unchanged from REV26.
 */
import axios from "axios";
import { clearAuthSession, getAccessToken } from "../utils/tokenService";
import { invalidate } from "../services/listCache.js";

// /api/v1 + /login -> /api/v1/login (Vite forwards to backend IP).
// Alternatively VITE_API_BASE_URL may be the full http://IP:PORT/api/v1 URL
// if Laravel CORS is configured to permit direct cross-origin requests.
const baseURL = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/+$/, "");

import { busyOnRequest, busyOnResponse, installBusyButtons } from "../utils/busyButtons.js";
import { markApiUse, rememberSignOutReason } from "../utils/sessionClock.js";
import {networkEnd, networkStart} from "../utils/networkActivity.js";

installBusyButtons();

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  networkStart(config); // flag progress line on the topbar stripe (utils/networkActivity.js)
  markApiUse(); // FR-051: Laravel counts idle time from the last request (utils/sessionClock.js)
  busyOnRequest(config); // spinner on the button that started a write (utils/busyButtons.js)
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Development-only trace. NEVER print request body, Authorization or tokens.
  if (import.meta.env.DEV) {
    console.debug(`[VIWANDA API] ${config.method?.toUpperCase()} ${api.getUri(config)}`);
  }
  return config;
});

/* A successful write makes cached lists of that resource stale (services/listCache.js):
 * POST /submissions/14/review -> clears every "submissions:" entry. */
const resourceOf = (url = "") => String(url).replace(/^https?:\/\/[^/]+/, "").replace(/^\/?api\/v1/, "").split("?")[0].split("/").filter(Boolean)[0] || "";
api.interceptors.response.use(
  (response) => {
    busyOnResponse(response.config);
    networkEnd(response.config);
    const method = String(response.config?.method || "get").toLowerCase();
    if (method !== "get") { const res = resourceOf(response.config?.url); invalidate(res ? `${res}:` : ""); if (res === "submissions") invalidate("analytics:"); }
    return response;
  },
  (error) => {
    busyOnResponse(error.config);
    networkEnd(error.config);
    if (import.meta.env.DEV) {
      const method = error.config?.method?.toUpperCase() || "REQUEST";
      const url = error.config ? api.getUri(error.config) : "unknown URL";
      console.error(`[VIWANDA API ERROR] ${method} ${url} | HTTP ${error.response?.status ?? "NO RESPONSE"}`);
    }
    if (error.response?.status === 401) {
      clearAuthSession();
      // FR-051: Laravel ended an idle session (e.g. the computer slept): go to sign-in and say why.
      if (error.response?.data?.code === "session_idle" && !window.location.pathname.startsWith("/login")) {
        rememberSignOutReason("idle");
        window.location.replace("/login");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
