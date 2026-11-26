import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const backend = env.VITE_LARAVEL_PROXY_TARGET || "http://172.17.15.216:8000";
  return {
    plugins: [react()],
    server: {
      proxy: {
        // No rewrite! /api/v1/login must reach Laravel as /api/v1/login.
        "/api/v1": {
          target: backend,
          changeOrigin: true,
        },
        // Institution pictures: profile_image_path is served by Laravel public storage.
        "/storage": {
          target: backend,
          changeOrigin: true,
        },
      },
    },
  };
});
