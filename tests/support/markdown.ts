import { readFileSync } from "node:fs";

export function readTableRows(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .join(" | ")
        .trim(),
    );
}
