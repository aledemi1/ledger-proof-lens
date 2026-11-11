import type { AuditNotice } from "../types/audit";

export function parseNotice(value: unknown): AuditNotice {
  if (typeof value === "string") return { code: "legacy", text: value };
  if (!value || typeof value !== "object") return { code: "legacy", text: "" };
  const item = value as Record<string, unknown>;
  const reason = typeof item["reason"] === "string" ? item["reason"] : "";
  switch (item["code"]) {
    case "duplicate_file":
      return typeof item["name"] === "string" ? { code: "duplicate_file", name: item["name"] } : { code: "legacy", text: "" };
    case "partial_read":
      return { code: "partial_read" };
    case "model_two_stage":
      return { code: "model_two_stage" };
    case "model_failed":
      return { code: "model_failed", reason };
    case "labels_failed":
      return { code: "labels_failed", reason };
    case "context_truncated":
      return {
        code: "context_truncated",
        kept: typeof item["kept"] === "number" ? item["kept"] : 0,
        limit: typeof item["limit"] === "number" ? item["limit"] : 0,
      };
    case "legacy":
      return { code: "legacy", text: typeof item["text"] === "string" ? item["text"] : "" };
    default:
      return { code: "legacy", text: "" };
  }
}

export function parseNotices(value: unknown): AuditNotice[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseNotice).filter((notice) => notice.code !== "legacy" || notice.text.length > 0);
}
