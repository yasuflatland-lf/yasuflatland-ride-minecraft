import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellOf } from "../../../../src/domain/shared/cells";
import { relayCells } from "../../../../src/domain/shared/laidCells";
import {
  type DockCell,
  sameBlock,
} from "../../../../src/domain/vehicle/dock/floor";
import type { CamperRoomBlock } from "../../../../src/domain/vehicle/kinds/camper/roomBlocks";
import { decorItemId } from "../../../support/decorIds";

const decorBlock = fc.record({
  type: fc.constant("decor" as const),
  item: fc.constantFrom("potted_plant", "percolator").map(decorItemId),
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
    ...(end0 === undefined ? {} : { end0: decorItemId(end0) }),
    ...(end1 === undefined ? {} : { end1: decorItemId(end1) }),
  }));
const furnitureHeight = fc.integer({ min: 0, max: 15 });
const drawersBlock = fc
  .record({
    face: fc.constantFrom(0 as const, 1 as const, 2 as const, 3 as const),
    height: fc.constantFrom(10, 16),
    counter: pairEnd,
  })
  .map(({ counter, ...rest }) => ({
    type: "drawers" as const,
    ...rest,
    ...(counter === undefined ? {} : { counter: decorItemId(counter) }),
  }));
const showerToiletFace = fc.constantFrom(0, 1, 2, 3);
const block: fc.Arbitrary<CamperRoomBlock> = fc.oneof(
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
  drawersBlock,
);
it("changes only the door when its open state changes", () => {
  const floor: DockCell<CamperRoomBlock> = {
    ...cellOf({ x: 0, y: 0, z: 0 }),
    block: { type: "floor" },
  };
  const door: DockCell<CamperRoomBlock> = {
    ...cellOf({ x: 1, y: 0, z: 0 }),
    block: { type: "door", face: 1, open: true },
  };
  const closed: DockCell<CamperRoomBlock> = {
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

  it("tells drawer blocks apart by face, height, and counter decor", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(drawersBlock, drawersBlock),
          drawersBlock.map((a) => [a, { ...a }] as const),
        ),
        block,
        ([a, b], other) => {
          expect(sameBlock(a, b)).toBe(
            a.face === b.face &&
              a.height === b.height &&
              a.counter === b.counter,
          );
          if (other.type !== "drawers") expect(sameBlock(a, other)).toBe(false);
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

const primitive = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
);
const fields = fc.dictionary(
  fc.string().filter((key) => key !== "type" && key !== "extra"),
  primitive,
);

describe("generic block equality", () => {
  it("compares primitive own fields regardless of insertion order", () => {
    fc.assert(
      fc.property(fc.string(), fields, primitive, (type, values, extra) => {
        const a = { type, ...values };
        const b = {
          ...Object.fromEntries(Object.entries(values).reverse()),
          type,
        };
        expect(sameBlock(a, b)).toBe(true);
        expect(sameBlock(a, { ...b, extra })).toBe(false);
        expect(sameBlock({ ...a, extra }, b)).toBe(false);
        expect(
          sameBlock({ ...a, extra }, { ...b, extra: extra !== true }),
        ).toBe(false);
      }),
    );
  });

  it("ignores inherited fields and compares symbol keys", () => {
    fc.assert(
      fc.property(primitive, (value) => {
        const key = Symbol();
        const a = { type: "test", [key]: value };
        const b = { type: "test" };
        Object.setPrototypeOf(b, { [key]: value });
        expect(sameBlock(b, { type: "test" })).toBe(true);
        expect(sameBlock(a, b)).toBe(false);
        expect(sameBlock(a, { type: "test", [Symbol()]: value })).toBe(false);
      }),
    );
  });
});
