import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
  server: {
    proxy: {
      // During `npm run dev`, forward API calls to the Express server.
      // The backend binds port 81 (the Cloudflare Quick Tunnel origin).
      "/api": "http://localhost:81",
      "/health": "http://localhost:81",
    },
  },
});
