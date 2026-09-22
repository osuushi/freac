import { defineConfig } from "vite";
import { sketchBackend } from "./src/backend/dev-plugin.js";
import { fixtureCapture } from "./src/backend/fixture-plugin.js";

export default defineConfig({
  base: "./",
  plugins: [sketchBackend(), fixtureCapture()],
  root: "src/sketch",
  publicDir: "../../assets/public",
  build: { outDir: "../../.build/renderer", emptyOutDir: true },
  server: { host: "127.0.0.1", strictPort: true, port: 5173 },
});
