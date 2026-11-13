import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const setup = `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
k = load_tool('camper_kitchen')
r = load_tool('camper_regions')
`;

it("registers the kitchen materials once and exports frozen shared refs with audited faces", async () => {
  const result = JSON.parse(
    await python.run(`${setup}
registry = r.RegionRegistry()
a, refs = k.build_kitchen_top(registry)
frozen = False
try: refs.BROWN_ENDGRAIN = None
except AttributeError: frozen = True
print(json.dumps(dict(regions=[[v.name,v.width,v.height,v.material.name] for v in registry.regions() if v.name != 'base'], frozen=frozen, shared=k.BROWN_ENDGRAIN is not None, counts={name:len(cubes) for name,cubes in a.items()}, audit=r.audit(registry._layout,r.render_atlas(registry._layout)))))`),
  );
  expect(result).toEqual({
    regions: [
      ["flecked laminate", 192, 192, "LACQUER"],
      ["brushed stainless", 128, 64, "METAL"],
      ["range dial", 64, 64, "GLASS_COAT"],
      ["dark olive cab panel", 128, 64, "DARK_LACQUER"],
      ["brown endgrain and pulls", 128, 128, "WOOD"],
      ["routed cream panel", 224, 160, "LACQUER"],
    ],
    frozen: true,
    shared: true,
    counts: { body: 265 },
    audit: [],
  });
});

it("translates and turns the burner about its requested centre without closing its bore", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 10, max: 20 }),
      fc.integer({ min: 25, max: 38 }),
      fc.integer({ min: -180, max: 180 }),
      async (cx, cz, turn) => {
        const result = JSON.parse(
          await python.run(`${setup}
kit = load_tool('camper_kit')
tilt = load_tool('cube_tilt')
cubes = k.burner(${cx}, ${cz}, ${turn})
lo, hi = tilt.bounds(cubes)
def covers_bore(c):
    pivot = c['pivot']
    matrix = tilt.cube_matrix(c['rotation'])
    point = [${cx},30.6,${cz}]
    local = [pivot[i]+sum(matrix[j][i]*(point[j]-pivot[j]) for j in range(3)) for i in range(3)]
    return all(c['origin'][i] < local[i] < c['origin'][i]+c['size'][i] for i in range(3))
print(json.dumps([len(cubes),hi[1],lo[0]-${cx},hi[0]-${cx},lo[2]-${cz},hi[2]-${cz}, not any(covers_bore(c) for c in cubes)]))`),
        );
        expect(result[0]).toBe(209);
        expect(result[1]).toBeCloseTo(30.95);
        for (const edge of result.slice(2, 6))
          expect(Math.abs(edge)).toBeLessThan(1.73);
        expect(result[6]).toBe(true);
      },
    ),
    { numRuns: 12 },
  );
}, 30_000);

it("maps the cast cup sides to a dark patch and keeps the taller head ring open", async () => {
  const result = JSON.parse(
    await python.run(`${setup}
kit = load_tool('camper_kit')
cubes = k.burner(16,32,0)
cast = [c for c in cubes if abs(c['origin'][1]-30.06) < 1e-6]
head = [c for c in cubes if abs(c['origin'][1]-30.515) < 1e-6]
print(json.dumps([len(cast),len(head),all(c['uv']['north'] != kit.ATLAS.face('grille') for c in cast),all(abs(c['size'][1]-.22)<1e-6 for c in head)]))`),
  );
  expect(result).toEqual([12, 24, true, true]);
});
