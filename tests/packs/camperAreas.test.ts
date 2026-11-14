import { existsSync, readFileSync } from "node:fs";
import { afterAll, expect, it } from "vitest";
import { defined } from "../support/defined";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("assigns every final camper cube to exactly one area range", () => {
  const path = "tests/packs/fixtures/camper-areas.json";
  expect(existsSync(path)).toBe(true);
  const areas: Record<
    string,
    Record<string, number[] | number[][]>
  > = JSON.parse(readFileSync(path, "utf8"));
  const bones: { name: string; cubes?: unknown[] }[] = JSON.parse(
    readFileSync(
      "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
      "utf8",
    ),
  )["minecraft:geometry"][0].bones;
  const coverage = new Map(
    bones.map((b) => [b.name, Array(b.cubes?.length ?? 0).fill(0)]),
  );
  for (const area of Object.values(areas)) {
    for (const [bone, span] of Object.entries(area)) {
      const counts = defined(coverage.get(bone), bone);
      for (const range of typeof span[0] === "number"
        ? [span as number[]]
        : (span as number[][])) {
        const [first, last] = range as [number, number];
        expect(range).toHaveLength(2);
        expect(Number.isInteger(first) && Number.isInteger(last)).toBe(true);
        expect(first).toBeGreaterThanOrEqual(0);
        expect(last).toBeGreaterThanOrEqual(first);
        expect(last).toBeLessThan(counts.length);
        for (let i = first; i <= last; i++) counts[i]++;
      }
    }
  }
  for (const counts of coverage.values())
    expect(counts.every((n) => n === 1)).toBe(true);
});

it("builds independent areas repeatedly without changing the shared atlas", {
  timeout: 120_000,
}, async () => {
  await python.run(`
import ast, json, sys
from pathlib import Path
sys.path.insert(0, str(Path('tools').resolve()))
from tool_loader import load_tool
kit = load_tool('camper_kit')
regions = kit.ATLAS.regions
names = list(json.loads(Path('tests/packs/fixtures/camper-areas.json').read_text()))
names = [n for n in names if n not in ('floor', 'walls', 'tile', 'table')] + ['surfaces']
for name in reversed(names):
    module_name = 'kitchen' if name in ('counter', 'range', 'burner') else name
    path = Path(f'tools/camper_{module_name}.py')
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'load_tool':
            assert node.args[0].value not in {f'camper_{n}' for n in names}
    area = load_tool(f'camper_{module_name}')
    assert area.AREA == module_name
    def build():
        if module_name == 'kitchen':
            return area.build_kitchen_top(kit.REGISTRY)[0]
        if module_name == 'surfaces':
            return area.build_surfaces(kit.REGISTRY)
        return area.build()
    first = build()
    snapshot = json.dumps(first)
    assert isinstance(first, kit.AreaCubes)
    assert json.dumps(build()) == snapshot
    assert kit.ATLAS.regions == regions
    for cubes in first.values():
        for cube in cubes:
            cube['origin'][0] += 1000
    assert json.dumps(build()) == snapshot
a = kit.AreaCubes({'body': [1], 'seat': [2]})
assert a.merge(kit.AreaCubes({'glass': [3], 'body': [4]})) is a
assert list(a) == ['body', 'seat', 'glass']
assert a['body'] == [1, 4]
`);
});
