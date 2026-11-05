import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// Ausgabe von scripts/build-wasm.sh; fehlt sie, wird ein Platzhalter eingebunden
const wasmPkg = fileURLToPath(new URL("./src/wasm/pkg/life_engine_wasm.js", import.meta.url));
const wasmStub = fileURLToPath(new URL("./src/wasm/stub.ts", import.meta.url));

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Web-Build mit relativen Pfaden -> funktioniert unter https://<user>.github.io/<repo>/
  base: mode === "web" ? "./" : "/",
  resolve: {
    alias: { "life-engine-wasm": existsSync(wasmPkg) ? wasmPkg : wasmStub },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**", "**/engine/**", "**/engine-wasm/**", "**/target/**"] },
  },
  build: {
    target: "es2021",
  },
}));
