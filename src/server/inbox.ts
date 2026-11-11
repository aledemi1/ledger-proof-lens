import { ImapFlow, type FetchMessageObject, type MessageAddressObject } from "imapflow";
import { simpleParser } from "mailparser";

const MAX_SOURCE_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 100_000;
const LIST_LIMIT = 50;

export class InboxError extends Error {
  code: "not_configured" | "unavailable";

  constructor(code: "not_configured" | "unavailable") {
    super(code === "not_configured" ? "Почта не настроена" : "Не удалось открыть почтовый ящик");
    this.name = "InboxError";
    this.code = code;
  }
}

export interface InboxMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

export interface InboxList {
  configured: boolean;
  mailbox: string;
  unseen: number;
  messages: InboxMessage[];
}

export interface InboxLetter extends InboxMessage {
  to: string;
  text: string;
  attachments: string[];
  tooLarge: boolean;
}

interface InboxBackend {
  list: () => Promise<InboxList>;
  read: (uid: number) => Promise<InboxLetter | null>;
}

let testBackend: InboxBackend | null = null;

/** Подмена ящика в тестах. Боевой IMAP при этом не вызывается. */
export function setInboxForTests(backend: InboxBackend | null): void {
  testBackend = backend;
}

export function inboxConfigured(): boolean {
  return imapSettings() != null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function letterText(source: Buffer): Promise<{ text: string; attachments: string[] }> {
  const parsed = await simpleParser(source);
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const text = (html ? htmlToText(html) : parsed.text || "").trim().slice(0, MAX_TEXT_CHARS);
  const attachments = (parsed.attachments ?? [])
    .slice(0, 20)
    .map((item) => fileName(item.filename));
  return { text, attachments };
}

export async function listInbox(): Promise<InboxList> {
  if (testBackend) return testBackend.list();
  const settings = imapSettings();
  if (!settings) return { configured: false, mailbox: "", unseen: 0, messages: [] };
  return withInbox(settings, async (client, mailbox) => {
    const status = await client.status("INBOX", { messages: true, unseen: true });
    const total = status.messages ?? 0;
    if (total === 0) return { configured: true, mailbox, unseen: status.unseen ?? 0, messages: [] };
    const start = Math.max(1, total - LIST_LIMIT + 1);
    const fetched = await client.fetchAll(`${start}:*`, {
      uid: true,
      flags: true,
      envelope: true,
      internalDate: true,
    });
    const messages = fetched
      .map(summarize)
      .sort((left, right) => right.date.localeCompare(left.date) || right.uid - left.uid);
    return { configured: true, mailbox, unseen: status.unseen ?? 0, messages };
  });
}

export async function readInbox(uid: number): Promise<InboxLetter | null> {
  if (testBackend) return testBackend.read(uid);
  const settings = imapSettings();
  if (!settings) throw new InboxError("not_configured");
  return withInbox(settings, async (client) => {
    const head = await client.fetchOne(
      String(uid),
      { uid: true, flags: true, envelope: true, internalDate: true, size: true },
      { uid: true },
    );
    if (!head) return null;
    const summary = summarize(head);
    if (!summary.seen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    const tooLarge = (head.size ?? 0) > MAX_SOURCE_BYTES;
    if (tooLarge)
      return {
        ...summary,
        to: people(head.envelope?.to),
        text: "",
        attachments: [],
        tooLarge: true,
        seen: true,
      };
    const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
    const parsed =
      full && full.source ? await letterText(full.source) : { text: "", attachments: [] };
    return {
      ...summary,
      to: people(head.envelope?.to),
      text: parsed.text,
      attachments: parsed.attachments,
      tooLarge: false,
      seen: true,
    };
  });
}

function imapSettings(): { host: string; port: number; user: string; pass: string } | null {
  const user = (process.env["IMAP_USER"] || process.env["SMTP_USER"] || "").trim();
  const pass = process.env["IMAP_PASS"] ?? process.env["SMTP_PASS"] ?? "";
  if (!user || !pass.trim()) return null;
  const port = Number(process.env["IMAP_PORT"] || 993);
  return {
    host: (process.env["IMAP_HOST"] || "imap.timeweb.ru").trim(),
    port: Number.isInteger(port) && port > 0 ? port : 993,
    user,
    pass,
  };
}

async function withInbox<T>(
  settings: { host: string; port: number; user: string; pass: string },
  run: (client: ImapFlow, mailbox: string) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: true,
    auth: { user: settings.user, pass: settings.pass },
    logger: false,
    connectionTimeout: 15_000,
    socketTimeout: 20_000,
  });
  let locked = false;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    locked = true;
    try {
      return await run(client, settings.user);
    } finally {
      lock.release();
      locked = false;
    }
  } catch (error) {
    if (error instanceof InboxError) throw error;
    const message = error instanceof Error ? error.message : "imap";
    console.error("[inbox]", message.split(settings.pass).join("***"));
    throw new InboxError("unavailable");
  } finally {
    if (!locked) {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    } else {
      client.close();
    }
  }
}

function summarize(message: FetchMessageObject): InboxMessage {
  const envelope = message.envelope;
  return {
    uid: message.uid,
    from: person(envelope?.from?.[0]),
    subject: (envelope?.subject ?? "").replace(/\s+/g, " ").trim(),
    date: isoDate(message.internalDate ?? envelope?.date),
    seen: message.flags?.has("\\Seen") ?? false,
  };
}

function people(entries: MessageAddressObject[] | undefined): string {
  return (entries ?? [])
    .map((entry) => person(entry))
    .filter(Boolean)
    .join(", ");
}

function person(entry: MessageAddressObject | undefined): string {
  if (!entry) return "";
  const name = (entry.name ?? "").replace(/\s+/g, " ").trim();
  const address = (entry.address ?? "").replace(/\s+/g, "").trim();
  if (name && address) return `${name} <${address}>`;
  return address || name;
}

function isoDate(value: Date | string | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function fileName(name: string | undefined): string {
  const base = (name || "attachment").split(/[/\\]/).pop() || "attachment";
  return (
    base
      .replace(/[\r\n\t]/g, " ")
      .trim()
      .slice(0, 120) || "attachment"
  );
}
