import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("round-trips generated Washstand outputs and detects missing or altered geometry and texels", () => {
  const directory = mkdtempSync(join(tmpdir(), "washstand-"));
  const run = (check = false) =>
    spawnSync(
      "python3",
      [
        "-I",
        "tools/gen_washstand.py",
        directory,
        ...(check ? ["--check"] : []),
      ],
      { encoding: "utf8" },
    );
  const geo = join(directory, "models/entity/yasu_ride/washstand.geo.json");
  const texture = join(directory, "textures/entity/yasu_ride/washstand.png");
  try {
    expect(run(true).status).not.toBe(0);
    expect(run().status).toBe(0);
    expect(run(true).status).toBe(0);
    const original = readFileSync(geo, "utf8");
    const document = JSON.parse(original);
    document["minecraft:geometry"][0].bones[1].cubes[0].size[1] += 0.1;
    writeFileSync(geo, JSON.stringify(document));
    expect(run(true).stderr).toContain(geo);
    writeFileSync(geo, original);
    for (const path of [
      texture,
      join(directory, "textures/entity/yasu_ride/washstand_water.png"),
      join(directory, "animations/yasu_ride/washstand.anim.json"),
    ]) {
      const bytes = readFileSync(path);
      writeFileSync(path, "invalid asset");
      expect(run(true).stderr).toContain(path);
      writeFileSync(path, bytes);
    }
    expect(run().status).toBe(0);
    expect(run(true).status).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);
