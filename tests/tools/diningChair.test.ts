import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("round-trips generated Dining Chair outputs and detects missing or altered geometry and texels", () => {
  const directory = mkdtempSync(join(tmpdir(), "dining-chair-"));
  const run = (check = false) =>
    spawnSync(
      "python3",
      [
        "-I",
        "tools/gen_dining_chair.py",
        directory,
        ...(check ? ["--check"] : []),
      ],
      { encoding: "utf8" },
    );
  const geo = join(directory, "models/entity/yasu_ride/dining_chair.geo.json");
  const texture = join(directory, "textures/entity/yasu_ride/dining_chair.png");
  try {
    expect(run(true).status).not.toBe(0);
    expect(run().status).toBe(0);
    expect(run(true).status).toBe(0);
    const original = readFileSync(geo, "utf8");
    const document = JSON.parse(original);
    document["minecraft:geometry"][0].bones[0].cubes[0].size[1] += 0.1;
    writeFileSync(geo, JSON.stringify(document));
    expect(run(true).stderr).toContain(geo);
    writeFileSync(geo, original);
    writeFileSync(texture, "invalid PNG");
    expect(run(true).stderr).toContain(texture);
    expect(run().status).toBe(0);
    expect(run(true).status).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("registers compound back rotations and rejects an oversized or forward-leaning chair", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `
import copy, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('gen_dining_chair')
t = load_tool('cube_tilt')
parts = m.cubes()
assert len(t.compound_cubes(parts)) == 2
try:
    t.assert_axes(parts, {})
except ValueError:
    pass
else:
    raise AssertionError('unregistered compound rotation accepted')
for axis in range(3):
    broken = copy.deepcopy(parts)
    broken[0]['size'][axis] += 100
    try:
        m.validate(broken)
    except ValueError:
        pass
    else:
        raise AssertionError('out-of-bounds chair accepted')
m.BACK_RECLINE = 10
try:
    m.validate(m.cubes())
except ValueError:
    pass
else:
    raise AssertionError('forward lean accepted')
`,
  ]);
});
