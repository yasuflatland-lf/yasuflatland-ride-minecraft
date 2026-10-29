import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AIR,
  blockStateOf,
  sameBlockState,
} from "../../../src/domain/build/blockState";
import {
  type Box,
  boxOf,
  cellsOf,
  chunksOf,
  contains,
  edgePoints,
  translate,
  volume,
} from "../../../src/domain/build/box";
import {
  selectionBox,
  withCorner,
} from "../../../src/domain/build/selection/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";

const coord = fc.integer({ min: -50, max: 50 });
const cell = fc.record({ x: coord, y: coord, z: coord });
const smallCell = fc.record({
  x: fc.integer({ min: 0, max: 7 }),
  y: fc.integer({ min: 0, max: 7 }),
  z: fc.integer({ min: 0, max: 7 }),
});
const smallBox = fc.tuple(smallCell, smallCell).map(([a, b]) => boxOf(a, b));
const keys = (cells: Iterable<{ x: number; y: number; z: number }>) =>
  [...cells].map(cellKey).sort();

describe("Box", () => {
  it("is built the same from either corner, with min <= max", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const box = boxOf(a, b);
        expect(box).toEqual(boxOf(b, a));
        expect(box.min.x).toBeLessThanOrEqual(box.max.x);
        expect(box.min.y).toBeLessThanOrEqual(box.max.y);
        expect(box.min.z).toBeLessThanOrEqual(box.max.z);
      }),
    );
  });

  it("counts its cells as its volume, and contains each of them", () => {
    fc.assert(
      fc.property(smallBox, (box) => {
        const cells = [...cellsOf(box)];
        expect(cells.length).toBe(volume(box));
        expect(cells.every((c) => contains(box, c))).toBe(true);
      }),
    );
  });

  it("walks y outermost, then z, then x", () => {
    const cells = [
      ...cellsOf(boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 })),
    ];
    expect(cells[1]).toEqual({ x: 1, y: 0, z: 0 });
    expect(cells[2]).toEqual({ x: 0, y: 0, z: 1 });
    expect(cells[4]).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("splits into disjoint chunks within the limit that cover the box", () => {
    fc.assert(
      fc.property(
        smallBox,
        fc.integer({ min: 1, max: 100 }),
        (box, maxCells) => {
          const chunks = chunksOf(box, maxCells);
          expect(chunks.every((c) => volume(c) <= maxCells)).toBe(true);
          expect(keys(chunks.flatMap((c) => [...cellsOf(c)]))).toEqual(
            keys(cellsOf(box)),
          );
        },
      ),
    );
  });

  it("keeps its volume when translated", () => {
    fc.assert(
      fc.property(smallBox, cell, (box, by) => {
        expect(volume(translate(box, by))).toBe(volume(box));
      }),
    );
  });

  it("returns at most maxPoints edge points, all on an edge of the box", () => {
    const onEdge = (box: Box, c: { x: number; y: number; z: number }) => {
      const extremes =
        Number(c.x === box.min.x || c.x === box.max.x) +
        Number(c.y === box.min.y || c.y === box.max.y) +
        Number(c.z === box.min.z || c.z === box.max.z);
      return contains(box, c) && extremes >= 2;
    };
    fc.assert(
      fc.property(
        smallBox,
        fc.integer({ min: 0, max: 40 }),
        (box, maxPoints) => {
          const points = edgePoints(box, maxPoints);
          expect(new Set(points.map(cellKey)).size).toBe(points.length);
          expect(points.length).toBeLessThanOrEqual(maxPoints);
          expect(points.every((p) => onEdge(box, p))).toBe(true);
        },
      ),
    );
  });
});

describe("edgePoints coverage", () => {
  it("returns every distinct edge cell when the limit is not reached", () => {
    fc.assert(
      fc.property(smallBox, (box) => {
        const expected = [...cellsOf(box)].filter((c) => {
          const extremes =
            Number(c.x === box.min.x || c.x === box.max.x) +
            Number(c.y === box.min.y || c.y === box.max.y) +
            Number(c.z === box.min.z || c.z === box.max.z);
          return extremes >= 2;
        });
        expect(keys(edgePoints(box, 10_000))).toEqual(keys(expected));
      }),
    );
  });

  it("samples a huge box without walking its edges", () => {
    const box = boxOf({ x: 0, y: 0, z: 0 }, { x: 1_000_000_000, y: 5, z: 5 });
    expect(edgePoints(box, 512).length).toBe(512);
  });
});

describe("BlockState", () => {
  it("sorts and freezes its state keys, including __proto__", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 4 }).map((k) => `k${k}`),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        ),
        (states) => {
          const state = blockStateOf("a:b", states);
          expect(Object.keys(state.states)).toEqual(Object.keys(states).sort());
          expect(Object.isFrozen(state)).toBe(true);
          expect(Object.isFrozen(state.states)).toBe(true);
        },
      ),
    );
    const parsed = JSON.parse('{"__proto__":1}');
    expect(Object.keys(blockStateOf("a:b", parsed).states)).toEqual([
      "__proto__",
    ]);
  });

  it("ignores the order of state keys", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 4 }),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        ),
        (states) => {
          const reversed = Object.fromEntries(Object.entries(states).reverse());
          expect(
            sameBlockState(
              blockStateOf("a:b", states),
              blockStateOf("a:b", reversed),
            ),
          ).toBe(true);
        },
      ),
    );
  });

  it("tells different types and values apart", () => {
    expect(sameBlockState(blockStateOf("a:b"), blockStateOf("a:c"))).toBe(
      false,
    );
    expect(
      sameBlockState(
        blockStateOf("a:b", { k: 1 }),
        blockStateOf("a:b", { k: 2 }),
      ),
    ).toBe(false);
    expect(
      sameBlockState(blockStateOf("a:b", { k: 1 }), blockStateOf("a:b")),
    ).toBe(false);
  });
});

describe("BUILD_SPEC", () => {
  it("lets a copy fit inside an edit", () => {
    expect(BUILD_SPEC.maxCopyVolume).toBeLessThanOrEqual(BUILD_SPEC.maxVolume);
  });

  it("names air with no states", () => {
    expect(AIR).toEqual({ typeId: "minecraft:air", states: {} });
  });
});

describe("Selection", () => {
  const overworld = asDimensionId("minecraft:overworld");
  const nether = asDimensionId("minecraft:nether");

  it("drops the other corner when a corner lands in a new dimension", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const first = withCorner(undefined, "pos1", overworld, a);
        const moved = withCorner(first, "pos2", nether, b);
        expect(moved).toEqual({ dimensionId: nether, pos2: b });
      }),
    );
  });

  it("has a box exactly when both corners are set", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const one = withCorner(undefined, "pos1", overworld, a);
        expect(selectionBox(undefined)).toBeUndefined();
        expect(selectionBox(one)).toBeUndefined();
        expect(selectionBox(withCorner(one, "pos2", overworld, b))).toEqual(
          boxOf(a, b),
        );
      }),
    );
  });
});
