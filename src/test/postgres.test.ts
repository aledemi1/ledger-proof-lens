// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newDb } from "pg-mem";
import type { Pool } from "pg";
import { insertDocument, insertSession, readSession, saveOutcome } from "@/server/db";
import { adminStats, all, closeDb, poolOptions, run, useTestPool } from "@/server/store";
import type { CheckResult } from "@/types/audit";

const real = process.env["SVERKO_TEST_POSTGRES"] === "1";

function check(): CheckResult {
  return {
    id: "c1",
    fieldName: "Количество",
    reportValue: "2",
    sourceValue: "2",
    discrepancy: null,
    status: "match",
    severity: "low",
    explanation: "совпало",
    evidenceReferences: [],
    reviewerStatus: "pending",
    reviewerComment: "",
  };
}

describe("postgres store", () => {
  beforeAll(async () => {
    process.env["SVERKO_DATA_DIR"] = mkdtempSync(path.join(tmpdir(), "sverko-pg-"));
    if (!real) {
      const memory = newDb();
      const { Pool: MemoryPool } = memory.adapters.createPg();
      useTestPool(new MemoryPool() as Pool);
    }
    await closeDb();
    if (real) {
      for (const table of ["reviews", "checks", "documents", "sessions", "auth_sessions", "email_verification_tokens", "users"]) {
        await run(`DELETE FROM ${table}`);
      }
    }
  });

  afterAll(async () => {
    await closeDb();
  });

  it("saves a check and reads the notice back through PostgreSQL SQL", async () => {
    await insertSession({ id: "aud_pg", owner: "usr_pg", idempotencyKey: "pg-1", title: "Postgres" });
    await insertDocument({
      id: "doc_pg",
      sessionId: "aud_pg",
      role: "report",
      name: "Отчет.xlsx",
      docType: "report",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 10,
      sha256: "abc",
      storagePath: path.join(process.env["SVERKO_DATA_DIR"] ?? "", "report"),
    });
    await saveOutcome({
      sessionId: "aud_pg",
      reportDocumentId: "doc_pg",
      checks: [check()],
      fileErrors: [],
      notices: [{ code: "duplicate_file", name: "Акт.pdf" }],
      incomplete: false,
    });
    const session = await readSession("aud_pg");
    expect(session?.checks[0]?.status).toBe("match");
    expect(session?.notices).toEqual([{ code: "duplicate_file", name: "Акт.pdf" }]);
    const rows = await all<{ id: string }>("SELECT id FROM checks WHERE session_id = ?", ["aud_pg"]);
    expect(rows.map((row) => row.id)).toEqual(["c1"]);
    if (real) {
      const stats = await adminStats();
      expect(stats.checks).toBeGreaterThan(0);
      expect(stats.checksByStatus.some((row) => row.status === "match")).toBe(true);
    }
  });
});

describe("postgres tls", () => {
  it("verifies the server certificate when the url asks for tls", () => {
    expect(poolOptions("postgres://localhost/sverko").ssl).toBeUndefined();
    expect(poolOptions("postgres://db.example/sverko?sslmode=disable").ssl).toBeUndefined();
    expect(poolOptions("postgres://db.example/sverko?sslmode=require")).toMatchObject({
      connectionString: "postgres://db.example/sverko",
      ssl: { rejectUnauthorized: true },
    });
    expect(poolOptions("postgres://db.example/sverko?sslmode=verify-full&application_name=sverko").connectionString).toBe("postgres://db.example/sverko?application_name=sverko");
    const dir = mkdtempSync(path.join(tmpdir(), "sverko-ca-"));
    const caPath = path.join(dir, "ca.pem");
    writeFileSync(caPath, "CERT");
    const secured = poolOptions(`postgres://db.example/sverko?sslmode=verify-full&sslrootcert=${encodeURIComponent(caPath)}`);
    expect(secured.ssl).toMatchObject({ rejectUnauthorized: true, ca: Buffer.from("CERT") });
  });
});
