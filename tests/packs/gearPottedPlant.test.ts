import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds an opaque, textured plant within its size and rotation limits", {
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
      "model = registry.build('potted_plant')",
      "cubes = model.cubes",
      "assert 20 < len(cubes) <= validate.MAX_CUBES_PER_ITEM",
      "assert all(tilt.axis_count(cube) <= 1 for cube in cubes)",
      "lo, hi = tilt.bounds(cubes)",
      "assert abs(lo[0] + 2.5) < 0.001 and abs(hi[0] - 2.5) < 0.001",
      "assert lo[1] == 0 and hi[1] == 8",
      "assert atlas.GEAR_TILES['potted_plant'] == 8",
      "assert validate.sampled_alphas(cubes, atlas.atlas_pixels(), 512) == {255}",
      "regions = [r for r in atlas.tiles() if r.item_id == 'potted_plant']",
      "colors = {r.get(x, y)[:3] for r in regions for y in range(r.height) for x in range(r.width)}",
      "assert len(colors) >= 20",
      "assert all(face['uv'][1] >= 256 for cube in cubes for face in cube['uv'].values())",
      "print(json.dumps(len(cubes)))",
    ].join("\n"),
  );
  expect(JSON.parse(output)).toBeGreaterThan(20);
});
