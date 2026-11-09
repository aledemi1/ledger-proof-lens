import "@testing-library/jest-dom/vitest";

process.env["DATABASE_URL"] = "";
process.env["ADMIN_EMAIL"] = "";
process.env["ADMIN_PASSWORD"] = "";
process.env["SMTP_HOST"] = "";
process.env["SMTP_PASS"] = "";
if (process.env["SVERKO_LIVE_AI"] !== "1") process.env["AI_API_KEY"] = "";

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
