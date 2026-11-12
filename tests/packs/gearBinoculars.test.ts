import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("ports painted binoculars within the cube, assembly, alpha and size contracts", async () => {
  const output = await python.run(
    [
      "import json, sys",
      "from pathlib import Path",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "registry = load_tool('gear_registry')",
      "atlas = load_tool('gear_atlas')",
      "tilt = load_tool('cube_tilt')",
      "validate = load_tool('gear_validate')",
      "model = registry.build('binoculars')",
      "assert 100 < len(model.cubes) <= validate.MAX_CUBES_PER_ITEM",
      "assert model.texture_request == ('binoculars',)",
      "assert atlas.GEAR_TILES['binoculars'] == 13",
      "table = registry.assemblies('binoculars')",
      "assert len(table) == 3",
      'assert all(name.startswith("binoculars_") and entry["owner"] == "camping_gear" for name, entry in table.items())',
      'assert all(len(model.assemblies[name]) == entry["cubes"] for name, entry in table.items())',
      "assert all(cube in model.cubes for part in model.assemblies.values() for cube in part)",
      "assert len(tilt.compound_cubes(model.cubes)) > 100",
      'assert all(tilt.axis_count(cube) <= 2 and cube.get("rotation", [0, 0, 0])[2] == 0 for cube in model.cubes)',
      'assert not validate.rotation_errors("binoculars", model.cubes)',
      'assert not validate.uv_errors("binoculars", model.cubes, atlas.GEAR_TILES)',
      "tilt.assert_axes(model.cubes, model.assemblies, table)",
      "pixels = atlas.atlas_pixels()",
      'regions = [tile for tile in atlas.tiles() if tile.item_id == "binoculars"]',
      "assert regions and all(132 <= t.x < t.x+t.width <= 252 and 388 <= t.y < t.y+t.height <= 508 for t in regions)",
      "colors = {tuple(tile.pixels[i:i+4]) for tile in regions for i in range(0, len(tile.pixels), 4)}",
      "assert len(colors) > 50",
      "assert {c[3] for c in colors} == {0, 255}",
      "assert any(g > r*1.5 and g > b and a == 255 for r, g, b, a in colors)",
      "assert any(b > g*1.2 and r > g and a == 255 for r, g, b, a in colors)",
      "assert validate.sampled_alphas(model.cubes, pixels, atlas.ATLAS_SIZE) == {0, 255}",
      'for cubes in (model.cubes, json.loads(Path("packs/yasu_ride_rp/models/blocks/yasu_ride/binoculars.geo.json").read_text())["minecraft:geometry"][0]["bones"][0]["cubes"]):',
      "    lo, hi = tilt.bounds(cubes)",
      "    assert abs(lo[0]+2.5) < 0.001 and abs(hi[0]-2.5) < 0.001",
      "    assert (lo[1], hi[1]) == (0, 3)",
      "    assert abs(lo[2]+hi[2]) < 0.001 and 4.6 < hi[2]-lo[2] < 4.9",
      'for kind in ("shelf", "table", "cabinet", "fridge"):',
      '    path = Path(f"packs/yasu_ride_rp/models/blocks/yasu_ride/{kind}_decor_pair.geo.json")',
      '    bones = json.loads(path.read_text())["minecraft:geometry"][0]["bones"]',
      '    parts = [bone for bone in bones if "binoculars" in bone["name"]]',
      "    assert len(parts) == 2",
      "    for part in parts:",
      '        assert len(part["cubes"]) == len(model.cubes)',
      '        lo, hi = tilt.bounds(part["cubes"])',
      "        assert all(-8 <= lo[i] <= hi[i] <= 8 for i in (0, 2))",
      '        assert 0 <= lo[1] <= hi[1] <= (9 if kind == "cabinet" else 12 if kind == "fridge" else 16)',
      'assert registry.build("binoculars") == model',
      "assert atlas.atlas_pixels() == pixels",
      'print(json.dumps({"cubes": len(model.cubes), "colors": len(colors)}))',
    ].join("\n"),
  );
  const result = JSON.parse(output);
  expect(result.cubes).toBeGreaterThan(100);
  expect(result.cubes).toBeLessThanOrEqual(256);
  expect(result.colors).toBeGreaterThan(50);
});
