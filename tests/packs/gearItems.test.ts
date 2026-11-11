import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("builds every registered gear item in catalog order with named swatches", async () => {
  const output = await python.run(
    [
      "import json, sys",
      "from pathlib import Path",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool, load_tool_in",
      "registry = load_tool('gear_registry')",
      "values = load_tool('gear_model')",
      "atlas = load_tool('gear_atlas')",
      "validation = load_tool('gear_validate')",
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
      "    assert all(name in atlas.PALETTE for name in model.texture_request)",
      "    requested = [atlas.face(name) for name in model.texture_request]",
      "    tile_regions = validation.allowed_regions(item_id, atlas.GEAR_TILES)[len(atlas.PALETTE):]",
      "    assert all(face in requested or any(a <= u0 <= u1 <= c and b <= v0 <= v1 <= d for a, b, c, d in tile_regions) for cube in model.cubes for face in cube['uv'].values() for u0, v0, u1, v1 in [validation.face_rect(face)])",
      "print(json.dumps(list(models)))",
    ].join("\n"),
  );
  expect(JSON.parse(output).length).toBeGreaterThan(0);
});
