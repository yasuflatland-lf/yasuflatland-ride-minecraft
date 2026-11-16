import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds an opaque painted saucepan within the rotation and size budgets", async () => {
  const output = await python.run(
    [
      "import json, math, sys",
      "from pathlib import Path",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "registry = load_tool('gear_registry')",
      "atlas = load_tool('gear_atlas')",
      "tilt = load_tool('cube_tilt')",
      "model = registry.build('saucepan')",
      "assert 100 < len(model.cubes) <= 256",
      "assert model.texture_request == ('saucepan',)",
      "pixels = atlas.atlas_pixels()",
      "colors = set()",
      "swatches = [atlas.face(name) for name in model.texture_request if name in atlas.PALETTE]",
      "for cube in model.cubes:",
      "    assert sum(abs(v) > 1e-9 for v in cube.get('rotation', [])) <= 1",
      "    for face in cube['uv'].values():",
      "        x, y = face['uv']; w, h = face['uv_size']",
      "        x0, x1 = sorted((x, x+w)); y0, y1 = sorted((y, y+h))",
      "        tiled = 388 <= x0 < x1 <= 508 and 132 <= y0 < y1 <= 252",
      "        assert face in swatches or tiled",
      "        for py in range(math.floor(y0), math.ceil(y1)):",
      "            for px in range(math.floor(x0), math.ceil(x1)):",
      "                offset = (py * atlas.ATLAS_SIZE + px) * 4",
      "                color = tuple(pixels[offset:offset+4])",
      "                assert color[3] == 255",
      "                if tiled: colors.add(color)",
      "assert len(colors) > 12",
      "lo, hi = tilt.bounds(model.cubes)",
      "assert abs(lo[0] + 3) < 0.001 and abs(hi[0] - 3) < 0.001",
      "assert abs(lo[1]) < 0.001 and abs(hi[1] - 3) < 0.001",
      "assert abs(lo[2] + hi[2]) < 0.001",
      "exported = json.loads(Path('packs/yasu_ride_rp/models/blocks/yasu_ride/saucepan.geo.json').read_text())",
      "lo, hi = tilt.bounds(exported['minecraft:geometry'][0]['bones'][0]['cubes'])",
      "assert abs(lo[0] + 3) < 0.0005 and abs(hi[0] - 3) < 0.0005",
      "assert lo[1] == 0 and hi[1] == 3",
      "assert registry.build('saucepan') == model",
      "assert atlas.atlas_pixels() == pixels",
      "print(json.dumps({'cubes': len(model.cubes), 'colors': len(colors)}))",
    ].join("\n"),
  );
  const result = JSON.parse(output);
  expect(result.cubes).toBeGreaterThan(100);
  expect(result.colors).toBeGreaterThan(12);
});
