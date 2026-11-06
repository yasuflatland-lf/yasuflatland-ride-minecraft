import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { listRepoFiles } from "../../scripts/repo-files.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRATCH = join(ROOT, "tests", "scripts", "__repo_files_scratch__");

describe("repository file listing", () => {
  afterAll(async () => {
    const { rmSync } = await import("node:fs");
    rmSync(SCRATCH, { recursive: true, force: true });
  });

  it("returns regular files and skips links and directories", () => {
    mkdirSync(join(SCRATCH, "dir"), { recursive: true });
    writeFileSync(join(SCRATCH, "file.txt"), "x");
    writeFileSync(join(SCRATCH, "dir", "nested.txt"), "x");
    symlinkSync(join(SCRATCH, "dir"), join(SCRATCH, "dir-link"));
    symlinkSync(join(SCRATCH, "file.txt"), join(SCRATCH, "file-link"));
    const listed = listRepoFiles();
    const prefix = "tests/scripts/__repo_files_scratch__/";
    expect(listed).toContain(`${prefix}file.txt`);
    expect(listed).toContain(`${prefix}dir/nested.txt`);
    expect(listed).not.toContain(`${prefix}dir-link`);
    expect(listed).not.toContain(`${prefix}file-link`);
    expect(listed).not.toContain(`${prefix}dir`);
  });
});
