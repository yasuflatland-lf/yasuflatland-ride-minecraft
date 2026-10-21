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
} from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  nearestFreeSlot,
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
  expect(slotsFor("percolator")).toHaveLength(12);
  expect(slotsFor("constructor")).toEqual([]);
  expect(slotsFor("stone")).toEqual([]);
});

it("gives the stove one slot per burner in one cell, keeping the stove id, and every other furniture one slot per cell (ADR 0107)", () => {
  expect(SLOTS.map((s) => s.slot)).toEqual(DECOR_SLOTS);
  expect(SLOTS).toHaveLength(13);
  const stove = SLOTS.filter(({ kind }) => kind === "stove").map(
    ({ slot }) => slot,
  );
  expect(ids(stove)).toEqual(STOVE_IDS);
  expect(stove.map((s) => s.spot)).toEqual([1, 2, 3, 4]);
  expect(new Set(stove.map((s) => localKey(s.cell))).size).toBe(1);
  const others = SLOTS.filter(({ kind }) => kind !== "stove").map(
    ({ slot }) => slot,
  );
  expect(others.every((s) => s.spot === undefined)).toBe(true);
  expect(
    new Set([...others, ...stove.slice(0, 1)].map((s) => localKey(s.cell)))
      .size,
  ).toBe(others.length + 1);
  expect(DECOR_SPOTS[0]).toEqual({ left: 0, forward: 0 });
  expect(DECOR_SPOTS).toHaveLength(5);
});

it("lists every slot cell once with its slots in slot order (ADR 0107)", () => {
  expect(DECOR_CELLS.flatMap(({ slots }) => slots)).toEqual(DECOR_SLOTS);
  expect(new Set(DECOR_CELLS.map(({ cell }) => localKey(cell))).size).toBe(
    DECOR_CELLS.length,
  );
  expect(DECOR_CELLS).toHaveLength(10);
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
        // The offset stays inside the cell's footprint for every face.
        expect(Math.abs(o.x)).toBeLessThan(0.5);
        expect(Math.abs(o.z)).toBeLessThan(0.5);
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

it("prefers the pressed cell's free slot nearest the hit point when it accepts the item, else the nearest free slot (ADR 0097, 0105)", () => {
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
          .filter((s) => sameCell(s, slot))
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
          .filter((s) => sameCell(s, slot))
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

// A point on the ray from `eye` through `aim`, `t` times as far from the eye as `aim`.
const along = (eye: Vec3, aim: Vec3, t: number): Vec3 => ({
  x: eye.x + (aim.x - eye.x) * t,
  y: eye.y + (aim.y - eye.y) * t,
  z: eye.z + (aim.z - eye.z) * t,
});
// An eye above the slot's surface, off its vertical so the ray cannot run through a slot stacked above.
const eyeOffset = fc
  .tuple(
    fc.double({ min: -3, max: 3, noNaN: true }),
    fc.double({ min: 0.05, max: 3, noNaN: true }),
    fc.double({ min: -3, max: 3, noNaN: true }),
  )
  .filter(([dx, , dz]) => Math.hypot(dx, dz) >= 0.05);

it("picks the slot the line of sight is aimed at, wherever along the ray the press lands, side faces included (ADR 0110)", () => {
  fc.assert(
    fc.property(
      pose,
      gear.chain((id) =>
        fc.tuple(fc.constant(id), fc.constantFrom(...slotsFor(id))),
      ),
      eyeOffset,
      fc.double({ min: 0.2, max: 3, noNaN: true }),
      (p, [id, target], [dx, dy, dz], t) => {
        const aim = slotPoint(p, target);
        const eye = { x: aim.x + dx, y: aim.y + dy, z: aim.z + dz };
        const point = along(eye, aim, t);
        expect(nearestFreeSlot(p, id, [], point, eye)).toBe(target);
        expect(
          slotForPress(p, id, [], decorSlotCell(p, target), point, false, eye),
        ).toBe(target);
      },
    ),
  );
});

it("measures from the pressed point as before when the line of sight does not descend (ADR 0110)", () => {
  const offset = fc.double({ min: -6, max: 6, noNaN: true });
  fc.assert(
    fc.property(
      pose,
      gear.chain((id) => fc.tuple(fc.constant(id), fc.subarray(slotsFor(id)))),
      fc.constantFrom(...SLOTS),
      fc.tuple(offset, offset, offset),
      fc.tuple(offset, fc.double({ min: 0, max: 6, noNaN: true }), offset),
      fc.boolean(),
      (p, [id, taken], { slot }, [dx, dy, dz], [ex, ey, ez], exact) => {
        const decor = taken.map((s) => ({ slot: s.id, item: id }));
        const point = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        const eye = { x: point.x + ex, y: point.y - ey, z: point.z + ez };
        const cell = decorSlotCell(p, slot);
        expect(slotForPress(p, id, decor, cell, point, exact, eye)).toBe(
          slotForPress(p, id, decor, cell, point, exact),
        );
      },
    ),
  );
});

it("puts a saucepan on the near aisle-side burner for the side-face press logged in #431 (ADR 0110)", () => {
  // The stove cell is (320, -59, -520). The line of sight entered the furniture block's
  // west face 0.207 above the cell bottom, and the pressed point alone picked stove_rear.
  const p = parkPose({ x: 319.5, y: -60, z: -521.5 }, 180);
  const cell = { x: 320, y: -59, z: -520 };
  const point = { x: 320, y: -59 + 0.207, z: -520 + 0.648 };
  const eye = { x: 319.67, y: -57.48, z: -520.19 };
  expect(decorSlotCell(p, slotNamed("stove"))).toEqual(cell);
  expect(slotForPress(p, "saucepan", [], cell, point, false)?.id).toBe(
    "stove_rear",
  );
  expect(slotForPress(p, "saucepan", [], cell, point, false, eye)?.id).toBe(
    "stove",
  );
});
