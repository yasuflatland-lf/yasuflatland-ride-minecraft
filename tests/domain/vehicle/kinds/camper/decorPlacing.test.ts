import fc from "fast-check";
import { expect, it } from "vitest";
import {
  forward,
  leftOf,
  type Vec3,
} from "../../../../../src/domain/shared/vec";
import { HANGING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import {
  cellTaken,
  DECOR_CELLS,
  DECOR_SLOTS,
  HOSTED_DECOR_SPOTS,
  overCell,
} from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  nearestFreeSlot,
  pressedSlots,
  slotForPress,
  slotPoint,
  slotsAt,
  slotsFor,
} from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import {
  CAMPER_FURNITURE,
  DECOR_SPOTS,
  type DecorSlot,
  type LocalCell,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  decorCells,
  decorSlotCell,
  decorSpotOffset,
  parkPose,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/index";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { defined } from "../../../../support/defined";

const SLOTS = CAMPER_FURNITURE.flatMap((f) =>
  f.slots.map((slot) => ({ kind: f.kind, slot })),
);
const STOVE_IDS = ["stove", "stove_rear", "stove_wall", "stove_wall_rear"];
const location = fc.record({
  x: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
});
const yaw = fc.double({ min: -720, max: 720, noNaN: true });
const pose = fc.tuple(location, yaw).map(([l, y]) => parkPose(l, y));
const gear = fc.constantFrom(...CAMPING_GEAR_IDS);
const ids = (slots: readonly { id: string }[]) => slots.map((s) => s.id);
const squared = (a: Vec3, b: Vec3) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
const localKey = (c: LocalCell) => `${c.x},${c.z},${c.layer}`;
const sameCell = (a: DecorSlot, b: DecorSlot) =>
  localKey(a.cell) === localKey(b.cell);
const overKey = (s: DecorSlot) => localKey(s.over ?? s.cell);
// The slots of the furniture under a press on `slot`'s host cell: those drawn over that cell
// or over the furniture of a slot hosted in it (ADR 0108).
const pressedOf = (slot: DecorSlot) => {
  const overs = new Set([
    localKey(slot.cell),
    ...DECOR_SLOTS.filter((s) => sameCell(s, slot)).map(overKey),
  ]);
  return DECOR_SLOTS.filter((s) => overs.has(overKey(s)));
};
// A slot is free while no slot of its cell holds decor (ADR 0107).
const freeOf = (taken: readonly DecorSlot[]) => (s: DecorSlot) =>
  !taken.some((t) => sameCell(t, s));
// The nearest slot to `point`, the first one on a tie, written out separately from the code.
const nearestOf = (
  p: ReturnType<typeof parkPose>,
  slots: readonly DecorSlot[],
  point: Vec3,
) =>
  slots.reduce<DecorSlot | undefined>(
    (best, s) =>
      best === undefined ||
      squared(slotPoint(p, s), point) < squared(slotPoint(p, best), point)
        ? s
        : best,
    undefined,
  );

const slotNamed = (id: string) =>
  defined(
    SLOTS.find(({ slot }) => slot.id === id),
    id,
  ).slot;

it("accepts a standing item on every slot but the ceiling hook and a hanging item only on the hook (ADR 0097)", () => {
  fc.assert(
    fc.property(gear, (id) => {
      const hanging = HANGING_GEAR_IDS.has(id);
      expect(slotsFor(id)).toEqual(
        DECOR_SLOTS.filter((slot) => (slot.hanging === true) === hanging),
      );
    }),
  );
  expect(ids(slotsFor("macrame_planter"))).toEqual(["ceiling_hook"]);
  expect(ids(slotsFor("cushion"))).toEqual(
    ids(DECOR_SLOTS.filter((s) => s.id !== "ceiling_hook")),
  );
  expect(slotsFor("percolator")).toHaveLength(15);
  expect(slotsFor("constructor")).toEqual([]);
  expect(slotsFor("stone")).toEqual([]);
});

it("gives the stove one slot per burner in one cell, each shelf board and the table two slots over their cell, and every other furniture one slot per cell (ADR 0107, 0108)", () => {
  expect(SLOTS.map((s) => s.slot)).toEqual(DECOR_SLOTS);
  expect(SLOTS).toHaveLength(16);
  const of = (kind: string) =>
    SLOTS.filter((s) => s.kind === kind).map(({ slot }) => slot);
  const stove = of("stove");
  expect(ids(stove)).toEqual(STOVE_IDS);
  expect(stove.map((s) => s.spot)).toEqual([1, 2, 3, 4]);
  expect(new Set(stove.map((s) => localKey(s.cell))).size).toBe(1);
  const shelf = of("shelf");
  expect(ids(shelf)).toEqual([
    "shelf_low",
    "shelf_low_front",
    "shelf_high",
    "shelf_high_front",
  ]);
  expect(shelf.map((s) => s.spot)).toEqual([5, 6, 5, 6]);
  const table = of("table");
  expect(ids(table)).toEqual(["table", "table_aisle"]);
  expect(table.map((s) => s.spot)).toEqual([7, 8]);
  for (const [a, b] of [
    [shelf[0], shelf[1]],
    [shelf[2], shelf[3]],
    [table[0], table[1]],
  ] as const) {
    const first = defined(a, "first of a pair");
    const second = defined(b, "second of a pair");
    expect(overKey(second)).toBe(localKey(first.cell));
    expect(first.over).toBeUndefined();
    expect(sameCell(first, second)).toBe(false);
  }
  const others = SLOTS.filter(
    ({ kind }) => !["stove", "shelf", "table"].includes(kind),
  ).map(({ slot }) => slot);
  expect(others.every((s) => s.spot === undefined)).toBe(true);
  const singles = [...others, ...shelf, ...table, ...stove.slice(0, 1)];
  expect(new Set(singles.map((s) => localKey(s.cell))).size).toBe(
    singles.length,
  );
  expect(DECOR_SPOTS[0]).toEqual({ left: 0, forward: 0 });
  expect(DECOR_SPOTS).toHaveLength(9);
});

it("lists every slot cell once with its slots in slot order (ADR 0107)", () => {
  expect(DECOR_CELLS.flatMap(({ slots }) => slots)).toEqual(DECOR_SLOTS);
  expect(new Set(DECOR_CELLS.map(({ cell }) => localKey(cell))).size).toBe(
    DECOR_CELLS.length,
  );
  expect(DECOR_CELLS).toHaveLength(13);
  for (const { cell, slots } of DECOR_CELLS)
    for (const s of slots) expect(s.cell).toEqual(cell);
});

it("counts a slot taken when any slot of its cell holds decor, and ignores unknown slots (ADR 0107)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...DECOR_SLOTS),
      fc.subarray([...DECOR_SLOTS]),
      fc.array(fc.string()),
      (slot, taken, unknown) => {
        const decor = [
          ...unknown
            .filter((id) => !DECOR_SLOTS.some((s) => s.id === id))
            .map((id) => ({ slot: id, item: "mug_pair" })),
          ...taken.map((s) => ({ slot: s.id, item: "mug_pair" })),
        ];
        expect(cellTaken(slot, decor)).toBe(!freeOf(taken)(slot));
      },
    ),
  );
});

it("moves a spot by its left and forward pixels along the snapped yaw's left and forward (ADR 0107)", () => {
  fc.assert(
    fc.property(
      yaw,
      fc.integer({ min: 0, max: DECOR_SPOTS.length - 1 }),
      (y, spot) => {
        const snapped = parkPose({ x: 0, y: 0, z: 0 }, y).yaw;
        const f = forward(snapped);
        const l = leftOf(f);
        const { left, forward: ahead } = defined(DECOR_SPOTS[spot], "spot");
        const o = decorSpotOffset(snapped, spot);
        expect(o.x * f.x + o.z * f.z).toBeCloseTo(ahead / 16, 9);
        expect(o.x * l.x + o.z * l.z).toBeCloseTo(left / 16, 9);
        // The offset reaches at most into a neighbor of the host cell (ADR 0108).
        expect(Math.abs(o.x)).toBeLessThan(1);
        expect(Math.abs(o.z)).toBeLessThan(1);
      },
    ),
  );
  expect(decorSpotOffset(0, 99)).toEqual({ x: 0, z: 0 });
});

it("puts each slot's point at its spot on its surface and lays its decor in its cell with its spot", () => {
  fc.assert(
    fc.property(pose, (p) => {
      for (const { slot } of SLOTS) {
        const c = decorSlotCell(p, slot);
        const o = decorSpotOffset(p.yaw, slot.spot ?? 0);
        expect(slotPoint(p, slot)).toEqual({
          x: c.x + 0.5 + o.x,
          y: c.y + slot.height / 16,
          z: c.z + 0.5 + o.z,
        });
        const laid = defined(
          decorCells(p, [{ slot: slot.id, item: "potted_plant" }])[0],
          "decor cell",
        );
        expect({ x: laid.x, y: laid.y, z: laid.z }).toEqual(c);
        expect(laid.block.spot).toBe(slot.spot ?? 0);
        expect(laid.block.height).toBe(slot.height);
      }
    }),
  );
});

it("lays one decor block per cell, the first placement in it (ADR 0107)", () => {
  fc.assert(
    fc.property(
      pose,
      fc.shuffledSubarray([...DECOR_SLOTS]),
      gear,
      (p, slots, item) => {
        const laid = decorCells(
          p,
          slots.map((s) => ({ slot: s.id, item })),
        );
        expect(new Set(laid.map(cellKey)).size).toBe(laid.length);
        const firsts = slots.filter(
          (s, i) => slots.findIndex((t) => sameCell(t, s)) === i,
        );
        expect(laid.map((c) => c.block.spot)).toEqual(
          firsts.map((s) => s.spot ?? 0),
        );
      },
    ),
  );
});

it("finds the slots at each slot cell and none elsewhere", () => {
  fc.assert(
    fc.property(pose, (p) => {
      for (const { slot } of SLOTS)
        expect(slotsAt(p, decorSlotCell(p, slot))).toEqual(
          DECOR_SLOTS.filter((s) => sameCell(s, slot)),
        );
      const first = decorSlotCell(p, defined(SLOTS[0], "first slot").slot);
      expect(slotsAt(p, { x: first.x, y: first.y + 5, z: first.z })).toEqual(
        [],
      );
    }),
  );
});

it("picks the nearest free accepting slot, the first one on a tie, and none when all are taken", () => {
  const offset = fc.double({ min: -6, max: 6, noNaN: true });
  fc.assert(
    fc.property(
      pose,
      gear.chain((id) => fc.tuple(fc.constant(id), fc.subarray(slotsFor(id)))),
      fc.tuple(offset, offset, offset),
      (p, [id, taken], [dx, dy, dz]) => {
        const decor = taken.map((s) => ({ slot: s.id, item: id }));
        const point = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        const free = slotsFor(id).filter(freeOf(taken));
        expect(nearestFreeSlot(p, id, decor, point)).toBe(
          nearestOf(p, free, point),
        );
      },
    ),
  );
});

it("prefers the pressed furniture's free slot nearest the hit point when it accepts the item, else the nearest free slot (ADR 0097, 0105, 0108)", () => {
  const offset = fc.double({ min: -6, max: 6, noNaN: true });
  fc.assert(
    fc.property(
      pose,
      gear.chain((id) => fc.tuple(fc.constant(id), fc.subarray(slotsFor(id)))),
      fc.constantFrom(...SLOTS),
      fc.tuple(offset, offset, offset),
      (p, [id, taken], { slot }, [dx, dy, dz]) => {
        const decor = taken.map((s) => ({ slot: s.id, item: id }));
        const point = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        const cell = decorSlotCell(p, slot);
        const nearest = nearestFreeSlot(p, id, decor, point);
        const pressed = slotsFor(id)
          .filter((s) => pressedOf(slot).includes(s))
          .filter(freeOf(taken));
        expect(slotForPress(p, id, decor, cell, point, false)).toBe(
          pressed.length > 0 ? nearestOf(p, pressed, point) : nearest,
        );
        const first = decorSlotCell(p, defined(SLOTS[0], "first slot").slot);
        expect(
          slotForPress(
            p,
            id,
            decor,
            { ...first, y: first.y + 5 },
            point,
            false,
          ),
        ).toBe(nearest);
      },
    ),
  );
});

it("with an exact press returns the pressed slot when it accepts the item and is free, else nothing, never another slot (ADR 0104)", () => {
  const offset = fc.double({ min: -6, max: 6, noNaN: true });
  fc.assert(
    fc.property(
      pose,
      gear.chain((id) => fc.tuple(fc.constant(id), fc.subarray(slotsFor(id)))),
      fc.constantFrom(...SLOTS),
      fc.tuple(offset, offset, offset),
      (p, [id, taken], { slot }, [dx, dy, dz]) => {
        const decor = taken.map((s) => ({ slot: s.id, item: id }));
        const point = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        const cell = decorSlotCell(p, slot);
        const pressed = slotsFor(id)
          .filter((s) => pressedOf(slot).includes(s))
          .filter(freeOf(taken));
        expect(slotForPress(p, id, decor, cell, point, true)).toBe(
          nearestOf(p, pressed, point),
        );
        expect(
          slotForPress(p, id, decor, { ...cell, y: cell.y + 100 }, point, true),
        ).toBeUndefined();
      },
    ),
  );
});

it("names both slots of a shelf board or the table for a press on the furniture or either item, and a cell's own slots elsewhere (ADR 0108)", () => {
  fc.assert(
    fc.property(pose, (p) => {
      for (const { slot } of SLOTS)
        expect(pressedSlots(p, decorSlotCell(p, slot))).toEqual(
          pressedOf(slot),
        );
      const first = decorSlotCell(p, defined(SLOTS[0], "first slot").slot);
      expect(pressedSlots(p, { ...first, y: first.y + 5 })).toEqual([]);
    }),
  );
  const pairs = [
    ["shelf_low", "shelf_low_front"],
    ["shelf_high", "shelf_high_front"],
    ["table", "table_aisle"],
  ];
  const p = parkPose({ x: 0, y: 64, z: 0 }, 90);
  for (const pair of pairs)
    for (const id of pair)
      expect(ids(pressedSlots(p, decorSlotCell(p, slotNamed(id))))).toEqual(
        pair,
      );
  expect(overCell(slotNamed("table_aisle"))).toEqual(slotNamed("table").cell);
  expect([...HOSTED_DECOR_SPOTS]).toEqual([8, 6]);
  expect(overCell(slotNamed("table"))).toEqual(slotNamed("table").cell);
});

it("puts an item pressed on a shelf board or the table at the end nearest the hit point, and on the other end once that one is taken, in every facing (ADR 0108)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90),
      fc.constantFrom(
        ["shelf_low", "shelf_low_front"],
        ["shelf_low_front", "shelf_low"],
        ["shelf_high", "shelf_high_front"],
        ["shelf_high_front", "shelf_high"],
        ["table", "table_aisle"],
        ["table_aisle", "table"],
      ),
      fc.tuple(
        fc.double({ min: -0.1, max: 0.1, noNaN: true }),
        fc.double({ min: -0.1, max: 0.1, noNaN: true }),
      ),
      (y, [id, partnerId], [dx, dz]) => {
        const p = parkPose({ x: 0, y: 64, z: 0 }, y);
        const slot = slotNamed(id);
        const partner = slotNamed(partnerId);
        const at = slotPoint(p, slot);
        const point = { x: at.x + dx, y: at.y, z: at.z + dz };
        // The furniture block lies in the cell of the pair's slot that is not hosted elsewhere.
        const furniture = decorSlotCell(p, slot.over ? partner : slot);
        expect(slotForPress(p, "book_stack", [], furniture, point, false)).toBe(
          slot,
        );
        const taken = [{ slot: id, item: "mug_pair" }];
        for (const cell of [furniture, decorSlotCell(p, slot)])
          expect(slotForPress(p, "book_stack", taken, cell, point, false)).toBe(
            partner,
          );
      },
    ),
  );
});

it("puts a potted plant on the high shelf when it is pressed, though the low shelf is nearer the hit point", () => {
  const p = parkPose({ x: 0, y: 64, z: 0 }, 0);
  const high = slotNamed("shelf_high");
  const low = slotNamed("shelf_low");
  expect(
    slotForPress(
      p,
      "potted_plant",
      [],
      decorSlotCell(p, high),
      slotPoint(p, low),
      false,
    ),
  ).toBe(high);
});

it("puts an item pressed on the stove on the burner nearest the hit point, in every facing (ADR 0107)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90),
      fc.constantFrom(...STOVE_IDS),
      fc.tuple(
        fc.double({ min: -0.1, max: 0.1, noNaN: true }),
        fc.double({ min: -0.1, max: 0.1, noNaN: true }),
      ),
      (y, id, [dx, dz]) => {
        const p = parkPose({ x: 0, y: 64, z: 0 }, y);
        const burner = slotNamed(id);
        const at = slotPoint(p, burner);
        expect(
          slotForPress(
            p,
            "saucepan",
            [],
            decorSlotCell(p, burner),
            { x: at.x + dx, y: at.y, z: at.z + dz },
            false,
          ),
        ).toBe(burner);
      },
    ),
  );
});

it("takes no second item on the stove while any burner holds one (ADR 0107)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90),
      fc.constantFrom(...STOVE_IDS),
      fc.constantFrom(...STOVE_IDS),
      (y, held, pressedId) => {
        const p = parkPose({ x: 0, y: 64, z: 0 }, y);
        const decor = [{ slot: held, item: "percolator" }];
        const pressed = slotNamed(pressedId);
        const point = slotPoint(p, pressed);
        const chosen = slotForPress(
          p,
          "toaster",
          decor,
          decorSlotCell(p, pressed),
          point,
          false,
        );
        expect(STOVE_IDS).not.toContain(chosen?.id);
        expect(chosen).toBe(nearestFreeSlot(p, "toaster", decor, point));
        expect(
          slotForPress(
            p,
            "toaster",
            decor,
            decorSlotCell(p, pressed),
            point,
            true,
          ),
        ).toBeUndefined();
      },
    ),
  );
});

it("sends a standing item pressed on the ceiling hook to the nearest free standing slot (ADR 0097)", () => {
  const p = parkPose({ x: 0, y: 64, z: 0 }, 0);
  const hook = slotNamed("ceiling_hook");
  const table = slotNamed("table");
  expect(
    slotForPress(
      p,
      "mug_pair",
      [],
      decorSlotCell(p, hook),
      slotPoint(p, hook),
      false,
    ),
  ).toBe(table);
});
