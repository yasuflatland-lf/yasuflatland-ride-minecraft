import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { relayCells } from "../../../../src/domain/shared/laidCells";
import {
  type DockBlock,
  type DockCell,
  sameBlock,
} from "../../../../src/domain/vehicle/dock/floor";

const decorBlock = fc.record({
  type: fc.constant("decor" as const),
  item: fc.constantFrom("potted_plant", "percolator"),
  face: fc.constantFrom(0, 1, 2, 3),
  height: fc.integer({ min: 0, max: 15 }),
  spot: fc.integer({ min: 0, max: 4 }),
});
const pairEnd = fc.option(fc.constantFrom("cushion", "toaster"), {
  nil: undefined,
});
const decorPairBlock = fc
  .record({
    pair: fc.constantFrom("shelf" as const, "table" as const),
    face: fc.constantFrom(0 as const, 1 as const, 2 as const, 3 as const),
    height: fc.constantFrom(4, 10, 12),
    end0: pairEnd,
    end1: pairEnd,
  })
  .map(({ end0, end1, ...rest }) => ({
    type: "decorPair" as const,
    ...rest,
    ...(end0 === undefined ? {} : { end0 }),
    ...(end1 === undefined ? {} : { end1 }),
  }));
const furnitureHeight = fc.integer({ min: 0, max: 15 });
const showerToiletFace = fc.constantFrom(0, 1, 2, 3);
const block: fc.Arbitrary<DockBlock> = fc.oneof(
  fc.record({
    type: fc.constant("deck" as const),
    height: fc.integer({ min: 1, max: 16 }),
  }),
  fc.constant({ type: "floor" as const }),
  fc.constant({ type: "ceiling" as const }),
  fc.constant({ type: "bed" as const }),
  fc.constant({ type: "light" as const }),
  furnitureHeight.map((height) => ({ type: "furniture" as const, height })),
  fc.record({
    type: fc.constant("wall" as const),
    face: fc.constantFrom(0, 1, 2, 3),
  }),
  fc.record({
    type: fc.constant("door" as const),
    face: fc.constantFrom(0, 1, 2, 3),
    open: fc.boolean(),
  }),
  showerToiletFace.map((face) => ({ type: "showerToilet" as const, face })),
  showerToiletFace.map((face) => ({ type: "showerDoor" as const, face })),
  decorBlock,
  decorPairBlock,
);
it("changes only the door when its open state changes", () => {
  const floor: DockCell = { x: 0, y: 0, z: 0, block: { type: "floor" } };
  const door: DockCell = {
    x: 1,
    y: 0,
    z: 0,
    block: { type: "door", face: 1, open: true },
  };
  const closed: DockCell = {
    ...door,
    block: { type: "door", face: 1, open: false },
  };
  expect(relayCells([floor, door], [floor, closed], sameBlock)).toEqual({
    clear: [],
    place: [closed],
  });
});

describe("sameBlock", () => {
  it("is reflexive and symmetric and rejects different types", () => {
    fc.assert(
      fc.property(block, block, (a, b) => {
        expect(sameBlock(a, a)).toBe(true);
        expect(sameBlock(a, b)).toBe(sameBlock(b, a));
        if (a.type !== b.type) expect(sameBlock(a, b)).toBe(false);
      }),
    );
  });

  it("tells decor apart by item, face, height, and spot (ADR 0107)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(decorBlock, decorBlock),
          decorBlock.map((a) => [a, { ...a }] as const),
        ),
        ([a, b]) => {
          expect(sameBlock(a, b)).toBe(
            a.item === b.item &&
              a.face === b.face &&
              a.height === b.height &&
              a.spot === b.spot,
          );
        },
      ),
    );
  });

  it("tells pair blocks apart by furniture, face, height, and the item at each end (ADR 0108)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(decorPairBlock, decorPairBlock),
          decorPairBlock.map((a) => [a, { ...a }] as const),
        ),
        decorBlock,
        ([a, b], decor) => {
          expect(sameBlock(a, b)).toBe(
            a.pair === b.pair &&
              a.face === b.face &&
              a.height === b.height &&
              a.end0 === b.end0 &&
              a.end1 === b.end1,
          );
          expect(sameBlock(a, decor)).toBe(false);
        },
      ),
    );
  });

  it("tells shower-toilet blocks apart by face only (ADR 0098)", () => {
    fc.assert(
      fc.property(showerToiletFace, showerToiletFace, block, (a, b, other) => {
        const showerToilet = { type: "showerToilet", face: a } as const;
        expect(sameBlock(showerToilet, { type: "showerToilet", face: b })).toBe(
          a === b,
        );
        expect(sameBlock(showerToilet, other)).toBe(
          other.type === "showerToilet" && other.face === a,
        );
      }),
    );
  });

  it("tells shower door plates apart by face only (ADR 0118)", () => {
    fc.assert(
      fc.property(showerToiletFace, showerToiletFace, block, (a, b, other) => {
        const showerDoor = { type: "showerDoor", face: a } as const;
        expect(sameBlock(showerDoor, { type: "showerDoor", face: b })).toBe(
          a === b,
        );
        expect(sameBlock(showerDoor, other)).toBe(
          other.type === "showerDoor" && other.face === a,
        );
      }),
    );
  });

  it("tells furniture apart by height (ADR 0097)", () => {
    fc.assert(
      fc.property(
        furnitureHeight,
        furnitureHeight,
        decorBlock,
        (a, b, decor) => {
          const furniture = { type: "furniture", height: a } as const;
          expect(sameBlock(furniture, { type: "furniture", height: b })).toBe(
            a === b,
          );
          expect(sameBlock(furniture, decor)).toBe(false);
          expect(sameBlock(furniture, { type: "bed" })).toBe(false);
          expect(sameBlock({ type: "bed" }, furniture)).toBe(false);
        },
      ),
    );
  });
});
