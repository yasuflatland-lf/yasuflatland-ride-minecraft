import fc from "fast-check";
import { expect, it } from "vitest";
import { cellKey } from "../../../../../src/domain/shared/cells";
import {
  forward,
  leftOf,
  type Vec3,
} from "../../../../../src/domain/shared/vec";
import { decorFace } from "../../../../../src/domain/vehicle/dock/decor";
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
  STORAGE_DOORS,
  type StorageDoorId,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  compartmentCells,
  decorCells,
  decorSlotCell,
  decorSpotOffset,
  parkPose,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/index";
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
const localKey = (c: LocalCell) => `${c.x},${c.z},${c.layer}`;
const sameCell = (a: DecorSlot, b: DecorSlot) =>
  localKey(a.cell) === localKey(b.cell);
// A slot is free while no slot of its cell holds decor (ADR 0107), or on a shelf board or the
// table, while its own end holds none (ADR 0108).
const freeOf = (taken: readonly DecorSlot[]) => (s: DecorSlot) =>
  !taken.some((t) => (s.pair ? t.id === s.id : sameCell(t, s)));
const PAIR_IDS = [
  "table",
  "table_aisle",
  "cabinet_sink_rear",
  "cabinet_sink_front",
  "cabinet_stove_rear",
  "cabinet_stove_front",
  "fridge_bottom_rear",
  "fridge_bottom_front",
  "fridge_top_rear",
  "fridge_top_front",
];
const DOORS: readonly StorageDoorId[] = STORAGE_DOORS.map(({ id }) => id);
const unitOf = (door: StorageDoorId) =>
  defined(
    STORAGE_DOORS.find((d) => d.id === door),
    door,
  ).unit;
// The block a compartment lays, written out per unit: the fridge's carries its floor's height
// (ADR 0114, 0123).
const compartmentBlock = (
  door: StorageDoorId,
  face: number,
  open: boolean,
  height: number,
  ends: Record<string, string>,
) =>
  unitOf(door).pairKind === "fridge"
    ? { type: "fridge", face, height, open, ...ends }
    : { type: "cabinet", face, open, ...ends };
const openDoors = fc
  .subarray([...DOORS])
  .map((doors) => new Set<StorageDoorId>(doors));
// A slot behind a storage door takes items only while that door is open (ADR 0114, 0121).
const reachable = (open: ReadonlySet<StorageDoorId>) => (s: DecorSlot) =>
  s.door === undefined || open.has(s.door);
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
        DECOR_SLOTS.filter(
          (slot) =>
            (slot.hanging === true) === hanging && slot.door === undefined,
        ),
      );
    }),
  );
  expect(ids(slotsFor("macrame_planter"))).toEqual(["ceiling_hook"]);
  expect(ids(slotsFor("cushion"))).toEqual(
    ids(DECOR_SLOTS.filter((s) => s.id !== "ceiling_hook" && !s.door)),
  );
  expect(slotsFor("percolator")).toHaveLength(8);
  expect(slotsFor("percolator", new Set(DOORS))).toHaveLength(16);
  expect(slotsFor("constructor")).toEqual([]);
  expect(slotsFor("stone")).toEqual([]);
});

it("takes standing items behind an open cabinet door and none behind a shut one, never a hanging item (ADR 0114)", () => {
  fc.assert(
    fc.property(gear, openDoors, (id, open) => {
      expect(slotsFor(id, open)).toEqual(
        DECOR_SLOTS.filter(
          (slot) =>
            (slot.hanging === true) === HANGING_GEAR_IDS.has(id) &&
            reachable(open)(slot),
        ),
      );
    }),
  );
  expect(ids(slotsFor("mug_pair", new Set<StorageDoorId>(["stove"])))).toEqual([
    ...ids(slotsFor("mug_pair")),
    "cabinet_stove_rear",
    "cabinet_stove_front",
  ]);
  expect(ids(slotsFor("macrame_planter", new Set(DOORS)))).toEqual([
    "ceiling_hook",
  ]);
});

it("gives the stove one slot in its cell middle and every other furniture one slot per cell but the table's or a storage compartment's two ends, keeping the burner spots (ADR 0107, 0108, 0112, 0114, 0123)", () => {
  expect(SLOTS.map((s) => s.slot)).toEqual(DECOR_SLOTS);
  expect(SLOTS).toHaveLength(17);
  const stove = SLOTS.filter(({ kind }) => kind === "stove").map(
    ({ slot }) => slot,
  );
  expect(ids(stove)).toEqual(["stove"]);
  const pairs = PAIR_IDS.map(slotNamed);
  expect(pairs.map((s) => [s.spot, s.pair])).toEqual([
    [7, { kind: "table", end: 0 }],
    [8, { kind: "table", end: 1 }],
    [5, { kind: "cabinet", end: 0 }],
    [6, { kind: "cabinet", end: 1 }],
    [5, { kind: "cabinet", end: 0 }],
    [6, { kind: "cabinet", end: 1 }],
    [5, { kind: "fridge", end: 0 }],
    [6, { kind: "fridge", end: 1 }],
    [5, { kind: "fridge", end: 0 }],
    [6, { kind: "fridge", end: 1 }],
  ]);
  for (let i = 0; i < pairs.length; i += 2)
    expect(
      sameCell(defined(pairs[i], "end 0"), defined(pairs[i + 1], "end 1")),
    ).toBe(true);
  const others = SLOTS.filter(({ slot }) => !PAIR_IDS.includes(slot.id)).map(
    ({ slot }) => slot,
  );
  expect(others.every((s) => s.spot === undefined && !s.pair)).toBe(true);
  expect(
    new Set(
      [...others, ...pairs.filter((_, i) => i % 2 === 0)].map((s) =>
        localKey(s.cell),
      ),
    ).size,
  ).toBe(others.length + pairs.length / 2);
  expect(DECOR_SPOTS[0]).toEqual({ left: 0, forward: 0 });
  // ADR 0107's burner spots stay, so the decor blocks' spot values and the pair ends' indexes
  // after them keep their meaning (ADR 0108, 0112).
  expect(DECOR_SPOTS).toHaveLength(9);
});

it("lists every slot cell once with its slots in slot order (ADR 0107)", () => {
  expect(DECOR_CELLS.flatMap(({ slots }) => slots)).toEqual(DECOR_SLOTS);
  expect(new Set(DECOR_CELLS.map(({ cell }) => localKey(cell))).size).toBe(
    DECOR_CELLS.length,
  );
  expect(DECOR_CELLS).toHaveLength(12);
  for (const { cell, slots } of DECOR_CELLS)
    for (const s of slots) expect(s.cell).toEqual(cell);
});

it("counts a slot taken when any slot of its cell holds decor, or on a shelf board or the table its own end, and ignores unknown slots (ADR 0107, 0108)", () => {
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
        const decor = [{ slot: slot.id, item: "potted_plant" }];
        if (slot.door !== undefined) {
          // A storage compartment is laid by compartmentCells, not as decor (ADR 0114, 0121).
          expect(decorCells(p, decor)).toEqual([]);
          const compartment = defined(
            compartmentCells(p, decor, new Set()).find(
              (cell) => cellKey(cell) === cellKey(c),
            ),
            "compartment cell",
          );
          expect(compartment.block).toEqual(
            compartmentBlock(slot.door, decorFace(p.yaw), false, slot.height, {
              [`end${slot.pair?.end}`]: "potted_plant",
            }),
          );
          continue;
        }
        const laid = defined(decorCells(p, decor)[0], "decor cell");
        expect({ x: laid.x, y: laid.y, z: laid.z }).toEqual(c);
        expect(laid.block).toEqual(
          slot.pair
            ? {
                type: "decorPair",
                pair: slot.pair.kind,
                face: laid.block.face,
                height: slot.height,
                [`end${slot.pair.end}`]: "potted_plant",
              }
            : {
                type: "decor",
                item: "potted_plant",
                face: laid.block.face,
                height: slot.height,
                spot: slot.spot ?? 0,
              },
        );
      }
    }),
  );
});

it("lays one block per cell: the first placement in it, or the pair block with the item at each end of a shelf board or the table, leaving the cabinet to compartmentCells (ADR 0107, 0108, 0114)", () => {
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
          (s, i) =>
            s.door === undefined &&
            slots.findIndex((t) => sameCell(t, s)) === i,
        );
        expect(laid.map((c) => c.block)).toEqual(
          firsts.map((s) => {
            if (!s.pair)
              return {
                type: "decor",
                item,
                face: decorFace(p.yaw),
                height: s.height,
                spot: s.spot ?? 0,
              };
            const ends = slots.filter((t) => sameCell(t, s));
            return {
              type: "decorPair",
              pair: s.pair.kind,
              face: decorFace(p.yaw),
              height: s.height,
              ...Object.fromEntries(
                ends.map((t) => [`end${t.pair?.end}`, item]),
              ),
            };
          }),
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

it("puts a potted plant in the open fridge's top compartment when it is pressed, though the bottom one is nearer the hit point (ADR 0123)", () => {
  const p = parkPose({ x: 0, y: 64, z: 0 }, 0);
  const top = slotNamed("fridge_top_rear");
  const bottom = slotNamed("fridge_bottom_rear");
  expect(
    slotForPress(
      p,
      "potted_plant",
      [],
      decorSlotCell(p, top),
      slotPoint(p, bottom),
      false,
      undefined,
      new Set<StorageDoorId>(["fridge_top", "fridge_bottom"]),
    ),
  ).toBe(top);
});

it("puts an item pressed anywhere on the stove top on its one burner in the middle, in every facing (ADR 0112)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90),
      fc.tuple(
        fc.double({ min: -0.5, max: 0.5, noNaN: true }),
        fc.double({ min: -0.5, max: 0.5, noNaN: true }),
      ),
      (y, [dx, dz]) => {
        const p = parkPose({ x: 0, y: 64, z: 0 }, y);
        const stove = slotNamed("stove");
        const cell = decorSlotCell(p, stove);
        const at = slotPoint(p, stove);
        expect(at.x).toBe(cell.x + 0.5);
        expect(at.z).toBe(cell.z + 0.5);
        expect(
          slotForPress(
            p,
            "saucepan",
            [],
            cell,
            { x: at.x + dx, y: at.y, z: at.z + dz },
            false,
          ),
        ).toBe(stove);
      },
    ),
  );
});

it("takes no second item on the stove while it holds one (ADR 0107, 0112)", () => {
  fc.assert(
    fc.property(fc.constantFrom(0, 90, 180, -90), (y) => {
      const p = parkPose({ x: 0, y: 64, z: 0 }, y);
      const decor = [{ slot: "stove", item: "percolator" }];
      const pressed = slotNamed("stove");
      const point = slotPoint(p, pressed);
      const chosen = slotForPress(
        p,
        "toaster",
        decor,
        decorSlotCell(p, pressed),
        point,
        false,
      );
      expect(chosen?.id).not.toBe("stove");
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
    }),
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

it("measures each slot where the descending line of sight crosses its height, and a slot level with or above the eye from the pressed point (ADR 0110)", () => {
  const offset = fc.double({ min: -6, max: 6, noNaN: true });
  // Where the ray from `eye` through `point` drops to `h`, as a fraction of the drop to `point`.
  const seen = (eye: Vec3, point: Vec3, h: number): Vec3 => {
    if (point.y >= eye.y || h >= eye.y) return point;
    const k = (eye.y - h) / (eye.y - point.y);
    return {
      x: eye.x + k * (point.x - eye.x),
      y: h,
      z: eye.z + k * (point.z - eye.z),
    };
  };
  fc.assert(
    fc.property(
      pose,
      gear.chain((id) => fc.tuple(fc.constant(id), fc.subarray(slotsFor(id)))),
      fc.tuple(offset, offset, offset),
      fc.tuple(offset, offset, offset),
      (p, [id, taken], [dx, dy, dz], [ex, ey, ez]) => {
        const decor = taken.map((s) => ({ slot: s.id, item: id }));
        const point = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        const eye = { x: p.x + ex, y: p.y + ey, z: p.z + ez };
        const gap = (s: DecorSlot) => {
          const at = slotPoint(p, s);
          return squared(at, seen(eye, point, at.y));
        };
        const expected = slotsFor(id)
          .filter(freeOf(taken))
          .reduce<DecorSlot | undefined>(
            (best, s) => (best === undefined || gap(s) < gap(best) ? s : best),
            undefined,
          );
        expect(nearestFreeSlot(p, id, decor, point, eye)).toBe(expected);
      },
    ),
  );
});

it("puts a saucepan on the stove's one burner for the side-face press logged in #431, with or without the eye (ADR 0110, 0112)", () => {
  // The stove cell is (320, -59, -520). The line of sight entered the furniture block's
  // west face 0.207 above the cell bottom; with four burners the pressed point alone picked
  // stove_rear (ADR 0110).
  const p = parkPose({ x: 319.5, y: -60, z: -521.5 }, 180);
  const cell = { x: 320, y: -59, z: -520 };
  const point = { x: 320, y: -59 + 0.207, z: -520 + 0.648 };
  const eye = { x: 319.67, y: -57.48, z: -520.19 };
  expect(decorSlotCell(p, slotNamed("stove"))).toEqual(cell);
  expect(slotForPress(p, "saucepan", [], cell, point, false)?.id).toBe("stove");
  expect(slotForPress(p, "saucepan", [], cell, point, false, eye)?.id).toBe(
    "stove",
  );
});

it("lays a compartment block in every compartment, full or empty, with each end's item, showing them only behind the doors in `shown` (ADR 0114, 0123)", () => {
  const cabinetSlots = DECOR_SLOTS.filter((s) => s.door !== undefined);
  fc.assert(
    fc.property(
      pose,
      fc.subarray(cabinetSlots),
      gear,
      openDoors,
      (p, taken, item, shown) => {
        const decor = taken.map((s) => ({ slot: s.id, item }));
        const laid = compartmentCells(p, decor, shown);
        expect(laid).toHaveLength(DOORS.length);
        for (const door of DOORS) {
          const ends = cabinetSlots.filter((s) => s.door === door);
          const at = decorSlotCell(p, defined(ends[0], "end"));
          const cell = defined(
            laid.find((c) => cellKey(c) === cellKey(at)),
            door,
          );
          expect(cell.block).toEqual(
            compartmentBlock(
              door,
              decorFace(p.yaw),
              shown.has(door),
              defined(ends[0], "end").height,
              Object.fromEntries(
                ends
                  .filter((s) => taken.includes(s))
                  .map((s) => [`end${s.pair?.end}`, item]),
              ),
            ),
          );
        }
      },
    ),
  );
});

it("sends gear pressed on a shut compartment to the nearest free slot elsewhere, and on an open one to its free end nearest the press (ADR 0114)", () => {
  const offset = fc.double({ min: -6, max: 6, noNaN: true });
  const cabinetSlots = DECOR_SLOTS.filter((s) => s.door !== undefined);
  fc.assert(
    fc.property(
      pose,
      fc.constantFrom(...cabinetSlots),
      fc.subarray(DECOR_SLOTS.filter((s) => !s.hanging)),
      openDoors,
      fc.tuple(offset, offset, offset),
      (p, slot, taken, open, [dx, dy, dz]) => {
        const decor = taken.map((s) => ({ slot: s.id, item: "mug_pair" }));
        const point = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
        const cell = decorSlotCell(p, slot);
        const chosen = slotForPress(
          p,
          "mug_pair",
          decor,
          cell,
          point,
          false,
          undefined,
          open,
        );
        const pressed = DECOR_SLOTS.filter(
          (s) => sameCell(s, slot) && reachable(open)(s),
        ).filter(freeOf(taken));
        expect(chosen).toBe(
          pressed.length > 0
            ? nearestOf(p, pressed, point)
            : nearestFreeSlot(p, "mug_pair", decor, point, undefined, open),
        );
        if (chosen?.door !== undefined)
          expect(open.has(chosen.door)).toBe(true);
      },
    ),
  );
});
