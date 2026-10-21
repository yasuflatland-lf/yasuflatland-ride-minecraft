import fc from "fast-check";
import { expect, it } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { HANGING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  nearestFreeSlot,
  slotAt,
  slotForPress,
  slotPoint,
  slotsFor,
} from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { CAMPER_FURNITURE } from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  decorCells,
  decorSlotCell,
  parkPose,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/index";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { defined } from "../../../../support/defined";

const SLOTS = CAMPER_FURNITURE.flatMap((f) =>
  f.slots.map((slot) => ({ kind: f.kind, slot })),
);
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

it("accepts a standing item on every slot but the ceiling hook and a hanging item only on the hook (ADR 0097)", () => {
  fc.assert(
    fc.property(gear, (id) => {
      const hanging = HANGING_GEAR_IDS.has(id);
      expect(slotsFor(id)).toEqual(
        SLOTS.filter(({ slot }) => (slot.hanging === true) === hanging).map(
          ({ slot }) => slot,
        ),
      );
    }),
  );
  expect(ids(slotsFor("macrame_planter"))).toEqual(["ceiling_hook"]);
  expect(ids(slotsFor("cushion"))).toEqual(
    ids(DECOR_SLOTS.filter((s) => s.id !== "ceiling_hook")),
  );
  expect(slotsFor("percolator")).toHaveLength(11);
  expect(slotsFor("constructor")).toEqual([]);
  expect(slotsFor("stone")).toEqual([]);
});

it("lists the slots in DECOR_SLOTS order, each at a distinct cell, with its point at the middle of its surface", () => {
  expect(SLOTS.map((s) => s.slot)).toEqual(DECOR_SLOTS);
  expect(SLOTS).toHaveLength(12);
  fc.assert(
    fc.property(pose, (p) => {
      const cells = SLOTS.map(({ slot }) => decorSlotCell(p, slot));
      expect(new Set(cells.map(cellKey)).size).toBe(cells.length);
      for (const { slot } of SLOTS) {
        const c = decorSlotCell(p, slot);
        expect(slotPoint(p, slot)).toEqual({
          x: c.x + 0.5,
          y: c.y + slot.height / 16,
          z: c.z + 0.5,
        });
        const laid = defined(
          decorCells(p, [{ slot: slot.id, item: "potted_plant" }])[0],
          "decor cell",
        );
        expect({ x: laid.x, y: laid.y, z: laid.z }).toEqual(c);
      }
    }),
  );
});

it("finds the slot at each slot cell and none elsewhere", () => {
  fc.assert(
    fc.property(pose, (p) => {
      for (const { slot } of SLOTS)
        expect(slotAt(p, decorSlotCell(p, slot))).toBe(slot);
      const first = decorSlotCell(p, defined(SLOTS[0], "first slot").slot);
      expect(slotAt(p, { x: first.x, y: first.y + 5, z: first.z })).toBe(
        undefined,
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
        const free = slotsFor(id).filter((s) => !taken.includes(s));
        const result = nearestFreeSlot(p, id, decor, point);
        if (free.length === 0) {
          expect(result).toBeUndefined();
          return;
        }
        const chosen = defined(result, "chosen slot");
        expect(free).toContain(chosen);
        const distance = squared(slotPoint(p, chosen), point);
        for (const other of free)
          expect(distance).toBeLessThanOrEqual(
            squared(slotPoint(p, other), point),
          );
        for (const earlier of free.slice(0, free.indexOf(chosen)))
          expect(distance).toBeLessThan(squared(slotPoint(p, earlier), point));
      },
    ),
  );
});

const slotNamed = (id: string) =>
  defined(
    SLOTS.find(({ slot }) => slot.id === id),
    id,
  ).slot;

it("prefers the pressed slot when it accepts the item and is free, else the nearest free slot (ADR 0097)", () => {
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
        const takes =
          slotsFor(id).includes(slot) && !taken.some((s) => s.id === slot.id);
        expect(slotForPress(p, id, decor, cell, point)).toBe(
          takes ? slot : nearest,
        );
        const first = decorSlotCell(p, defined(SLOTS[0], "first slot").slot);
        expect(
          slotForPress(p, id, decor, { ...first, y: first.y + 5 }, point),
        ).toBe(nearest);
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
    ),
  ).toBe(high);
});

it("puts a cushion on the stove when the stove is pressed and free (ADR 0097)", () => {
  const p = parkPose({ x: 0, y: 64, z: 0 }, 0);
  const stove = slotNamed("stove");
  expect(
    slotForPress(
      p,
      "cushion",
      [],
      decorSlotCell(p, stove),
      slotPoint(p, stove),
    ),
  ).toBe(stove);
});

it("sends a standing item pressed on the ceiling hook, or on a taken slot, to the nearest free standing slot (ADR 0097)", () => {
  const p = parkPose({ x: 0, y: 64, z: 0 }, 0);
  const hook = slotNamed("ceiling_hook");
  const table = slotNamed("table");
  expect(
    slotForPress(p, "mug_pair", [], decorSlotCell(p, hook), slotPoint(p, hook)),
  ).toBe(table);
  const stove = slotNamed("stove");
  const decor = [{ slot: "stove", item: "percolator" }];
  const chosen = slotForPress(
    p,
    "toaster",
    decor,
    decorSlotCell(p, stove),
    slotPoint(p, stove),
  );
  expect(chosen).toBe(
    nearestFreeSlot(p, "toaster", decor, slotPoint(p, stove)),
  );
  expect(chosen?.id).not.toBe("stove");
});
