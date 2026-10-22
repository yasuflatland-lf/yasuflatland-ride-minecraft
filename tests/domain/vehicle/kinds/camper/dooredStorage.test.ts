// Storage with doors, over the camper's definitions and a test-only second unit shaped like
// the planned fridge: two doors hinged at the front, compartments in the shelf's cells, and
// plates in the aisle in the room's inside layers (ADR 0121).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward } from "../../../../../src/domain/shared/vec";
import { decorFace } from "../../../../../src/domain/vehicle/dock/decor";
import type { EngineCommand } from "../../../../../src/domain/vehicle/drive";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  type CompartmentLook,
  compartmentDoorAt,
  type DooredStorage,
  openPlateAt,
  type PlateLook,
  StorageDoors,
  type StorageSlot,
  storageDoors,
  storageFurniture,
  usableBehindDoor,
} from "../../../../../src/domain/vehicle/kinds/camper/dooredStorage";
import {
  CAMPER_FURNITURE,
  CAMPER_STORAGE,
  CEILING_LIGHTS,
  isStoragePairKind,
  type LocalCell,
  STORAGE_DOORS,
  WALL_CABINET,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  AIR,
  cargoCells,
  ceilingLightCells,
  compartmentCells,
  localCellAt,
  ownPlateBlock,
  parkCheckCells,
  roomCells,
  storagePlateCells,
  storagePlateChecks,
  storagePressTarget,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";

const SWING = CAMPER_SPEC.doorSwingTicks;

const looks: CompartmentLook[] = [];
const plateLooks: PlateLook[] = [];
const ends = (door: string, cell: LocalCell, height: number): StorageSlot[] =>
  ([0, 1] as const).map((end) => ({
    id: `${door}_${end}`,
    cell,
    height,
    spot: 5 + end,
    pair: { kind: "shelf", end },
    door,
  }));
// The pair kind is only compared, so any string does; "shelf" keeps the slot type valid.
const FRIDGE_LIKE: DooredStorage = {
  pairKind: "shelf",
  doors: [
    {
      id: "fridge_top",
      compartment: { x: -1, z: 1, layer: 2 },
      plate: { x: 0, z: 1, layer: 2 },
      hinge: 1,
      slots: ends("fridge_top", { x: -1, z: 1, layer: 2 }, 4),
    },
    {
      id: "fridge_bottom",
      compartment: { x: -1, z: 1, layer: 1 },
      plate: { x: 0, z: 1, layer: 1 },
      hinge: 1,
      slots: ends("fridge_bottom", { x: -1, z: 1, layer: 1 }, 3),
    },
  ],
  compartmentBlock: (look) => {
    looks.push(look);
    return { type: "cabinet", face: look.face, open: look.open };
  },
  plateBlock: (look) => {
    plateLooks.push(look);
    return { type: "cabinetDoor", face: look.face };
  },
  plateBlockName: "fridge_like_door",
};
const TWO_UNITS = storageDoors<string>([WALL_CABINET, FRIDGE_LIKE]);
const FURNITURE_BLOCK_CELLS = CAMPER_FURNITURE.flatMap((f) =>
  f.block ? f.cells : [],
);
// The cells of every slot outside storage: a plate there would cover a slot's decor.
const OPEN_SLOT_CELLS = DECOR_SLOTS.filter((s) => s.door === undefined).map(
  ({ cell }) => cell,
);
// The room's inside layers and the ceiling layer: the layers a plate is laid and read in.
const PLATE_LAYERS = [1, 2, 3];

const pose = fc
  .record({
    x: fc.integer({ min: -1000, max: 1000 }),
    y: fc.integer({ min: -60, max: 300 }),
    z: fc.integer({ min: -1000, max: 1000 }),
    yaw: fc.constantFrom(0, 90, 180, -90),
  })
  .map((p) => ({ ...p, x: p.x + 0.5, z: p.z + 0.5 }));
const openOf = (ids: readonly string[]) =>
  fc.subarray([...ids]).map((xs) => new Set(xs));
const ALL_IDS = TWO_UNITS.map(({ id }) => id);
const sameLocal = (a: LocalCell, b: LocalCell) =>
  a.x === b.x && a.z === b.z && a.layer === b.layer;

/**
 * What is wrong with `units` as the camper's storage: empty when door ids are unique, each
 * compartment and plate has a cell of its own clear of furniture blocks and open slots, each
 * plate stands in a layer the room lays and reads plates in, and each compartment holds ends 0
 * and 1 once, behind its door, of its unit's pair kind.
 */
function validateDooredStorage(units: readonly DooredStorage[]): string[] {
  const problems: string[] = [];
  const doors = storageDoors(units);
  const ids = doors.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) problems.push("door ids repeat");
  const cells = doors.flatMap(({ compartment, plate }) => [compartment, plate]);
  cells.forEach((cell, i) => {
    if (cells.findIndex((c) => sameLocal(c, cell)) !== i)
      problems.push(`cell ${JSON.stringify(cell)} is used twice`);
    if (FURNITURE_BLOCK_CELLS.some((c) => sameLocal(c, cell)))
      problems.push(`cell ${JSON.stringify(cell)} holds a furniture block`);
  });
  for (const { id, compartment, plate, slots, unit } of doors) {
    if (!PLATE_LAYERS.includes(plate.layer))
      problems.push(`door ${id}'s plate is in layer ${plate.layer}`);
    if (OPEN_SLOT_CELLS.some((c) => sameLocal(c, plate)))
      problems.push(`door ${id}'s plate covers a slot`);
    const ends = slots.map((s) => s.pair?.end).sort();
    if (JSON.stringify(ends) !== "[0,1]")
      problems.push(`door ${id} does not hold ends 0 and 1 once`);
    for (const s of slots)
      if (
        s.door !== id ||
        s.pair?.kind !== unit.pairKind ||
        !sameLocal(s.cell, compartment)
      )
        problems.push(`slot ${s.id} is not in door ${id}'s compartment`);
  }
  return problems;
}

describe("definitions", () => {
  it("accepts the camper's storage and a second fridge-like unit beside it (ADR 0121)", () => {
    expect(validateDooredStorage(CAMPER_STORAGE)).toEqual([]);
    expect(validateDooredStorage([...CAMPER_STORAGE, FRIDGE_LIKE])).toEqual([]);
    expect(STORAGE_DOORS.map(({ id }) => id)).toEqual(["sink", "stove"]);
  });

  it("rejects a unit whose door repeats an id, shares a cell, sits on a furniture block, puts its plate in another layer or on a slot, or holds a stray slot", () => {
    const slotCell = OPEN_SLOT_CELLS.find(
      (c) => !FURNITURE_BLOCK_CELLS.some((f) => sameLocal(f, c)),
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...FRIDGE_LIKE.doors),
        fc.constantFrom("id", "cell", "block", "layer", "onSlot", "slot"),
        fc.constantFrom(0, 4),
        (door, fault, layer) => {
          const shower = { x: -1, z: -3, layer: 1 };
          const broken = {
            ...door,
            ...(fault === "id" ? { id: "sink" } : {}),
            ...(fault === "cell" ? { plate: { x: 0, z: -1, layer: 3 } } : {}),
            ...(fault === "block" ? { compartment: shower } : {}),
            ...(fault === "layer" ? { plate: { ...door.plate, layer } } : {}),
            ...(fault === "onSlot" ? { plate: slotCell } : {}),
            ...(fault === "slot"
              ? {
                  slots: door.slots.map((s) => ({ ...s, door: "elsewhere" })),
                }
              : {}),
          };
          const unit = { ...FRIDGE_LIKE, doors: [broken] };
          expect(validateDooredStorage([WALL_CABINET, unit])).not.toEqual([]);
        },
      ),
    );
  });

  it("puts a door on a slot exactly when its pair is a storage compartment's, and lists those slots as the doors' ends (ADR 0114, 0121)", () => {
    for (const s of DECOR_SLOTS)
      expect(s.door !== undefined).toBe(
        s.pair !== undefined && isStoragePairKind(s.pair.kind),
      );
    expect(DECOR_SLOTS.filter((s) => s.door !== undefined)).toEqual(
      STORAGE_DOORS.flatMap(({ slots }) => slots),
    );
  });

  it("builds a unit's furniture row from its compartments and their ends, door by door", () => {
    expect(storageFurniture(FRIDGE_LIKE)).toEqual({
      cells: FRIDGE_LIKE.doors.map(({ compartment }) => compartment),
      slots: FRIDGE_LIKE.doors.flatMap(({ slots }) => slots),
    });
  });

  it("finds a compartment's door by its cell and an open door by its plate's cell, and nothing elsewhere", () => {
    fc.assert(
      fc.property(
        openOf(ALL_IDS),
        fc.record({
          x: fc.integer({ min: -1, max: 1 }),
          z: fc.integer({ min: -3, max: 3 }),
          layer: fc.integer({ min: 0, max: 4 }),
        }),
        (open, cell) => {
          const compartment = TWO_UNITS.find((d) =>
            sameLocal(d.compartment, cell),
          );
          const plate = TWO_UNITS.find((d) => sameLocal(d.plate, cell));
          expect(compartmentDoorAt(cell, TWO_UNITS)).toBe(compartment);
          expect(openPlateAt(cell, open, TWO_UNITS)).toBe(
            plate && open.has(plate.id) ? plate : undefined,
          );
        },
      ),
    );
  });

  it("uses a slot behind a door only while that door is open", () => {
    fc.assert(
      fc.property(
        openOf(ALL_IDS),
        fc.option(fc.constantFrom(...ALL_IDS), { nil: undefined }),
        (open, door) => {
          expect(usableBehindDoor({ door }, open)).toBe(
            door === undefined || open.has(door),
          );
        },
      ),
    );
  });
});

type Action =
  | { readonly type: "tick" }
  | {
      readonly type: "press";
      readonly door: number;
      readonly onCompartment: boolean;
      readonly item: boolean;
    }
  | { readonly type: "shut" };

const action: fc.Arbitrary<Action> = fc.oneof(
  fc.constant({ type: "tick" as const }),
  fc.record({
    type: fc.constant("press" as const),
    door: fc.nat(),
    onCompartment: fc.boolean(),
    item: fc.boolean(),
  }),
  fc.constant({ type: "shut" as const }),
);

describe("StorageDoors", () => {
  it("acts at most once per swing on each door, swings each one step per tick within bounds, shows every open door once it moved, and shuts all on departure (ADR 0105, 0114)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/), {
          minLength: 1,
          maxLength: 4,
        }),
        fc.array(action, { maxLength: 80 }),
        (ids, actions) => {
          const doors = new StorageDoors(
            ids.map((id) => ({ id })),
            () => undefined,
            true,
          );
          const last = new Map<string, number>();
          const steps = new Map(ids.map((id) => [id, 0]));
          const open = new Set<string>();
          let tick = 0;
          for (const a of actions) {
            if (a.type === "tick") {
              const sent: [string, number][] = [];
              const commands = doors.swingCommands((id, value) => {
                sent.push([id, value]);
                return { type: "setProperty", name: id, value };
              });
              expect(commands).toHaveLength(sent.length);
              // Commands come in door order, each value a whole step in [0, 1].
              expect(sent.map(([id]) => id)).toEqual(
                ids.filter((id) => sent.some(([s]) => s === id)),
              );
              for (const id of ids) {
                const before = steps.get(id) ?? 0;
                const target = open.has(id) ? SWING : 0;
                const after = before + Math.sign(target - before);
                steps.set(id, after);
                expect(after).toBeGreaterThanOrEqual(0);
                expect(after).toBeLessThanOrEqual(SWING);
                const value = sent.find(([s]) => s === id)?.[1];
                if (value !== undefined) expect(value).toBe(after / SWING);
                else expect(after).toBe(before);
              }
              tick++;
              for (const id of doors.open())
                expect(doors.shown().has(id)).toBe(true);
            } else if (a.type === "shut") {
              doors.shutAll();
              open.clear();
              for (const id of ids) steps.set(id, 0);
              expect(doors.open()).toEqual(new Set());
              expect(doors.shown()).toEqual(new Set());
            } else {
              const id = ids[a.door % ids.length] ?? "";
              let taken = false;
              const got = doors.press(id, a.onCompartment, tick, () => {
                taken = true;
                return a.item ? "mug_pair" : undefined;
              });
              const acts = tick - (last.get(id) ?? Number.NEGATIVE_INFINITY);
              if (acts < SWING) {
                expect(got).toBeUndefined();
                expect(taken).toBe(false);
                continue;
              }
              last.set(id, tick);
              const takes = open.has(id) && a.onCompartment;
              expect(taken).toBe(takes);
              if (takes && a.item)
                expect(got).toEqual({ kind: "item", item: "mug_pair" });
              else {
                expect(got).toEqual({ kind: "door" });
                if (open.has(id)) open.delete(id);
                else open.add(id);
              }
            }
            expect(doors.open()).toEqual(open);
            expect(doors.shown()).toEqual(
              new Set(ids.filter((id) => (steps.get(id) ?? 0) > 0)),
            );
          }
        },
      ),
    );
  });

  it("restores each door's saved swing, rounded and clamped, only for a docked camper", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.double({ min: -0.5, max: 1.5, noNaN: true }),
            fc.double({ noNaN: true }),
            fc.string(),
          ),
          {
            minLength: 2,
            maxLength: 2,
          },
        ),
        fc.boolean(),
        (saved, docked) => {
          const ids = ["a", "b"];
          const doors = new StorageDoors(
            ids.map((id) => ({ id })),
            (id) => saved[ids.indexOf(id)],
            docked,
          );
          const step = (v: unknown) =>
            docked && typeof v === "number"
              ? Math.min(Math.max(Math.round(v * SWING), 0), SWING)
              : 0;
          const steps = saved.map(step);
          expect(doors.shown()).toEqual(
            new Set(ids.filter((_, i) => (steps[i] ?? 0) > 0)),
          );
          expect(doors.open()).toEqual(
            new Set(ids.filter((_, i) => (steps[i] ?? 0) * 2 >= SWING)),
          );
          const first: EngineCommand[] = doors.swingCommands((name, value) => ({
            type: "setProperty",
            name,
            value,
          }));
          // The first swing always reaches the entity, so a rebuilt drive overwrites it.
          expect(first).toHaveLength(2);
        },
      ),
    );
  });
});

describe("cells", () => {
  it("routes a press on any compartment or plate cell to its own door at any snapped pose, and nothing else (ADR 0114, 0121)", () => {
    fc.assert(
      fc.property(
        pose,
        fc.record({
          x: fc.integer({ min: -3, max: 3 }),
          z: fc.integer({ min: -5, max: 5 }),
          layer: fc.integer({ min: -1, max: 5 }),
        }),
        (p, other) => {
          for (const door of TWO_UNITS) {
            expect(
              storagePressTarget(
                p,
                localCellAt(p, door.compartment),
                TWO_UNITS,
              ),
            ).toEqual({ door, onCompartment: true });
            expect(
              storagePressTarget(p, localCellAt(p, door.plate), TWO_UNITS),
            ).toEqual({ door, onCompartment: false });
          }
          const taken = TWO_UNITS.some(
            (d) => sameLocal(d.compartment, other) || sameLocal(d.plate, other),
          );
          if (!taken)
            expect(
              storagePressTarget(p, localCellAt(p, other), TWO_UNITS),
            ).toBeUndefined();
        },
      ),
    );
  });

  it("lays one compartment block per door, from its unit, with the door's shown state and its first slot's height", () => {
    fc.assert(
      fc.property(pose, openOf(ALL_IDS), (p, shown) => {
        looks.length = 0;
        const laid = compartmentCells(p, [], shown, TWO_UNITS);
        expect(laid.map(cellKey)).toEqual(
          TWO_UNITS.map((d) => cellKey(localCellAt(p, d.compartment))),
        );
        for (const [i, c] of laid.entries())
          expect(c.block.open).toBe(shown.has(TWO_UNITS[i]?.id ?? ""));
        expect(looks).toEqual(
          FRIDGE_LIKE.doors.map((d) => ({
            face: decorFace(p.yaw),
            open: shown.has(d.id),
            height: d.slots[0]?.height,
          })),
        );
      }),
    );
  });

  it("lays an open door's plate in its cell on its hinge side, in the ceiling or an inside layer, lit under a lit ceiling light, and leaves no ceiling over any compartment (ADR 0114, 0115, 0121)", () => {
    fc.assert(
      fc.property(pose, openOf(ALL_IDS), fc.boolean(), (p, open, lightsOn) => {
        const byKey = new Map(
          roomCells(p, false, open, false, TWO_UNITS).map((c) => [
            cellKey(c),
            c.block,
          ]),
        );
        plateLooks.length = 0;
        const inside = storagePlateCells(p, open, lightsOn, TWO_UNITS);
        const insideByKey = new Map(inside.map((c) => [cellKey(c), c.block]));
        const f = forward(p.yaw);
        const faceOf = (x: number, z: number) => {
          if (Math.round(z) !== 0) return Math.round(z) < 0 ? 0 : 1;
          return Math.round(x) < 0 ? 2 : 3;
        };
        for (const door of TWO_UNITS) {
          expect(byKey.has(cellKey(localCellAt(p, door.compartment)))).toBe(
            false,
          );
          const key = cellKey(localCellAt(p, door.plate));
          const plate = {
            type: "cabinetDoor",
            face: faceOf(door.hinge * f.x, door.hinge * f.z),
          };
          if (door.plate.layer === 3) {
            expect(byKey.get(key)).toEqual(
              open.has(door.id) ? plate : { type: "ceiling" },
            );
            expect(insideByKey.has(key)).toBe(false);
          } else {
            expect(byKey.has(key)).toBe(false);
            expect(insideByKey.get(key)).toEqual(
              open.has(door.id) ? plate : undefined,
            );
          }
        }
        expect(inside).toHaveLength(
          TWO_UNITS.filter((d) => d.plate.layer !== 3 && open.has(d.id)).length,
        );
        const lit = (cell: LocalCell) =>
          lightsOn && CEILING_LIGHTS.some((c) => sameLocal(c, cell));
        expect(plateLooks).toEqual(
          FRIDGE_LIKE.doors
            .filter((d) => open.has(d.id))
            .map((d) => ({
              face: faceOf(d.hinge * f.x, d.hinge * f.z),
              lit: lit(d.plate),
            })),
        );
      }),
    );
  });

  it("lays no inside plate, checks no plate cell, and keeps the cargo and lights of the wall cabinet as before (ADR 0114, 0115, 0121)", () => {
    fc.assert(
      fc.property(pose, openOf(ALL_IDS), fc.boolean(), (p, open, lightsOn) => {
        expect(storagePlateCells(p, open, lightsOn)).toEqual([]);
        expect(storagePlateChecks(p, STORAGE_DOORS)).toEqual([]);
        expect(cargoCells(p)).toEqual(cargoCells(p, []));
        expect(parkCheckCells(p)).toEqual(parkCheckCells(p, []));
        expect(ceilingLightCells(p, open)).toEqual(ceilingLightCells(p));
      }),
    );
  });

  it("reads inside plate cells on parking and departure instead of as cargo, and leaves lights to open plates (ADR 0115, 0121)", () => {
    fc.assert(
      fc.property(pose, openOf(ALL_IDS), (p, open) => {
        const plates = FRIDGE_LIKE.doors.map((d) =>
          cellKey(localCellAt(p, d.plate)),
        );
        expect(
          storagePlateChecks(p, TWO_UNITS).map(({ door, cell }) => [
            door.id,
            cellKey(cell),
          ]),
        ).toEqual(FRIDGE_LIKE.doors.map((d, i) => [d.id, plates[i]]));
        expect(cargoCells(p, TWO_UNITS)).toEqual(
          cargoCells(p, []).filter((c) => !plates.includes(cellKey(c))),
        );
        const checked = parkCheckCells(p, TWO_UNITS).map(cellKey);
        for (const key of plates)
          expect(checked.filter((k) => k === key)).toHaveLength(1);
        expect(new Set(checked)).toEqual(
          new Set(parkCheckCells(p, []).map(cellKey)),
        );
        const covered = new Set(
          TWO_UNITS.filter((d) => open.has(d.id)).map((d) =>
            cellKey(localCellAt(p, d.plate)),
          ),
        );
        expect(ceilingLightCells(p, open, TWO_UNITS).map(cellKey)).toEqual(
          CEILING_LIGHTS.map((c) => cellKey(localCellAt(p, c))).filter(
            (k) => !covered.has(k),
          ),
        );
      }),
    );
  });

  it("lets an inside plate cell leave only with air or its own unit's plate", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TWO_UNITS),
        fc.constantFrom(
          AIR,
          "yasu_ride:fridge_like_door",
          "yasu_ride:camper_cabinet_door",
          "minecraft:stone",
          "minecraft:short_grass",
        ),
        (door, typeId) => {
          expect(ownPlateBlock(typeId, door)).toBe(
            typeId === AIR ||
              typeId === `yasu_ride:${door.unit.plateBlockName}`,
          );
          expect(ownPlateBlock(undefined, door)).toBe(false);
        },
      ),
    );
  });
});
