// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { handleApi } from "@/server/http";
import { htmlToText, letterText, setInboxForTests } from "@/server/inbox";
import { run } from "@/server/store";

async function adminCookie(): Promise<string> {
  process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-inbox-"));
  process.env["SMTP_HOST"] = "";
  process.env["SMTP_PASS"] = "";
  process.env["IMAP_PASS"] = "";
  await closeDb();
  const response = await handleApi(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "password123" }),
    }),
  );
  await run("UPDATE users SET role = 'admin' WHERE email = ?", ["admin@example.com"]);
  const token = /sverko_auth=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];
  if (!token) throw new Error("нет cookie");
  return `sverko_auth=${token}`;
}

describe("inbox", () => {
  afterEach(async () => {
    setInboxForTests(null);
    process.env["SMTP_PASS"] = "";
    process.env["IMAP_PASS"] = "";
    await closeDb();
  });

  it("turns html mail into text and drops scripts", async () => {
    expect(htmlToText("<p>Hello</p><script>alert(1)</script>")).toBe("Hello");
    const parsed = await letterText(
      Buffer.from(
        "From: Ann <ann@example.com>\r\nTo: noreply@sverko.ru\r\nSubject: Hi\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello</p><script>alert(1)</script>",
      ),
    );
    expect(parsed.text).toBe("Hello");
    expect(parsed.text).not.toContain("alert");
  });

  it("shows the mailbox only to an administrator", async () => {
    const cookie = await adminCookie();
    const guest = await handleApi(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "password123" }),
      }),
    );
    const guestCookie = `sverko_auth=${/sverko_auth=([^;]+)/.exec(guest.headers.get("set-cookie") ?? "")?.[1]}`;
    setInboxForTests({
      async list() {
        return {
          configured: true,
          mailbox: "noreply@sverko.ru",
          unseen: 1,
          messages: [
            {
              uid: 7,
              from: "Ann <ann@example.com>",
              subject: "Hello",
              date: "2026-11-11T09:00:00.000Z",
              seen: false,
            },
          ],
        };
      },
      async read(uid) {
        if (uid !== 7) return null;
        return {
          uid,
          from: "Ann <ann@example.com>",
          to: "noreply@sverko.ru",
          subject: "Hello",
          date: "2026-11-11T09:00:00.000Z",
          seen: true,
          text: "Body",
          attachments: ["a.pdf"],
          tooLarge: false,
        };
      },
    });

    expect(
      (
        await handleApi(
          new Request("http://localhost/api/admin/inbox", { headers: { cookie: guestCookie } }),
        )
      ).status,
    ).toBe(403);
    const list = await handleApi(
      new Request("http://localhost/api/admin/inbox", { headers: { cookie } }),
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      configured: true,
      mailbox: "noreply@sverko.ru",
      unseen: 1,
    });

    const letter = await handleApi(
      new Request("http://localhost/api/admin/inbox/7", { headers: { cookie } }),
    );
    expect(await letter.json()).toMatchObject({ text: "Body", attachments: ["a.pdf"] });
    expect(
      (
        await handleApi(
          new Request("http://localhost/api/admin/inbox/nope", { headers: { cookie } }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await handleApi(new Request("http://localhost/api/admin/inbox/9", { headers: { cookie } })))
        .status,
    ).toBe(404);
  });

  it("reports a mailbox that is not configured", async () => {
    const cookie = await adminCookie();
    const response = await handleApi(
      new Request("http://localhost/api/admin/inbox", { headers: { cookie } }),
    );
    expect(await response.json()).toEqual({
      configured: false,
      mailbox: "",
      unseen: 0,
      messages: [],
    });
  });
});
