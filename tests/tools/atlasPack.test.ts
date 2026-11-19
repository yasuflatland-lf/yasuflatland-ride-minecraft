import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = async (script: string, cases: unknown) =>
  JSON.parse(
    await python.run(
      `import json, sys
sys.path.insert(0, 'tools')
sys.path.insert(0, 'tests/tools/helpers')
from tool_loader import load_tool
from reference_pack import reference_pack
m = load_tool('atlas_pack')
cases = json.loads(input())
${script}`,
      JSON.stringify(cases),
    ),
  );

const side = fc.integer({ min: 1, max: 64 });
const packCase = fc.record({
  sizes: fc.array(fc.tuple(side, side), { minLength: 1, maxLength: 40 }),
  gutter: fc.integer({ min: 0, max: 2 }),
  maxSide: fc.option(fc.integer({ min: 1, max: 256 }), { nil: null }),
});
const compare = `def outcome(call):
    try:
        return call()
    except ValueError as error:
        return str(error)
results = []
for case in cases:
    gutter, limit = case['gutter'], case['maxSide']
    sizes = tuple(m.Size(w + gutter, h + gutter) for w,h in case['sizes'])
    def actual():
        result = m.search(m.PackRequest(sizes, gutter, limit))
        return result.size, result.origins
    results.append([outcome(actual), outcome(lambda: reference_pack(sizes, gutter, limit))])
print(json.dumps(results))`;

const expectEquivalent = async (cases: unknown) => {
  for (const [actual, expected] of await run(compare, cases)) {
    expect(actual).toEqual(expected);
  }
};

describe("atlas packing", () => {
  it("preserves the tuple packer's layouts and bounded failures", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(packCase, { minLength: 2, maxLength: 2 }),
        expectEquivalent,
      ),
      { numRuns: 8 },
    );
  });

  it("preserves the tuple packer's layouts for 200 to 400 rectangles", async () => {
    const largeSide = fc.constantFrom(2, 4, 8);
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(largeSide, largeSide), {
          minLength: 200,
          maxLength: 400,
        }),
        (sizes) => expectEquivalent([{ sizes, gutter: 0, maxSide: 128 }]),
      ),
      { numRuns: 2 },
    );
  });

  it("preserves exact limits, impossible fits, equal-size ties and forty-item orders", async () => {
    await expectEquivalent([
      { sizes: [[64, 64]], gutter: 2, maxSide: 64 },
      { sizes: [[64, 64]], gutter: 0, maxSide: 63 },
      {
        sizes: Array.from({ length: 40 }, () => [8, 8]),
        gutter: 1,
        maxSide: null,
      },
      {
        sizes: [
          [12, 12],
          [12, 12],
          [12, 12],
        ],
        gutter: 0,
        maxSide: 24,
      },
    ]);
  });
});

const rect = fc.tuple(
  fc.integer({ min: -64, max: 64 }),
  fc.integer({ min: -64, max: 64 }),
  side,
  side,
);

it("preserves overlap symmetry, containment and edge contact for positive rectangles", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.tuple(rect, rect), { minLength: 20, maxLength: 20 }),
      async (cases) => {
        expect(
          await run(
            `for first, second in cases:
    a, b = m.Rect(*first), m.Rect(*second)
    assert a.overlaps(b) == b.overlaps(a)
    assert a.contains(a) and a.overlaps(a)
    assert not a.contains(b) or a.overlaps(b)
    inner = m.Rect(a.x, a.y, 1, 1)
    assert a.contains(inner) and a.overlaps(inner)
    assert not a.overlaps(m.Rect(a.x + a.w, a.y, b.w, b.h))
    assert not a.overlaps(m.Rect(a.x, a.y + a.h, b.w, b.h))
    assert not a.contains(m.Rect(a.x, a.y, a.w + 1, a.h))
    assert not a.contains(m.Rect(a.x, a.y, a.w, a.h + 1))
print(json.dumps(True))`,
            cases,
          ),
        ).toBe(true);
      },
    ),
    { numRuns: 10 },
  );
});
