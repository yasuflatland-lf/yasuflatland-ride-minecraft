import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds two 40-cube panels and a rail for each of five windows", async () => {
  const result = JSON.parse(
    await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_curtains')
k = load_tool('camper_kit')
cubes = m.build()['body']
region = next((r for r in k.REGISTRY.regions() if r.name == 'light curtain fabric'), None)
print(json.dumps([len(cubes), len(m.anchors()), len(m.make_panel(k.REGISTRY)), [region.width, region.height, region.material.value] if region else None, cubes == m.build()['body'], load_tool('camper_regions').CURTAIN_PIXELS == load_tool('camper_regions')._curtain_pixels()]))`),
  );
  expect(result).toEqual([405, 5, 40, [96, 120, "fabric"], true, true]);
});

it("keeps each window assembly within its opening and the allowed interior depth", async () => {
  const result = JSON.parse(
    await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_curtains')
tilt = load_tool('cube_tilt')
cubes = m.build()['body']
results = []
for i, (_, _, z0, z1, _, _) in enumerate(m.windows()):
    group = cubes[i * 81:(i + 1) * 81]
    lo, hi = tilt.bounds(group)
    results.append([len(group), lo[2] >= z0, hi[2] <= z1, lo[0] >= -22.8, hi[0] <= 22.8, lo[1] > 35.4, hi[1] < 50])
print(json.dumps(results))`),
  );
  expect(result).toEqual(
    Array.from({ length: 5 }, () => [81, true, true, true, true, true, true]),
  );
});
