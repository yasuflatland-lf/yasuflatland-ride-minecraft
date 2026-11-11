import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds every registered gear item in catalog order with named swatches or item tiles", async () => {
  const output = await python.run(
    [
      "import json, sys",
      "from pathlib import Path",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool, load_tool_in",
      "registry = load_tool('gear_registry')",
      "values = load_tool('gear_model')",
      "atlas = load_tool('gear_atlas')",
      "rows = json.loads(Path('tools/camping_gear.json').read_text())",
      "specs = [values.GearSpec.from_row(row) for row in rows]",
      "assert registry.gear_atlas is atlas",
      "assert load_tool_in('gear_items', 'percolator')._atlas is atlas",
      "models = registry.models()",
      "assert list(registry.IDS) == [spec.id for spec in specs] == list(models)",
      "assert {path.stem for path in Path('tools/gear_items').glob('*.py')} == set(registry.IDS)",
      "for item_id, model in models.items():",
      "    assert isinstance(model, values.GearModel)",
      "    assert model.cubes",
      "    assert registry.build(item_id) == model",
      "    assert isinstance(model.texture_request, tuple)",
      "    assert model.texture_request or item_id in atlas.GEAR_TILES",
      "    assert all(name in atlas.PALETTE for name in model.texture_request)",
      "    requested = [atlas.face(name) for name in model.texture_request]",
      "    cell = atlas.GEAR_TILES.get(item_id)",
      "    def in_tile(face):",
      "        if cell is None: return False",
      "        x, y = face['uv']; w, h = face['uv_size']",
      "        cx, cy = cell % 4 * atlas.CELL, cell // 4 * atlas.CELL",
      "        return cx + 4 <= min(x, x+w) < max(x, x+w) <= cx + 124 and cy + 4 <= min(y, y+h) < max(y, y+h) <= cy + 124",
      "    assert all(face in requested or in_tile(face) for cube in model.cubes for face in cube['uv'].values())",
      "print(json.dumps(list(models)))",
    ].join("\n"),
  );
  expect(JSON.parse(output).length).toBeGreaterThan(0);
});
