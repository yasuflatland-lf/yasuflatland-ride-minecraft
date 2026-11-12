import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds an opaque cactus pot within its geometry and atlas limits", {
  timeout: 30_000,
}, async () => {
  const output = await python.run(
    [
      "import json, sys",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "registry = load_tool('gear_registry')",
      "atlas = load_tool('gear_atlas')",
      "validate = load_tool('gear_validate')",
      "tilt = load_tool('cube_tilt')",
      "item_id = 'cactus_pot'",
      "model = registry.build(item_id)",
      "regions = [tile for tile in atlas.tiles() if tile.item_id == item_id]",
      "assert 100 <= len(model.cubes) <= validate.MAX_CUBES_PER_ITEM",
      "assert regions",
      "assert all(region.pixels[i] == 255 for region in regions for i in range(3, len(region.pixels), 4))",
      "assert len({regions[0].get(x, y) for x in range(regions[0].width) for y in range(regions[0].height)}) > 8",
      "lo, hi = tilt.bounds(model.cubes)",
      "assert abs(lo[0] + 2) < 0.001 and abs(hi[0] - 2) < 0.001",
      "assert abs(lo[1]) < 0.001 and abs(hi[1] - 7) < 0.001",
      "assert validate.rotation_errors(item_id, model.cubes) == []",
      "assert validate.uv_errors(item_id, model.cubes, atlas.GEAR_TILES) == []",
      "assert all(cube.get('rotation', [0, 0, 0])[2] == 0 for cube in model.cubes)",
      "assert not tilt.compound_cubes(model.cubes)",
      "print(json.dumps({'count': len(model.cubes), 'bounds': [lo, hi]}))",
    ].join("\n"),
  );
  expect(JSON.parse(output).count).toBeGreaterThanOrEqual(100);
});
