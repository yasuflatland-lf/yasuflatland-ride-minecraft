import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { DECOR_SLOTS } from "../../../../src/domain/vehicle/kinds/camper/decor";
import {
  slotForPress,
  slotPoint,
} from "../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import {
  decorSlotCell,
  parkPose,
} from "../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPING_GEAR_IDS } from "../../../../src/domain/vehicle/kinds/index";
import {
  type PressedShape,
  pressedHeight,
  pressedShape,
} from "../../../../src/infrastructure/vehicle/bedrock/faceHeight";
import {
  CAMPER_BED_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_WALL_BLOCK,
  decorBlockId,
  pairDecorBlockId,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { defined } from "../../../support/defined";

const SIDES = ["North", "South", "East", "West"] as const;
const FACES = ["Up", "Down", ...SIDES] as const;
const reported = fc.double({ min: 0, max: 1, noNaN: true });
const fraction = fc.double({ min: 0, max: 1, noNaN: true });
const shape: fc.Arbitrary<PressedShape> = fc.oneof(
  fc.constant(undefined),
  fc.tuple(fraction, fraction).map(([a, b]) => ({
    kind: "room" as const,
    bottom: Math.min(a, b),
    top: Math.max(a, b),
  })),
  fraction.map((lift) => ({ kind: "decor" as const, lift })),
);

it("turns a side-face press upside down whatever the block (ADR 0111)", () => {
  fc.assert(
    fc.property(fc.constantFrom(...SIDES), reported, shape, (face, y, s) => {
      expect(pressedHeight(face, y, s)).toBe(1 - y);
    }),
  );
});

it("puts an Up or Down press on a room block on its box top or bottom, whatever was reported (ADR 0111)", () => {
  fc.assert(
    fc.property(reported, fraction, fraction, (y, a, b) => {
      const s = {
        kind: "room" as const,
        bottom: Math.min(a, b),
        top: Math.max(a, b),
      };
      expect(pressedHeight("Up", y, s)).toBe(s.top);
      expect(pressedHeight("Down", y, s)).toBe(s.bottom);
    }),
  );
});

it("adds a decor block's lift to its turned Up-face press, and turns every press on an unknown block (ADR 0111)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...FACES),
      reported,
      fraction,
      (face, y, lift) => {
        const decor = { kind: "decor" as const, lift };
        expect(pressedHeight(face, y, decor)).toBe(
          face === "Up" ? lift + (1 - y) : 1 - y,
        );
        expect(pressedHeight(face, y, undefined)).toBe(1 - y);
      },
    ),
  );
});

it("gives the furniture block its box per height and every decor block its lift (ADR 0097, 0111)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 15 }),
      fc.constantFrom(...CAMPING_GEAR_IDS),
      (h, item) => {
        expect(pressedShape(CAMPER_FURNITURE_BLOCK, h)).toEqual({
          kind: "room",
          bottom: 0,
          top: h / 16,
        });
        expect(pressedShape(decorBlockId(item), h)).toEqual({
          kind: "decor",
          lift: h / 16,
        });
      },
    ),
  );
  expect(pressedShape(decorBlockId("saucepan"), undefined)).toEqual({
    kind: "decor",
    lift: 0,
  });
  expect(pressedShape(CAMPER_FURNITURE_BLOCK, undefined)).toBeUndefined();
  expect(pressedShape(CAMPER_WALL_BLOCK, undefined)).toBeUndefined();
  // A pair block is lifted by its height state, or the table's, which has none, by the
  // table's one slot height (ADR 0108).
  for (const h of [4, 10])
    expect(pressedShape(pairDecorBlockId("shelf"), h)).toEqual({
      kind: "decor",
      lift: h / 16,
    });
  expect(pressedShape(pairDecorBlockId("table"), undefined)).toEqual({
    kind: "decor",
    lift: 12 / 16,
  });
  expect(pressedShape("minecraft:stone", undefined)).toBeUndefined();
});

type Box = { origin: [number, number, number]; size: [number, number, number] };
const blockFile = (typeId: string) =>
  JSON.parse(
    readFileSync(
      `packs/yasu_ride_bp/blocks/yasu_ride/${typeId.split(":")[1]}.block.json`,
      "utf8",
    ),
  )["minecraft:block"];
// Every selection box a block file declares, with the permutation condition it sits under.
const selectionBoxes = (typeId: string): { condition: string; box: Box }[] => {
  const block = blockFile(typeId);
  const all = [
    { condition: "", components: block.components },
    ...(block.permutations ?? []),
  ];
  return all
    .map(({ condition, components }) => ({
      condition,
      box: components["minecraft:selection_box"],
    }))
    .filter(({ box }) => box !== undefined && box !== false);
};
const vertical = ({ origin, size }: Box) => ({
  kind: "room",
  bottom: origin[1] / 16,
  top: (origin[1] + size[1]) / 16,
});

it("keeps each room block's box top and bottom in step with its block file (ADR 0111)", () => {
  for (const typeId of [
    CAMPER_FLOOR_BLOCK,
    CAMPER_DOOR_BLOCK,
    CAMPER_SHOWER_TOILET_BLOCK,
    CAMPER_BED_BLOCK,
    CAMPER_CEILING_BLOCK,
  ]) {
    const boxes = selectionBoxes(typeId);
    expect(boxes.length, typeId).toBeGreaterThan(0);
    for (const { box } of boxes)
      expect(pressedShape(typeId, undefined), typeId).toEqual(vertical(box));
  }
  expect(selectionBoxes(CAMPER_WALL_BLOCK)).toEqual([]);
  const furniture = selectionBoxes(CAMPER_FURNITURE_BLOCK);
  expect(furniture).toHaveLength(16);
  for (const { condition, box } of furniture) {
    const h = Number(/== (\d+)/.exec(condition)?.[1]);
    expect(pressedShape(CAMPER_FURNITURE_BLOCK, h), condition).toEqual(
      vertical(box),
    );
  }
});

// The camper of the presses logged for #434 faced 180, with its stove cell at (320, -59, -520).
const pose = parkPose({ x: 319.5, y: -60, z: -521.5 }, 180);
const stoveCell = { x: 320, y: -59, z: -520 };
const loggedEye = {
  x: 318.9638671875,
  y: -57.47998809814453,
  z: -520.3090209960938,
};
const STOVE = DECOR_SLOTS.filter((s) => s.id.startsWith("stove"));
const pressAt = (
  cell: { x: number; y: number; z: number },
  face: string,
  at: { x: number; y: number; z: number },
  s: PressedShape,
) => ({
  x: cell.x + at.x,
  y: cell.y + pressedHeight(face, at.y, s),
  z: cell.z + at.z,
});

it("puts a saucepan on the burner under the logged Up-face press on the stove (#434, ADR 0111)", () => {
  for (const s of STOVE) expect(decorSlotCell(pose, s)).toEqual(stoveCell);
  const stoveTop = pressedShape(CAMPER_FURNITURE_BLOCK, 15);
  const face = { z: 0.1502685546875, y: 0.0625, x: 0.75244140625 };
  const point = pressAt(stoveCell, "Up", face, stoveTop);
  expect(point.y).toBe(-59 + 15 / 16);
  expect(
    slotForPress(pose, "saucepan", [], stoveCell, point, false, loggedEye)?.id,
  ).toBe("stove_wall");
  // The reported y alone put the point 0.875 below the top, and the aisle burner won.
  const raw = { x: point.x, y: -59 + face.y, z: point.z };
  expect(
    slotForPress(pose, "saucepan", [], stoveCell, raw, false, loggedEye)?.id,
  ).toBe("stove");
});

it("keeps the logged west-face press on the stove on the aisle-side burner (#434, ADR 0111)", () => {
  const face = { z: 0.3963623046875, y: 0.20313644409179688, x: 0 };
  const point = pressAt(
    stoveCell,
    "West",
    face,
    pressedShape(CAMPER_FURNITURE_BLOCK, 15),
  );
  expect(point.y).toBeCloseTo(-59 + 0.797, 3);
  expect(
    slotForPress(pose, "saucepan", [], stoveCell, point, false, loggedEye)?.id,
  ).toBe("stove");
});

it("puts the logged Up-face presses on the table top and the floor top (#434, ADR 0111)", () => {
  const table = { x: 318, y: -59, z: -522 };
  const onTable = pressAt(
    table,
    "Up",
    { z: 0.49951171875, y: 0.25, x: 0.24188232421875 },
    pressedShape(CAMPER_FURNITURE_BLOCK, 12),
  );
  expect(onTable.y).toBe(-59 + 0.75);
  expect(slotForPress(pose, "saucepan", [], table, onTable, false)?.id).toBe(
    "table",
  );
  const floor = { x: 320, y: -60, z: -520 };
  const onFloor = pressAt(
    floor,
    "Up",
    { z: 0.134033203125, y: 0, x: 0.30279541015625 },
    pressedShape(CAMPER_FLOOR_BLOCK, undefined),
  );
  expect(onFloor.y).toBe(-59);
});

it("puts a saucepan on the burner nearest any Up-face press on the stove, from any eye above it (ADR 0110, 0111)", () => {
  const top = pressedShape(CAMPER_FURNITURE_BLOCK, 15);
  fc.assert(
    fc.property(
      fraction,
      reported,
      fraction,
      fc.tuple(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: 0.1, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
      ),
      (x, y, z, [ex, ey, ez]) => {
        const point = pressAt(stoveCell, "Up", { x, y, z }, top);
        const eye = { x: point.x + ex, y: point.y + ey, z: point.z + ez };
        const gap = (id: string) => {
          const p = slotPoint(
            pose,
            defined(
              STOVE.find((s) => s.id === id),
              id,
            ),
          );
          return (p.x - point.x) ** 2 + (p.z - point.z) ** 2;
        };
        const picked = defined(
          slotForPress(pose, "saucepan", [], stoveCell, point, false, eye),
          "picked slot",
        );
        for (const s of STOVE)
          expect(gap(picked.id)).toBeLessThanOrEqual(gap(s.id));
      },
    ),
  );
});
