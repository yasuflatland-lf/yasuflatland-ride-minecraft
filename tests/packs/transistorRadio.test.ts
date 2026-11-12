import { afterAll, expect, it } from "vitest";
import { readRgbaPng } from "../support/png";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds an opaque painted radio within its tile and single-axis budget", async () => {
  const output = await python.run(
    [
      "import json, sys",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "registry = load_tool('gear_registry')",
      "atlas = load_tool('gear_atlas')",
      "validate = load_tool('gear_validate')",
      "tilt = load_tool('cube_tilt')",
      "model = registry.build('transistor_radio')",
      "assert len(model.cubes) <= validate.MAX_CUBES_PER_ITEM",
      "assert all(tilt.axis_count(cube) <= 1 for cube in model.cubes)",
      "regions = [tile for tile in atlas.tiles() if tile.item_id == 'transistor_radio']",
      "assert regions and atlas.GEAR_TILES['transistor_radio'] == 4",
      "assert all(4 <= tile.x < tile.x + tile.width <= 124 and 132 <= tile.y < tile.y + tile.height <= 252 for tile in regions)",
      "assert tilt.bounds(model.cubes)[0][1] == 0.0 and tilt.bounds(model.cubes)[1][1] == 4.0",
      "assert all(abs(abs(bound[0])-3) < 0.001 for bound in tilt.bounds(model.cubes))",
      "grille, rear, dial = model.cubes[2]['uv']['north'], model.cubes[5]['uv']['south'], model.cubes[9]['uv']['up']",
      "knob_sides = [cube['uv'][side] for cube in model.cubes[10:49] if tilt.axis_count(cube) for side in ('north', 'south', 'east', 'west')]",
      "assert len(knob_sides) == 144",
      "for face in [grille, rear, dial, *knob_sides]:",
      "    x0, y0, x1, y1 = validate.face_rect(face)",
      "    assert any(tile.x <= x0 < x1 <= tile.x+tile.width and tile.y <= y0 < y1 <= tile.y+tile.height for tile in regions)",
      "assert validate.sampled_alphas(model.cubes, atlas.atlas_pixels(), atlas.ATLAS_SIZE) == {255}",
      "print(json.dumps([validate.face_rect(face) for cube in model.cubes for face in cube['uv'].values()]))",
    ].join("\n"),
  );
  const rects: [number, number, number, number][] = JSON.parse(output);
  const { width, pixels } = readRgbaPng(
    "packs/yasu_ride_rp/textures/blocks/yasu_ride/camping_gear.png",
  );
  const alphas = new Set<number>();
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        alphas.add(pixels.readUInt8(4 * (y * width + x) + 3));
      }
    }
  }
  expect(alphas).toEqual(new Set([255]));
});
