import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
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

export async function createAccount(email: string, password: string, role: AccountRole): Promise<Account> {
  if (!validEmail(email) || !validPassword(password) || (role !== "admin" && role !== "user")) {
    throw new AccountError("invalid", "Укажите почту и пароль не короче 8 символов");
  }
  const existing = await get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) throw new AccountError("duplicate", "Такой аккаунт уже есть");
  const account: Account = { id: `usr_${randomBytes(8).toString("hex")}`, email, role };
  await run("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)", [
    account.id,
    email,
    await hashPassword(password),
    role,
    new Date().toISOString(),
  ]);
  return account;
}

export async function loginAccount(email: string, password: string): Promise<Account | null> {
  const row = await get<{ id: string; email: string; role: string; password_hash: string }>(
    "SELECT id, email, role, password_hash FROM users WHERE email = ?",
    [email],
  );
  if (!row || !(await verifyPassword(password, row.password_hash))) return null;
  if (row.role !== "admin" && row.role !== "user") return null;
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
