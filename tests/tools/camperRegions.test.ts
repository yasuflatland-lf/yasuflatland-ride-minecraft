import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = async <T>(setup: string, expression: string): Promise<T> =>
  JSON.parse(
    await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('camper_regions')
${setup}
print(json.dumps(${expression}))`),
  );

describe("camper region registry", () => {
  it("packs deterministically without rotation, overlaps or out-of-bounds regions", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 50 }),
            fc.integer({ min: 1, max: 50 }),
          ),
          { minLength: 1, maxLength: 12 },
        ),
        fc.integer({ min: 0, max: 4 }),
        async (sizes, gutter) => {
          const [size, origins, again, errors] = await run<
            [number[], number[][], number[][], string[]]
          >(
            `r = m.RegionRegistry()
for i, (w, h) in enumerate(${JSON.stringify(sizes)}):
    r.register(m.Region(str(i), w, h, m.Material.WOOD, lambda x, y: (x, y, 17, 255)))
a = m.pack(r, ${gutter})
reverse = m.RegionRegistry()
for region in reversed(r.regions()): reverse.register(region)
b = m.pack(reverse, ${gutter})
assert a.size == b.size`,
            "[a.size, [a.origin(r.name) for r in r.regions()], [b.origin(r.name) for r in r.regions()], m.audit(b, m.render_atlas(b))]",
          );
          expect(origins).toEqual(again);
          expect(errors).toEqual([]);
          for (const [i, [x = -1, y = -1]] of origins.entries()) {
            const [w = 0, h = 0] = sizes[i] ?? [];
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x + w).toBeLessThanOrEqual(size[0] ?? 0);
            expect(y + h).toBeLessThanOrEqual(size[1] ?? 0);
            for (let j = 0; j < i; j++) {
              const [ox = 0, oy = 0] = origins[j] ?? [];
              const [ow = 0, oh = 0] = sizes[j] ?? [];
              expect(
                x + w + gutter <= ox ||
                  ox + ow + gutter <= x ||
                  y + h + gutter <= oy ||
                  oy + oh + gutter <= y,
              ).toBe(true);
            }
          }
        },
      ),
      { numRuns: 20 },
    );
  }, 60_000);

  it("resolves fractional UVs into their region after packing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 40 }),
        async (w, h) => {
          expect(
            await run(
              `r = m.RegionRegistry()
r.register(m.Region('other', 20, 30, m.Material.METAL, lambda x,y: (0,0,0,255)))
ref = r.register(m.Region('panel', ${w}, ${h}, m.Material.WOOD, lambda x,y: (0,0,0,255)))
a = m.pack(r)
x,y = a.origin('panel')
u,v = ref.uv(${w}/2, ${h}/4)`,
              `[u-x, v-y, m.audit(a, m.render_atlas(a))]`,
            ),
          ).toEqual([w / 2, h / 4, []]);
        },
      ),
      { numRuns: 20 },
    );
  }, 60_000);

  it("preserves the exact base rectangle and detects one changed byte", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
r.register(m.Region('base', 114, 220, m.Material.SWATCHES_MIXED, lambda x,y: (x, y, 42, 255)))
a = m.pack(r)
pixels = bytearray(m.render_atlas(a))
clean = m.audit(a, pixels)
pixels[0] ^= 1`,
        "[a.size, a.origin('base'), clean, m.audit(a, pixels)]",
      ),
    ).toEqual([[114, 220], [0, 0], [], ["base: pixel mismatch at (0, 0)"]]);
  });

  it("audits UV boundaries and rejects duplicate names and invalid dimensions", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
ref = r.register(m.Region('panel', 4, 3, m.Material.WOOD, lambda x,y: (0,0,0,255)))
errors = []
for call in [lambda: r.register(m.Region('panel', 1, 1, m.Material.WOOD, lambda x,y: (0,0,0,0))), lambda: r.register(m.Region('bad', 0, 1, m.Material.WOOD, lambda x,y: (0,0,0,0))), lambda: ref.uv(0,0), lambda: m.pack(r, -1)]:
    try: call()
    except ValueError: errors.append(True)
a = m.pack(r)
ref.uv(4,3)
ref.uv(-0.5,0)
ref.uv(float('nan'),0)`,
        "[len(errors), len(r.regions()), m.audit(a, m.render_atlas(a))]",
      ),
    ).toEqual([
      4,
      1,
      [
        "panel: UV outside region: (-0.5, 0)",
        "panel: UV outside region: (nan, 0)",
      ],
    ]);
  });
  it("renders the registered base without running the generator", async () => {
    expect(
      await run(
        "kit = load_tool('camper_kit')",
        "m.audit(kit.LAYOUT, m.render_atlas(kit.LAYOUT))",
      ),
    ).toEqual([]);
  });

  it("audits live geometry faces, including mirrored UV sizes", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
ref = r.register(m.Region('panel', 4, 3, m.Material.WOOD, lambda x,y: (0,0,0,255)))
a = m.pack(r)
face = {'uv': list(ref.uv(4,3)), 'uv_size': [-4,-3]}
a.bind_face('panel', face)
clean = m.audit(a, m.render_atlas(a))
face['uv_size'][0] = -5`,
        "[clean, m.audit(a, m.render_atlas(a))]",
      ),
    ).toEqual([[], ["panel: UV outside region: (-1, 0)"]]);
  });

  it("reports overlapping and out-of-bounds regions", async () => {
    expect(
      await run(
        `r = m.RegionRegistry()
for name in ('a','b'):
    r.register(m.Region(name, 2, 2, m.Material.WOOD, lambda x,y: (0,0,0,255)))
a = m.Layout(r.regions(), (2,2), {'a': (0,0), 'b': (0,0)})
overlap = m.audit(a, m.render_atlas(a))
a.size = (1,1)
bounds = m.audit(a, bytes(4))`,
        "[overlap, [s for s in bounds if 'outside atlas' in s]]",
      ),
    ).toEqual([["b: overlaps a"], ["a: outside atlas", "b: outside atlas"]]);
  });
});
