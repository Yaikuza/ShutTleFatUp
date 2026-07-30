import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/ShutTleFatUp/beta/",
  plugins: [react()],
  build: {
    outDir: "../dist/beta",
    emptyOutDir: true
  }
});
