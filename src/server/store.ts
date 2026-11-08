import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { dataDir } from "./paths";

const scrypt = promisify(scryptCallback);

export interface Query {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    idempotency_key TEXT,
    title TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    report_document_id TEXT,
    stage TEXT,
    error TEXT,
    incomplete INTEGER NOT NULL DEFAULT 0,
    file_errors TEXT,
    notices TEXT,
    decision TEXT,
    previous_id TEXT,
    recheck TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sessions_owner_key ON sessions(owner, idempotency_key) WHERE idempotency_key IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    read_error TEXT,
    preview_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS checks (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (session_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    session_id TEXT NOT NULL,
    check_id TEXT NOT NULL,
    reviewer_status TEXT NOT NULL,
    reviewer_comment TEXT NOT NULL,
    reviewed_at TEXT,
    source_json TEXT,
    PRIMARY KEY (session_id, check_id)
  )`,
];

let opening: Promise<void> | undefined;
let sqliteDb: DatabaseSync | undefined;
let pgPool: Pool | undefined;
let mode: "sqlite" | "postgres" | undefined;
let sqliteTail: Promise<void> = Promise.resolve();

function databaseUrl(): string | undefined {
  if (process.env["VITEST"]) return undefined;
  const value = process.env["DATABASE_URL"]?.trim();
  return value || undefined;
}

export function ready(): Promise<void> {
  if (!opening) {
    opening = open().catch((error: unknown) => {
      opening = undefined;
      throw error;
    });
  }
  return opening;
}

export async function closeDb(): Promise<void> {
  const pending = opening;
  opening = undefined;
  mode = undefined;
  if (pending) await pending.catch(() => undefined);
  sqliteDb?.close();
  sqliteDb = undefined;
  if (pgPool) {
    const pool = pgPool;
    pgPool = undefined;
    await pool.end();
  }
}

export async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  if (mode === "postgres") return pgAll<T>(sql, params);
  return sqliteExclusive(() => sqliteAll<T>(sql, params));
}

export async function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, params);
  return rows[0];
}

export async function run(sql: string, params: unknown[] = []): Promise<void> {
  await ready();
  if (mode === "postgres") {
    await pgRun(sql, params);
    return;
  }
  await sqliteExclusive(() => {
    sqliteDb?.prepare(sql).run(...(params as never[]));
  });
}

export async function transaction<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  await ready();
  if (mode === "postgres") return pgTransaction(fn);
  return sqliteExclusive(async () => {
    const db = sqliteDb;
    if (!db) throw new Error("База не открыта");
    db.exec("BEGIN");
    try {
      const result = await fn(sqliteQuery(db));
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}

async function open(): Promise<void> {
  const url = databaseUrl();
  if (url) {
    const pool = new Pool(poolOptions(url));
    pgPool = pool;
    mode = "postgres";
    for (const statement of SCHEMA) await pool.query(statement);
    await ensureColumn("sessions", "previous_id", "TEXT");
    await ensureColumn("sessions", "recheck", "TEXT");
    await ensureColumn("reviews", "source_json", "TEXT");
    await importSqlite(pool);
    await ensureAdmin(
      async (sql, params = []) => {
        await pool.query(toPg(sql), params);
      },
      async (sql, params = []) => {
        const result = await pool.query<{ id: string }>(toPg(sql), params);
        return result.rows;
      },
    );
    return;
  }
  const root = dataDir();
  fs.mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(path.join(root, "sverko.sqlite"));
  sqliteDb = db;
  mode = "sqlite";
  db.exec("PRAGMA journal_mode = WAL;");
  for (const statement of SCHEMA) db.exec(statement);
  scopeCheckIdsToSession(db);
  ensureSqliteColumn(db, "sessions", "previous_id", "TEXT");
  ensureSqliteColumn(db, "sessions", "recheck", "TEXT");
  ensureSqliteColumn(db, "reviews", "source_json", "TEXT");
  await ensureAdmin(
    async (sql, params = []) => {
      db.prepare(sql).run(...(params as never[]));
    },
    async (sql, params = []) => db.prepare(sql).all(...(params as never[])) as { id: string }[],
  );
}

function poolOptions(url: string): ConstructorParameters<typeof Pool>[0] {
  const ssl = /sslmode=(require|verify-ca|verify-full|prefer)/i.test(url);
  const connectionString = url.replace(/([?&])sslmode=[^&]*&/i, "$1").replace(/([?&])sslmode=[^&]*$/i, "");
  return {
    connectionString,
    max: 10,
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function toPg(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

async function pgAll<T>(sql: string, params: unknown[]): Promise<T[]> {
  const pool = pgPool;
  if (!pool) throw new Error("База не открыта");
  const result = await pool.query<QueryResultRow>(toPg(sql), params);
  return result.rows as T[];
}

async function pgRun(sql: string, params: unknown[]): Promise<void> {
  const pool = pgPool;
  if (!pool) throw new Error("База не открыта");
  await pool.query(toPg(sql), params);
}

async function pgTransaction<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  const pool = pgPool;
  if (!pool) throw new Error("База не открыта");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(pgQuery(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function pgQuery(client: PoolClient): Query {
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      const result = await client.query<QueryResultRow>(toPg(sql), params);
      return result.rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const rows = await this.all<T>(sql, params);
      return rows[0];
    },
    async run(sql: string, params: unknown[] = []) {
      await client.query(toPg(sql), params);
    },
  };
}

function sqliteQuery(db: DatabaseSync): Query {
  return {
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).get(...(params as never[])) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...(params as never[]));
    },
  };
}

function sqliteAll<T>(sql: string, params: unknown[]): T[] {
  const db = sqliteDb;
  if (!db) throw new Error("База не открыта");
  return db.prepare(sql).all(...(params as never[])) as T[];
}

function sqliteExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = sqliteTail.then(fn, fn);
  sqliteTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function ensureSqliteColumn(db: DatabaseSync, table: string, name: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

async function ensureColumn(table: string, name: string, definition: string): Promise<void> {
  const pool = pgPool;
  if (!pool) return;
  const found = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2", [table, name]);
  if (!found.rowCount) await pool.query(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(name)} ${definition}`);
}

function quoteIdent(value: string): string {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Некорректное имя столбца");
  return value;
}

function scopeCheckIdsToSession(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(checks)").all() as { name: string; pk: number }[];
  if (columns.filter((column) => column.pk > 0).length > 1) return;
  db.exec(`
    BEGIN;
    ALTER TABLE checks RENAME TO checks_global_ids;
    CREATE TABLE checks (
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (session_id, id)
    );
    INSERT INTO checks (id, session_id, position, payload)
      SELECT id, session_id, position, payload FROM checks_global_ids;
    DROP TABLE checks_global_ids;
    COMMIT;
  `);
}

async function ensureAdmin(
  execute: (sql: string, params?: unknown[]) => Promise<void>,
  read: (sql: string, params?: unknown[]) => Promise<{ id: string }[]>,
): Promise<void> {
  const email = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
  const password = process.env["ADMIN_PASSWORD"];
  if (!email || !password) return;
  const existing = await read("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length) return;
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  const id = `usr_${randomBytes(8).toString("hex")}`;
  await execute("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)", [
    id,
    email,
    `scrypt$${salt}$${hash.toString("hex")}`,
    new Date().toISOString(),
  ]);
}

async function importSqlite(pool: Pool): Promise<void> {
  const file = path.join(dataDir(), "sverko.sqlite");
  if (!fs.existsSync(file)) return;
  const present = await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM sessions");
  if (Number(present.rows[0]?.n ?? 0) > 0) return;
  const source = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = new Set((source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name));
    for (const table of ["sessions", "documents", "checks", "reviews"]) {
      if (!tables.has(table)) continue;
      const columns = (source.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
      const rows = source.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      for (const row of rows) {
        const names = columns.filter((column) => column in row);
        const placeholders = names.map(() => "?").join(", ");
        await pool.query(toPg(`INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`), names.map((column) => row[column] ?? null));
      }
    }
  } finally {
    source.close();
  }
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
