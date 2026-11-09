import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { mailConfigured, publicOrigin, sendMail, verificationLetter } from "./mail";
import { all, get, run, tokenHash } from "./store";

const scrypt = promisify(scryptCallback);

export type AccountRole = "admin" | "user";

export interface Account {
  id: string;
  email: string;
  role: AccountRole;
}

export class AccountError extends Error {
  code: "duplicate" | "invalid" | "last_admin" | "missing";

  constructor(code: AccountError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validEmail(value: string): boolean {
  return value.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validPassword(value: string): boolean {
  return value.length >= 8 && value.length <= 200;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hex] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hex) return false;
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  if (expected.length !== hash.length) return false;
  return timingSafeEqual(hash, expected);
}

export async function createAccount(email: string, password: string, role: AccountRole, verified = true): Promise<Account> {
  if (!validEmail(email) || !validPassword(password) || (role !== "admin" && role !== "user")) {
    throw new AccountError("invalid", "Укажите почту и пароль не короче 8 символов");
  }
  const existing = await get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) throw new AccountError("duplicate", "Такой аккаунт уже есть");
  const account: Account = { id: `usr_${randomBytes(8).toString("hex")}`, email, role };
  const createdAt = new Date().toISOString();
  await run(
    "INSERT INTO users (id, email, password_hash, role, created_at, email_verified_at) VALUES (?, ?, ?, ?, ?, ?)",
    [account.id, email, await hashPassword(password), role, createdAt, verified ? createdAt : null],
  );
  return account;
}

export async function sendRegistrationEmail(userId: string, email: string, request: Request): Promise<void> {
  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 48 * 3600_000).toISOString();
  await run(
    "INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)",
    [`evt_${randomBytes(8).toString("hex")}`, userId, sha256(raw), expires],
  );
  const letter = verificationLetter(`${publicOrigin(request)}/verify-email?token=${encodeURIComponent(raw)}`);
  try {
    await sendMail({ to: email, ...letter });
  } catch (error) {
    await run("DELETE FROM email_verification_tokens WHERE user_id = ?", [userId]);
    await run("DELETE FROM users WHERE id = ?", [userId]);
    throw error;
  }
}

export async function confirmEmail(rawToken: string): Promise<Account> {
  const token = rawToken.trim();
  if (token.length < 16) throw new AccountError("invalid", "Ссылка подтверждения недействительна");
  const row = await get<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id, user_id, expires_at, used_at FROM email_verification_tokens WHERE token_hash = ?",
    [sha256(token)],
  );
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) {
    throw new AccountError("invalid", row?.used_at ? "Ссылка уже использована" : "Ссылка подтверждения недействительна");
  }
  const now = new Date().toISOString();
  await run("UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL", [now, row.user_id]);
  await run("UPDATE email_verification_tokens SET used_at = ? WHERE id = ?", [now, row.id]);
  const account = await get<{ id: string; email: string; role: string }>(
    "SELECT id, email, role FROM users WHERE id = ?",
    [row.user_id],
  );
  if (!account || (account.role !== "admin" && account.role !== "user")) {
    throw new AccountError("invalid", "Аккаунт не найден");
  }
  return account;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function loginAccount(email: string, password: string): Promise<Account | "unverified" | null> {
  const row = await get<{ id: string; email: string; role: string; password_hash: string; email_verified_at: string | null }>(
    "SELECT id, email, role, password_hash, email_verified_at FROM users WHERE email = ?",
    [email],
  );
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  if (row.role !== "admin" && row.role !== "user") return null;
  if (mailConfigured() && row.role !== "admin" && !row.email_verified_at) return "unverified";
  return { id: row.id, email: row.email, role: row.role };
}

export async function openAuthSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await run("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [tokenHash(token), userId, expires]);
  return token;
}

export async function closeAuthSession(token: string | null): Promise<void> {
  if (!token) return;
  await run("DELETE FROM auth_sessions WHERE token_hash = ?", [tokenHash(token)]);
}

export async function accountFromToken(token: string | null): Promise<Account | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = tokenHash(token);
  const row = await get<{ id: string; email: string; role: string; expires_at: string }>(
    `SELECT u.id, u.email, u.role, s.expires_at
     FROM auth_sessions s INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    [hash],
  );
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    await run("DELETE FROM auth_sessions WHERE token_hash = ?", [hash]);
    return null;
  }
  if (row.role !== "admin" && row.role !== "user") return null;
  return { id: row.id, email: row.email, role: row.role };
}

export async function listAccounts(): Promise<Account[]> {
  const rows = await all<{ id: string; email: string; role: string }>("SELECT id, email, role FROM users ORDER BY created_at");
  return rows.filter((row): row is Account => row.role === "admin" || row.role === "user");
}

export async function setAccountRole(id: string, role: AccountRole): Promise<void> {
  const current = await get<{ id: string; role: string }>("SELECT id, role FROM users WHERE id = ?", [id]);
  if (!current) throw new AccountError("missing", "Пользователь не найден");
  if (current.role === "admin" && role === "user") {
    const admins = await all<{ id: string }>("SELECT id FROM users WHERE role = 'admin'");
    if (admins.length <= 1) throw new AccountError("last_admin", "Нужен хотя бы один администратор");
  }
  await run("UPDATE users SET role = ? WHERE id = ?", [role, id]);
}

export async function changePassword(id: string, currentPassword: string, nextPassword: string): Promise<void> {
  if (!validPassword(nextPassword)) throw new AccountError("invalid", "Новый пароль должен быть не короче 8 символов");
  const row = await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [id]);
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) throw new AccountError("invalid", "Текущий пароль не подошёл");
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(nextPassword), id]);
}
