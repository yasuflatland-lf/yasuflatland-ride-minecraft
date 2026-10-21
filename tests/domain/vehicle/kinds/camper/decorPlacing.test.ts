import fc from "fast-check";
import { expect, it } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { CAMPING_GEAR } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  nearestFreeSlot,
  slotAt,
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

it("accepts an item on exactly the slots of its places, plus the wall cabinet for shelf items (ADR 0093)", () => {
  fc.assert(
    fc.property(gear, (id) => {
      const places = defined(CAMPING_GEAR.get(id), "places");
      expect(slotsFor(id)).toEqual(
        SLOTS.filter(
          ({ kind }) =>
            places.includes(kind) ||
            (kind === "wall_cabinet" && places.includes("shelf")),
        ).map(({ slot }) => slot),
      );
    }),
  );
  expect(ids(slotsFor("percolator"))).toEqual(["stove"]);
  expect(ids(slotsFor("macrame_planter"))).toEqual(["ceiling_hook"]);
  expect(new Set(ids(slotsFor("lava_lamp")))).toEqual(
    new Set([
      "shelf_low",
      "shelf_high",
      "wall_cabinet_front",
      "wall_cabinet_rear",
    ]),
  );
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
