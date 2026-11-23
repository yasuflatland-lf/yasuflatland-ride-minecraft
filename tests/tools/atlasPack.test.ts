import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = async (script: string, cases: unknown) =>
  JSON.parse(
    await python.run(
      `import json, os, sys
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('atlas_pack')
cases = json.loads(input())
${script}`,
      JSON.stringify(cases),
    ),
  );

const side = fc.integer({ min: 1, max: 64 });
const smallSide = fc.constantFrom(2, 4, 8);
const smallRect = fc.tuple(smallSide, smallSide);
const packCase = fc.record({
  sizes: fc.array(fc.tuple(side, side), { minLength: 1, maxLength: 40 }),
  gutter: fc.integer({ min: 0, max: 2 }),
  maxSide: fc.option(fc.integer({ min: 1, max: 256 }), { nil: null }),
});

describe("atlas packing", () => {
  it("adds seeded orders only for requests of at most 256 regions", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 300 }),
        fc.array(smallRect, { minLength: 1, maxLength: 12 }),
        async (count, sample) => {
          const [orders, randomOrders] = await run(
            `count, sample = cases
sizes = tuple(m.Size(*sample[i % len(sample)]) for i in range(count))
print(json.dumps([len(m.search_orders(sizes)), m.PACK_RANDOM_ORDERS]))`,
            [count, sample],
          );
          expect(orders).toBe(count <= 256 ? 5 + randomOrders : 5);
        },
      ),
      {
        numRuns: 16,
        examples: [
          [256, [[2, 2]]],
          [257, [[2, 2]]],
        ],
      },
    );
  });

  it("packs large requests deterministically within 10% of the full-effort area", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(smallRect, { minLength: 257, maxLength: 300 }),
        async (sizes) => {
          const valid = await run(
            `sizes = tuple(m.Size(*s) for s in cases)
request = m.PackRequest(sizes, 0, 128)
with patch.dict(os.environ, YASU_ATLAS_PACK_CACHE='0'):
    result = m.search(request)
    assert result == m.search(request)
width, height = result.size
assert width <= request.max_side and height <= request.max_side
assert len(result.origins) == len(sizes)
placed = []
for (x, y), (w, h) in zip(result.origins, sizes):
    assert 0 <= x <= width - w and 0 <= y <= height - h
    rect = m.Rect(x, y, w, h)
    assert not any(rect.overlaps(other) for other in placed)
    placed.append(rect)
with patch.object(m, 'FULL_SEARCH_MAX_REGIONS', len(sizes)), patch.dict(os.environ, YASU_ATLAS_PACK_CACHE='0'):
    ref_width, ref_height = m.search(request).size
print(json.dumps(width * height * 10 <= ref_width * ref_height * 11))`,
            sizes,
          );
          expect(valid).toBe(true);
        },
      ),
      { numRuns: 3 },
    );
  });
});

const runWithCache = (script: string, entry: unknown = null) =>
  run(
    `request = m.PackRequest((m.Size(6, 5), m.Size(5, 6)), 1, 16)
with TemporaryDirectory(dir='.') as directory:
    cache = Path(directory)
    with patch.object(m, 'PACK_CACHE_DIR', cache), patch.dict(os.environ, YASU_ATLAS_PACK_CACHE='1'):
        path = cache / (m.cache_key(request) + '.json')
${script}`,
    entry,
  );

describe("atlas packing cache", () => {
  it("returns the same PackResult on a miss and a hit", async () => {
    expect(
      await runWithCache(`        miss = m.search(request)
        assert path.is_file()
        with patch.object(m, '_search_uncached', side_effect=AssertionError('cache hit recomputed')):
            hit = m.search(request)
        assert type(hit) is m.PackResult
        assert type(hit.size) is tuple and type(hit.origins) is tuple
        assert all(type(origin) is tuple for origin in hit.origins)
        assert all(type(value) is int for pair in (hit.size, *hit.origins) for value in pair)
        print(json.dumps(hit == miss))`),
    ).toBe(true);
  });

  it("changes the key when a size, the gutter, or the maximum side changes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(packCase, { minLength: 10, maxLength: 10 }),
        async (cases) => {
          expect(
            await run(
              `for case in cases:
    gutter, limit = case['gutter'], case['maxSide']
    sizes = tuple(m.Size(w + gutter, h + gutter) for w, h in case['sizes'])
    request = m.PackRequest(sizes, gutter, limit)
    w, h = sizes[-1]
    key = m.cache_key(request)
    assert key == m.cache_key(replace(request))
    assert key != m.cache_key(replace(request, sizes=(*sizes[:-1], m.Size(w + 1, h))))
    assert key != m.cache_key(replace(request, gutter=gutter + 1))
    assert key != m.cache_key(replace(request, max_side=limit + 1 if limit is not None else 256))
print(json.dumps(True))`,
              cases,
            ),
          ).toBe(true);
        },
      ),
      { numRuns: 8 },
    );
  });

  it.each([
    ["malformed JSON", "{"],
    ["overlapping placements", '{"size":[11,11],"origins":[[0,0],[1,1]]}'],
    ["an out-of-bounds placement", '{"size":[11,11],"origins":[[0,0],[8,0]]}'],
    ["a missing origin", '{"size":[11,11],"origins":[[0,0]]}'],
  ])("ignores and rewrites an entry with %s", async (_name, entry) => {
    expect(
      await runWithCache(
        `        expected = m.search(request)
        original = json.loads(path.read_text())
        path.write_text(cases)
        assert m.search(request) == expected
        print(json.dumps(json.loads(path.read_text()) == original))`,
        entry,
      ),
    ).toBe(true);
  });

  it("bypasses reads and writes when the cache is disabled", async () => {
    expect(
      await runWithCache(`        expected = m.search(request)
        alternate = m.PackResult((11, 11), ((0, 0), (6, 0)))
        assert alternate != expected
        entry = json.dumps(dict(size=alternate.size, origins=alternate.origins))
        path.write_text(entry)
        assert m.search(request) == alternate
        with patch.dict(os.environ, YASU_ATLAS_PACK_CACHE='0'):
            assert m.search(request) == expected
            assert path.read_text() == entry
            path.unlink()
            assert m.search(request) == expected
            assert not list(cache.iterdir())
        print(json.dumps(True))`),
    ).toBe(true);
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
