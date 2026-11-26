import axios from "axios";
import { clearAuthSession, getAccessToken } from "../Auth/tokenService";

// /api/v1 + /login -> /api/v1/login (Vite forwards to backend IP).
// Alternatively VITE_API_BASE_URL may be the full http://IP:PORT/api/v1 URL
// if Laravel CORS is configured to permit direct cross-origin requests.
const baseURL = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/+$/, "");

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Development-only trace. NEVER print request body, Authorization or tokens.
  if (import.meta.env.DEV) {
    console.debug(`[VIWANDA API] ${config.method?.toUpperCase()} ${api.getUri(config)}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (import.meta.env.DEV) {
      const method = error.config?.method?.toUpperCase() || "REQUEST";
      const url = error.config ? api.getUri(error.config) : "unknown URL";
      console.error(`[VIWANDA API ERROR] ${method} ${url} | HTTP ${error.response?.status ?? "NO RESPONSE"}`);
    }
    if (error.response?.status === 401) clearAuthSession();
    return Promise.reject(error);
  }
);

export default api;
