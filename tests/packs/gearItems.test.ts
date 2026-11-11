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
      "validate = load_tool('gear_validate')",
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
      "    assert all(name in atlas.PALETTE or (name == item_id and name in atlas.GEAR_TILES) for name in model.texture_request)",
      "    requested = [validate.face_rect(atlas.face(name)) for name in model.texture_request if name in atlas.PALETTE]",
      "    if item_id in model.texture_request:",
      "        requested.append(validate.allowed_regions(item_id, atlas.GEAR_TILES)[-1])",
      "    for cube in model.cubes:",
      "        for face in cube['uv'].values():",
      "            u0, v0, u1, v1 = validate.face_rect(face)",
      "            assert any(x0 <= u0 <= u1 <= x1 and y0 <= v0 <= v1 <= y1 for x0, y0, x1, y1 in requested)",
      "print(json.dumps(list(models)))",
    ].join("\n"),
  );
  expect(JSON.parse(output).length).toBeGreaterThan(0);
});
