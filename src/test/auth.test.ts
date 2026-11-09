// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { handleApi } from "@/server/http";
import { setMailSenderForTests } from "@/server/mail";
import { run } from "@/server/store";

async function register(email: string): Promise<string> {
  const response = await handleApi(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    }),
  );
  expect(response.status).toBe(201);
  const token = /sverko_auth=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];
  if (!token) throw new Error("нет cookie");
  return `sverko_auth=${token}`;
}

describe("accounts", () => {
  afterEach(async () => {
    await closeDb();
  });

  it("keeps a user's audits private and lets an admin see every account", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-auth-"));
    await closeDb();
    const user = await register("user@example.com");
    const outsider = await register("other@example.com");
    const denied = await handleApi(new Request("http://localhost/api/admin/users", { headers: { cookie: user } }));
    expect(denied.status).toBe(403);

    await run("UPDATE users SET role = 'admin' WHERE email = ?", ["user@example.com"]);
    const users = await handleApi(new Request("http://localhost/api/admin/users", { headers: { cookie: user } }));
    expect(users.status).toBe(200);
    const list = (await users.json()) as { email: string; role: string }[];
    expect(list.map((item) => item.email).sort()).toEqual(["other@example.com", "user@example.com"]);

    const me = (await (await handleApi(new Request("http://localhost/api/auth/me", { headers: { cookie: outsider } }))).json()) as { id: string };
    await run(
      "INSERT INTO sessions (id, owner, idempotency_key, title, created_at, status, stage) VALUES ('aud_private', ?, 'auth-1', 'Чужая', ?, 'in_review', 'done')",
      [me.id, new Date().toISOString()],
    );
    const stranger = await register("stranger@example.com");
    const ownList = (await (await handleApi(new Request("http://localhost/api/audits", { headers: { cookie: outsider } }))).json()) as { id: string }[];
    const hidden = (await (await handleApi(new Request("http://localhost/api/audits", { headers: { cookie: stranger } }))).json()) as { id: string }[];
    const adminList = (await (await handleApi(new Request("http://localhost/api/audits", { headers: { cookie: user } }))).json()) as { title: string }[];
    expect(ownList.map((item) => item.id)).toEqual(["aud_private"]);
    expect(hidden).toEqual([]);
    expect(adminList.map((item) => item.title)).toEqual(["Чужая"]);

    const demote = await handleApi(
      new Request("http://localhost/api/admin/users/missing", {
        method: "PATCH",
        headers: { cookie: user, "content-type": "application/json" },
        body: JSON.stringify({ role: "user" }),
      }),
    );
    expect(demote.status).toBe(404);
  });

  it("sends a confirmation link and signs in only after it is opened", async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-mail-"));
    process.env["SMTP_HOST"] = "smtp.timeweb.ru";
    process.env["SMTP_PORT"] = "465";
    process.env["SMTP_SECURE"] = "true";
    let body = "";
    setMailSenderForTests(async (message) => {
      body = message.text;
    });
    await closeDb();
    try {
      const created = await handleApi(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "new@example.com", password: "password123" }),
        }),
      );
      expect(created.status).toBe(202);
      expect(created.headers.get("set-cookie")).toBeNull();
      const blocked = await handleApi(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "new@example.com", password: "password123" }),
        }),
      );
      expect(blocked.status).toBe(403);
      const token = /token=([^\s]+)/.exec(body)?.[1];
      if (!token) throw new Error("в письме нет ссылки");
      const verified = await handleApi(
        new Request("http://localhost/api/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: decodeURIComponent(token) }),
        }),
      );
      expect(verified.status).toBe(200);
      expect(verified.headers.get("set-cookie")).toContain("sverko_auth=");
      const again = await handleApi(
        new Request("http://localhost/api/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: decodeURIComponent(token) }),
        }),
      );
      expect(again.status).toBe(400);
    } finally {
      delete process.env["SMTP_HOST"];
      delete process.env["SMTP_PORT"];
      delete process.env["SMTP_SECURE"];
      setMailSenderForTests(null);
    }
  });
});
