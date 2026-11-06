import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// Untracked files that are not ignored count too, so a file added before its
// first commit is checked like the rest. Git also lists directory links (for
// example inside an untracked package store), which cannot be read as files.
export function listRepoFiles() {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  return [...new Set(listed)].filter((relPath) => {
    try {
      return lstatSync(path.join(root, relPath)).isFile();
    } catch {
      return false;
    }
  });
}
