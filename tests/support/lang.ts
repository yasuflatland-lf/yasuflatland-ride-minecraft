import { readFileSync } from "node:fs";

export function readLang(path: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at < 0 || line.startsWith("#")) continue;
    const key = line.slice(0, at);
    if (values.has(key)) throw new Error(`${path}: duplicate lang key ${key}`);
    values.set(key, line.slice(at + 1));
  }
  return values;
}
