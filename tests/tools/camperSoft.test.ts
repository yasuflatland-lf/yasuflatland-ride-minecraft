import fc from "fast-check";
import { afterAll, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = (code: string) =>
  python.run(`
import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_soft')
kit = load_tool('camper_kit')
${code}
`);

it("keeps chamfered cushions and piping inside their boxes, including thin covers", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(
        fc.integer({ min: 3, max: 300 }),
        fc.integer({ min: 3, max: 300 }),
        fc.integer({ min: 3, max: 300 }),
      ),
      async (dimensions) => {
        await run(`
size = [n / 10 for n in ${JSON.stringify(dimensions)}]
origin = [-23, 21, 24.1]
cubes = m.cushion(kit.REGISTRY, origin, size)
assert len(cubes) >= 5
for c in cubes:
    for i in range(3):
        assert c['size'][i] > 0, c
        assert c['origin'][i] >= origin[i] - 1e-8, c
        assert c['origin'][i] + c['size'][i] <= origin[i] + size[i] + 1e-8, c
`);
      },
    ),
    { numRuns: 20 },
  );
});

it("registers fixed olive fabric regions and maps every soft face inside its named region", async () => {
  await run(`
expected = {'olive looped tweed': (192,256), 'olive khaki cream bolster': (128,128), 'olive welt': (32,32)}
registered = {r.name:r for r in kit.REGISTRY.regions()}
for name, size in expected.items():
    r = registered[name]
    assert (r.width,r.height) == size
    assert r.material == kit.regions.Material.FABRIC
    assert r.pixel(0,0)[3] == 255
area = m.build_soft(kit.REGISTRY)
for cubes in area.values():
    for cube in cubes:
        for face in cube['uv'].values():
            assert any(face['uv'] == list(kit.LAYOUT.origin(name)) and face['uv_size'] == list(size) for name,size in expected.items())
before = [registered['olive khaki cream bolster'].pixel(x,0) for x in range(32)]
saved = dict(kit.PALETTE)
kit.PALETTE['khaki'] = (255,0,255,255)
kit.PALETTE['stripe'] = (0,0,255,255)
assert before == [registered['olive khaki cream bolster'].pixel(x,0) for x in range(32)]
assert len(set(before)) > 4
kit.PALETTE.update(saved)
`);
});

it("preserves the approved fabric region pixels independently of packing", async () => {
  await run(`
import hashlib
expected = {
    'olive looped tweed': 'a10d8ab5b23bf605adf77c76080ea57bcb09bf12c108f3567a2b2f5749da9134',
    'olive khaki cream bolster': '66d5387e523d41891b6e8ff7a32ba10537216814135ab0962601a025bf8883cd',
    'olive welt': 'c1d01e9182a899bcd7b3e1303f6c2599dacf3500586e338963fa5f3bf968ab79',
}
for name, digest in expected.items():
    assert hashlib.sha256(m.fabric_pixels()[name]).hexdigest() == digest
`);
});
