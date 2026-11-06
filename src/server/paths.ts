import path from "node:path";

export function dataDir(): string {
  return path.resolve(process.env["SVERKO_DATA_DIR"] || path.join(process.cwd(), ".data"));
}
