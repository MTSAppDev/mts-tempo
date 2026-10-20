import { defineConfig } from "vite";

const apiTarget =
  process.env.API_PROXY_TARGET || "http://127.0.0.1:4000";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});