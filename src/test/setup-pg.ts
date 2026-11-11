import "@testing-library/jest-dom/vitest";

process.env["SVERKO_TEST_POSTGRES"] = "1";
process.env["ADMIN_EMAIL"] = "";
process.env["ADMIN_PASSWORD"] = "";
process.env["SMTP_HOST"] = "";
process.env["SMTP_PASS"] = "";
process.env["IMAP_HOST"] = "";
process.env["IMAP_PASS"] = "";
process.env["AI_API_KEY"] = "";
process.env["LOVABLE_API_KEY"] = "";

if (!process.env["DATABASE_URL"]?.trim()) {
  throw new Error("PostgreSQL suite needs DATABASE_URL, for example postgres://sverko:sverko@localhost:5432/sverko_test");
}
