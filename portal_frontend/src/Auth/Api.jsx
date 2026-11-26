import axios from "axios";

/**
 * SHARED AXIOS INSTANCE
 * Used by: Auth/loginService.jsx and future *Service.jsx files.
 * Vite dev proxy: requests under /api reach Laravel via vite.config.js.
 * If using direct backend URL, configure VITE_API_BASE_URL and backend CORS.
 * Auth mode (cookie vs bearer token) MUST be confirmed by backend team.
 */
const api = axios.create({
  baseURL: 'http://192.168.18.2:8000/api/v1',
  timeout: 15000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  // TODO(BACKEND): For Sanctum session/cookie auth, use these IF needed:
  withCredentials: false,
  withXSRFToken: true,
  // For Bearer token auth, coordinate safe token storage/refresh with backend.
});

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export default api;
