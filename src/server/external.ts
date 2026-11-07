// pdf.js and tesseract.js start worker files that sit next to their own sources,
// so they must load from node_modules instead of the server bundle.
export function importExternal<T>(specifier: string): Promise<T> {
  return import(/* @vite-ignore */ specifier) as Promise<T>;
}
