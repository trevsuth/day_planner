import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/docs": "http://127.0.0.1:8000",
      "/openapi.json": "http://127.0.0.1:8000",
      "/api": "http://127.0.0.1:8000",
      "/graph": "http://127.0.0.1:8000",
      "/viewer": "http://127.0.0.1:8000",
    },
  },
});
