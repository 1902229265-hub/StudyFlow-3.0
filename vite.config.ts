import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { verifiedMedia } from "./verified-media";
export default defineConfig({
  plugins: [react(), verifiedMedia(process.cwd())],
  server: {
    host: "127.0.0.1",
    port: 5183,
    strictPort: true,
    fs: { strict: true },
  },
  build: { outDir: "dist" },
  cacheDir: ".vite-cache",
});
