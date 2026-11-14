import "@testing-library/jest-dom/vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

process.env["DATABASE_URL"] = "";
process.env["ADMIN_EMAIL"] = "";
process.env["ADMIN_PASSWORD"] = "";
process.env["SMTP_HOST"] = "";
process.env["SMTP_PASS"] = "";
process.env["IMAP_HOST"] = "";
process.env["IMAP_PASS"] = "";
if (process.env["SVERKO_LIVE_AI"] !== "1") {
  process.env["AI_API_KEY"] = "";
  process.env["POLZA_API_KEY"] = "";
}

const pythonCandidates = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
const python = pythonCandidates.find((command) => spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0);
if (python) {
  process.env["SVERKO_PRIVACY_PYTHON"] = python;
  process.env["SVERKO_PRIVACY_BRIDGE"] = path.resolve("scripts/privacy/stub_bridge.py");
}

if (typeof window !== "undefined") Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

if (typeof window !== "undefined") Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
