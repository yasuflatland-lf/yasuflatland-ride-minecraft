import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import manifest from "../../packs/yasu_ride_bp/manifest.json";

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "generated-files-"));
  roots.push(root);
  for (const dir of ["scripts", "tools"]) {
    mkdirSync(join(root, dir));
  }
  copyFileSync(
    "scripts/generated-files.mjs",
    join(root, "scripts/generated-files.mjs"),
  );
  writeFileSync(
    join(root, "tools/run_generators.py"),
    `from pathlib import Path
print(Path('status.json').read_text())
`,
  );
  writeFileSync(
    join(root, "status.json"),
    JSON.stringify({ fresh: true, missing: [], stamped: true }),
  );
  symlinkSync(resolve("src"), join(root, "src"), "dir");
  writeFileSync(
    join(root, "scripts/build.mjs"),
    `import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
for (const pack of ['yasu_ride_bp', 'yasu_ride_test_bp']) {
  mkdirSync('packs/' + pack + '/scripts', { recursive: true });
  writeFileSync('packs/' + pack + '/scripts/main.js', 'built');
}
appendFileSync('builds.txt', 'build\\n');
`,
  );
  return root;
}

function build(root: string) {
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import { ensureBuild } from './scripts/generated-files.mjs'; ensureBuild();",
    ],
    { cwd: root },
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

it("builds missing bundles, skips current bundles, and rebuilds stale sources or assets", () => {
  const root = fixture();
  build(root);
  build(root);
  expect(readFileSync(join(root, "builds.txt"), "utf8")).toBe("build\n");
  rmSync(join(root, "packs/yasu_ride_test_bp/scripts/main.js"));
  build(root);
  const old = new Date(0);
  utimesSync(join(root, "packs/yasu_ride_bp/scripts/main.js"), old, old);
  build(root);
  writeFileSync(
    join(root, "status.json"),
    JSON.stringify({ fresh: false, missing: ["packs/model.json"] }),
  );
  build(root);
  expect(readFileSync(join(root, "builds.txt"), "utf8")).toBe(
    "build\nbuild\nbuild\nbuild\n",
  );
});

it("refuses to package missing generated outputs with the build instruction", () => {
  const root = fixture();
  build(root);
  for (const pack of ["yasu_ride_bp", "yasu_ride_rp"]) {
    mkdirSync(join(root, "packs", pack), { recursive: true });
    writeFileSync(join(root, "packs", pack, "manifest.json"), "{}");
  }
  writeFileSync(
    join(root, "status.json"),
    JSON.stringify({
      fresh: false,
      missing: ["packs/model.json"],
      stamped: true,
    }),
  );
  const result = spawnSync(process.execPath, [resolve("scripts/package.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("run `pnpm build` first");
  expect(existsSync(join(root, "dist"))).toBe(false);
});

it("packages the driving-input receiver and keeps build hooks in the dev bundle only", () => {
  const root = fixture();
  for (const pack of ["yasu_ride_bp", "yasu_ride_rp"]) {
    const dir = join("packs", pack);
    mkdirSync(join(root, dir), { recursive: true });
    copyFileSync(join(dir, "manifest.json"), join(root, dir, "manifest.json"));
  }
  execFileSync(process.execPath, [resolve("scripts/build.mjs")], { cwd: root });
  const main = "yasu_ride_bp/scripts/main.js";
  const devPath = join(root, "packs", main);
  const dev = readFileSync(devPath, "utf8");

  execFileSync(process.execPath, [resolve("scripts/package.mjs")], {
    cwd: root,
  });
  const archive = `yasuflatland-ride-${manifest.header.version.join(".")}.mcaddon`;
  const release = execFileSync(
    "unzip",
    ["-p", join(root, "dist", archive), main],
    {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  for (const marker of ["replyWhenSettled", "registerTestEdit"]) {
    expect(dev).toContain(marker);
    expect(release).not.toContain(marker);
  }
  expect(release).toContain("parseTestInputMessage");
  expect(readFileSync(devPath, "utf8")).toBe(dev);
});
