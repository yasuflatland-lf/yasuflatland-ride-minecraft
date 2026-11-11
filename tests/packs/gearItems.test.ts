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
      "    assert all(name in atlas.PALETTE for name in model.texture_request)",
      "    assert validate.uv_errors(item_id, model.cubes, atlas.GEAR_TILES) == []",
      "print(json.dumps(list(models)))",
    ].join("\n"),
  );
  expect(JSON.parse(output).length).toBeGreaterThan(0);
});
