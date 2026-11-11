import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("registers both Resource Packs and preserves the test pack's committed version", () => {
  const root = mkdtempSync(join(tmpdir(), "cutout-dev-world-"));
  const packs = [
    "yasu_ride_bp",
    "yasu_ride_rp",
    "yasu_ride_test_bp",
    "yasu_ride_test_rp",
  ];
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  try {
    for (const pack of packs) {
      const folder = join(root, "packs", pack);
      mkdirSync(folder, { recursive: true });
      writeFileSync(
        join(folder, "manifest.json"),
        readFileSync(`packs/${pack}/manifest.json`),
      );
    }
    const testPath = join(root, "packs/yasu_ride_test_rp/manifest.json");
    const testManifest = read(testPath);
    testManifest.header.version = [0, 1, 7];
    for (const module of testManifest.modules) module.version = [0, 1, 7];
    writeFileSync(testPath, JSON.stringify(testManifest));
    const setup = resolve("scripts/setup-dev-world.mjs");
    for (let run = 1; run <= 2; run++) {
      execFileSync(process.execPath, [setup], { cwd: root });
      const world = join(root, "server/data/worlds/yasuflatland-ride-dev");
      const main = read(
        join(root, "server/data/dev-manifests/yasu_ride_rp/manifest.json"),
      );
      expect(main.header.version[2]).toBe(10000 + run);
      expect(read(join(world, "world_resource_packs.json"))).toEqual([
        { pack_id: main.header.uuid, version: main.header.version },
        { pack_id: testManifest.header.uuid, version: [0, 1, 7] },
      ]);
      expect(read(join(world, "world_behavior_packs.json"))).toEqual(
        ["yasu_ride_bp", "yasu_ride_test_bp"].map((pack) => {
          const manifest = read(join(root, "packs", pack, "manifest.json"));
          return {
            pack_id: manifest.header.uuid,
            version: manifest.header.version,
          };
        }),
      );
      expect(read(testPath)).toEqual(testManifest);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
