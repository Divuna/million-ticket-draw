const isLovableSandbox = Boolean(process.env.LOVABLE_SANDBOX || process.env.LOVABLE);

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    port: 8080,
    // Stabilize Lovable preview: the proxy can drop the Vite HMR websocket,
    // which causes the client to enter a reload loop. Disable HMR only in
    // the sandbox so the page stays mounted; local dev keeps normal HMR.
    hmr: isLovableSandbox ? false : undefined,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
