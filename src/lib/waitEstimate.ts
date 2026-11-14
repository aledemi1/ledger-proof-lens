/** Rough seconds left. The whole pack's size sets the comparison time; pages still to recognize add OCR on top. */
export function waitSeconds(input: {
  pendingVisualPages: number;
  pendingTextFiles: number;
  textChars: number;
  totalBytes?: number;
  model: boolean;
  queued: boolean;
}): number {
  const bytes = Math.max(0, input.totalBytes ?? 0);
  const megabytes = bytes / (1024 * 1024);
  const fromSize = bytes > 0
    ? Math.min(input.model ? 40 * 60 : 8 * 60, (input.model ? 20 : 4) + Math.round(megabytes * (input.model ? 80 : 12)))
    : Math.min(input.model ? 240 : 30, (input.model ? 25 : 2) + Math.ceil(Math.max(0, input.textChars) / 4000) * (input.model ? 8 : 1));
  const ocr = input.pendingVisualPages * 12;
  const plain = input.pendingTextFiles * 2;
  return Math.max(8, (input.queued ? 15 : 0) + ocr + plain + fromSize);
}

/** Pages still to recognize. A known page count wins; otherwise the file size is a stand-in. */
export function visualPagesOf(name: string, size: number, pageCount = 0): number {
  if (pageCount > 0) return pageCount;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return 1;
  if (ext === "pdf") return Math.min(40, Math.max(1, Math.round(size / 180_000)));
  return 0;
}

export function previewWait(files: { name: string; size: number }[]): number {
  let pendingVisualPages = 0;
  let pendingTextFiles = 0;
  for (const file of files) {
    const pages = visualPagesOf(file.name, file.size);
    if (pages) pendingVisualPages += pages;
    else pendingTextFiles += 1;
  }
  const totalBytes = files.reduce((sum, file) => sum + Math.max(0, file.size), 0);
  return waitSeconds({ pendingVisualPages, pendingTextFiles, textChars: 0, totalBytes, model: true, queued: false });
}

export function waitBounds(seconds: number): { kind: "under" } | { kind: "about"; n: number } | { kind: "range"; low: number; high: number } {
  if (seconds < 60) return { kind: "under" };
  const low = Math.max(1, Math.round((seconds * 0.75) / 60));
  const high = Math.max(low, Math.round((seconds * 1.35) / 60));
  if (high - low <= 1) return { kind: "about", n: Math.max(1, Math.round(seconds / 60)) };
  return { kind: "range", low, high };
}
