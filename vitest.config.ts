import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 60_000,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Keeps ordinary runs offline even when .env holds a model key; SVERKO_LIVE_AI=1 opts in.
    env: process.env["SVERKO_LIVE_AI"] === "1" ? {} : { AI_API_KEY: "", LOVABLE_API_KEY: "" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
