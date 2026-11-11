function positive(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : fallback;
}

/** Characters of extracted text sent with the report, and again with the sources, on the primary scan. */
export function scanCharLimit(): number {
  return positive("SVERKO_SCAN_CHAR_LIMIT", 1_200_000);
}

/** Characters kept from one fragment on that scan. */
export function scanFragmentSlice(): number {
  return positive("SVERKO_SCAN_FRAGMENT_SLICE", 12_000);
}

/** Characters of source text sent on the rule-path second pass. */
export function packCharLimit(): number {
  return positive("SVERKO_PACK_CHAR_LIMIT", 600_000);
}

/** Characters kept from one fragment on that pass. */
export function packFragmentSlice(): number {
  return positive("SVERKO_PACK_FRAGMENT_SLICE", 6_000);
}
