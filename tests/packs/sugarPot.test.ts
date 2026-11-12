import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("keeps the sugar pot within the cube budget with an opaque sugar and spoon tile and translucent glass", async () => {
  expect(
    (
      await python.run(`
import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
registry = load_tool('gear_registry')
atlas = load_tool('gear_atlas')
validate = load_tool('gear_validate')
tilt = load_tool('cube_tilt')
model = registry.build('sugar_pot')
assert len(model.cubes) <= validate.MAX_CUBES_PER_ITEM
assert 2 * len(model.cubes) <= validate.MAX_CUBES_PER_PAIR_BLOCK
assert validate.rotation_errors('sugar_pot', model.cubes) == []
assert validate.uv_errors('sugar_pot', model.cubes, atlas.GEAR_TILES) == []
assert not tilt.compound_cubes(model.cubes)
regions = [t for t in atlas.tiles() if t.item_id == 'sugar_pot']
assert len(regions) == 9
assert atlas.check_alpha('sugar_pot', True) == []
alphas = lambda t: {t.pixels[i] for i in range(3, len(t.pixels), 4)}
assert all(0 not in alphas(t) for t in regions)
wall = regions[:4]
assert all(alphas(t) <= set(range(64, 193)) for t in wall)
sugar, steel = regions[4], regions[8]
assert alphas(sugar) == {255} and alphas(steel) == {255}
pixels = atlas.atlas_pixels()
assert validate.alpha_errors('sugar_pot', True, validate.sampled_alphas(model.cubes, pixels, atlas.ATLAS_SIZE)) == []
print('ok')
`)
    ).trim(),
  ).toBe("ok");
});
