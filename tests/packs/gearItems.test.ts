import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds every registered gear item in catalog order with requested swatches or item tiles", async () => {
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
      "    assert model.texture_request",
      "    assert all(name in atlas.PALETTE or name == item_id and name in atlas.GEAR_TILES for name in model.texture_request)",
      "    requested = [atlas.face(name) for name in model.texture_request if name in atlas.PALETTE]",
      "    regions = [tile for tile in atlas.tiles() if tile.item_id == item_id]",
      "    def in_tile(face):",
      "        u, v = face['uv']; du, dv = face['uv_size']",
      "        return any(t.x <= min(u, u+du) <= max(u, u+du) <= t.x+t.width and t.y <= min(v, v+dv) <= max(v, v+dv) <= t.y+t.height for t in regions)",
      "    assert all(face in requested or in_tile(face) for cube in model.cubes for face in cube['uv'].values())",
      "print(json.dumps(list(models)))",
    ].join("\n"),
  );
  expect(JSON.parse(output).length).toBeGreaterThan(0);
});
