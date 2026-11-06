export function formatDate(iso: string, withTime = false) {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Moscow",
  });
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;
}

export function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function evidencePlace(e: { pageNumber: number; locationLabel?: string | undefined }): string {
  if (e.locationLabel) return e.locationLabel;
  if (e.pageNumber > 0) return `стр. ${e.pageNumber}`;
  return "фрагмент документа";
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
