import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { cellKey, cellOf } from "../../../../../src/domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../../../src/domain/shared/decorations";
import { quarterOf } from "../../../../../src/domain/shared/facing";
import type { DecorPlacement } from "../../../../../src/domain/vehicle/dock/decor";
import type {
  DriveStep,
  TickContext,
} from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { CAMPING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import {
  DECOR_CELLS,
  DECOR_SLOTS,
  decorSlot,
} from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  decorCells,
  decorSlotCell,
  furnitureCells,
  slotCells,
} from "../../../../../src/domain/vehicle/kinds/camper/decorCells";
import {
  slotPoint,
  slotsFor,
} from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { DOOR_STEPS } from "../../../../../src/domain/vehicle/kinds/camper/doorSwing";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  type DecorSlot,
  STORAGE_DOORS,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  NATURAL_GROUND,
  parkCheckCells,
  wallFootCells,
} from "../../../../../src/domain/vehicle/kinds/camper/groundCheck";
import {
  localCellAt,
  parkPose,
} from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import {
  departure,
  exitCells,
  roomCells,
} from "../../../../../src/domain/vehicle/kinds/camper/roomCells";
import { AIR } from "../../../../../src/domain/vehicle/kinds/camper/roomGeometry";
import { CAMPER_SAVED } from "../../../../../src/domain/vehicle/kinds/camper/saved";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import {
  cargoCells,
  compartmentCells,
  storagePlateChecks,
} from "../../../../../src/domain/vehicle/kinds/camper/storagePlates";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";
import { camperRoom, showerFeet } from "../../../../support/camperRoom";
import { decorItemId, decorSlotId } from "../../../../support/decorIds";
import { defined } from "../../../../support/defined";
import { hingedOpening } from "../../../../support/storageOpening";

const PUSH = { moveX: 0, moveY: 1, jump: false };
// The fridge's plate cells in the inside layers, read on departure after the slot cells
// (ADR 0121, 0123).
const insidePlates = (pose: Parameters<typeof storagePlateChecks>[0]) =>
  storagePlateChecks(pose, STORAGE_DOORS).map(({ cell }) => cell);
const NEUTRAL = { moveX: 0, moveY: 0, jump: false };
const decorItem = fc.constantFrom("potted_plant", "percolator", "cushion");
// At most one placement per slot cell, as the drive keeps it (ADR 0107).
const inCells = (cells: readonly (typeof DECOR_CELLS)[number][]) =>
  fc.tuple(
    ...cells.map(({ slots }) =>
      fc
        .tuple(fc.constantFrom(...slots), decorItem)
        .map(([s, item]) => ({ slot: s.id, item: decorItemId(item) })),
    ),
  );
const decor = fc.subarray([...DECOR_CELLS]).chain(inCells);
const shuffledDecor = fc.shuffledSubarray([...DECOR_CELLS]).chain(inCells);
// Pair ends and the two drawers each have their own place, even in a shared block.
const placeOf = (slot: DecorSlot) => {
  const { x, z, layer } = slot.cell;
  return slot.pair ? slot.id : `${x},${z},${layer},${slot.door ?? ""}`;
};
const slotNamed = (id: string) =>
  defined(
    DECOR_SLOTS.find((s) => s.id === id),
    id,
  );
const slotIndex = (p: { slot: string }) =>
  DECOR_SLOTS.findIndex((s) => s.id === p.slot);
function fixture(dockDecor?: string, yaw = 37) {
  const blocks = new Map<string, string>();
  const blockTypes = vi.fn(
    (cells: readonly { x: number; y: number; z: number }[]) =>
      cells.map((c) => blocks.get(cellKey(cellOf(c))) ?? AIR),
  );
  const ctx: TickContext = {
    tick: 0,
    location: { x: 10.2, y: 64.005, z: -8.7 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes,
  };
  const drive = new CamperDrive(
    yaw,
    dockDecor === undefined ? {} : { [CAMPER_SAVED.decor]: dockDecor },
  );
  const pose = parkPose(ctx.location, drive.yaw);
  const step = (raw?: RawInput): DriveStep =>
    drive.step(raw, { ...ctx, tick: ctx.tick++ });
  const park = () => {
    for (let i = 0; i < DOCK.ticks; i++) step();
  };
  return {
    blocks,
    blockTypes,
    ctx,
    drive,
    room: camperRoom(drive),
    pose,
    step,
    park,
  };
}

it("holds only the pose on tick 20, lays the room next tick, and scans once", () => {
  const f = fixture();
  for (let i = 1; i < DOCK.ticks; i++) expect(f.step().dock).toBeUndefined();
  const out = f.step();
  expect(out.dock?.hold).toEqual(f.pose);
  expect(out.dock?.cells).toEqual([]);
  expect(out.commands).toContainEqual({ type: "triggerEvent", name: "dock" });
  expect(out.commands).toContainEqual({
    type: "setProperty",
    name: "docked",
    value: true,
  });
  expect(f.step().dock?.cells).toEqual([
    ...roomCells(f.pose, false),
    ...furnitureCells(f.pose, []),
    ...compartmentCells(f.pose, [], new Set()),
  ]);
  expect(f.blockTypes).toHaveBeenCalledExactlyOnceWith([
    ...parkCheckCells(f.pose),
    ...wallFootCells(f.pose),
  ]);
  expect(f.drive.inspect().parked).toBe(true);
  expect(f.drive.speed).toBe(0);
});

it("refuses any blocking cell once per stop, then retries after the stick resets the stop", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 167 }),
      fc
        .string()
        .filter(
          (t) =>
            t !== AIR &&
            !CLEARABLE_DECORATIONS.has(t) &&
            !NATURAL_GROUND.has(t),
        ),
      (index, type) => {
        const f = fixture();
        f.blocks.set(
          cellKey(defined(parkCheckCells(f.pose)[index], "checked cell")),
          type,
        );
        for (let i = 1; i <= 60; i++) {
          const out = f.step();
          expect(out.dock).toBeUndefined();
          expect(out.clear ?? []).toEqual([]);
          expect(out.message).toBe(
            i === DOCK.ticks ? "cannot_park" : undefined,
          );
        }
        expect(f.blockTypes).toHaveBeenCalledTimes(1);
        f.step(PUSH);
        f.blocks.clear();
        f.park();
        expect(f.drive.inspect().parked).toBe(true);
        expect(f.blockTypes).toHaveBeenCalledTimes(2);
      },
    ),
  );
});

it("parks over a grass block rising into a front floor corner outside the collision box, clearing the grass around it (ADR 0119)", () => {
  fc.assert(
    fc.property(
      fc.double({ min: -720, max: 720, noNaN: true }),
      fc.constantFrom(-1, 1),
      fc.constantFrom(-3, -2, 2, 3),
      fc.boolean(),
      (yaw, x, z, plantsOnTop) => {
        const f = fixture(undefined, yaw);
        const raised = localCellAt(f.pose, { x, z, layer: 0 });
        f.blocks.set(cellKey(raised), "minecraft:grass_block");
        const grass = localCellAt(f.pose, { x: 0, z: 1, layer: 0 });
        f.blocks.set(cellKey(grass), "minecraft:short_grass");
        const above = { ...raised, y: raised.y + 1 };
        if (plantsOnTop) f.blocks.set(cellKey(above), "minecraft:short_grass");
        const messages = Array.from(
          { length: DOCK.ticks },
          () => f.step().message,
        );
        expect(messages).not.toContain("cannot_park");
        expect(f.drive.inspect().parked).toBe(true);
        const clear = defined(f.step().clear, "clear list");
        expect(new Set(clear.map(cellKey))).toEqual(
          new Set([grass, ...(plantsOnTop ? [above] : [])].map(cellKey)),
        );
      },
    ),
    { numRuns: 40 },
  );
});

it("clears only decorations once on the tick after parking, top first", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 167 }), {
        minLength: 1,
        maxLength: 20,
      }),
      fc.constantFrom(...CLEARABLE_DECORATIONS),
      (indices, typeId) => {
        const f = fixture();
        const expected = indices
          .map((i) => ({
            ...defined(parkCheckCells(f.pose)[i], "decoration cell"),
            typeId,
          }))
          .sort((a, b) => b.y - a.y);
        for (const c of expected) f.blocks.set(cellKey(c), typeId);
        f.park();
        const clear = f.step().clear;
        expect(new Set(clear?.map(cellKey))).toEqual(
          new Set(expected.map(cellKey)),
        );
        expect(clear).toEqual(
          [...defined(clear, "clear list")].sort((a, b) => b.y - a.y),
        );
        for (const c of clear ?? []) expect(c.typeId).toBe(typeId);
        expect(f.step().clear).toEqual([]);
      },
    ),
  );
});

it("never parks off ground or with the stick pushed", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(-1, 1),
      fc.double({ min: 0.100001, max: 1, noNaN: true }),
      (sign, strength) => {
        const air = fixture();
        air.ctx.onGround = false;
        const moving = fixture();
        for (let i = 0; i < 60; i++) {
          expect(air.step().dock).toBeUndefined();
          expect(
            moving.step({ ...PUSH, moveY: sign * strength }).dock,
          ).toBeUndefined();
        }
        expect(air.blockTypes).not.toHaveBeenCalled();
        expect(moving.blockTypes).not.toHaveBeenCalled();
      },
    ),
  );
});

it("keeps the hold for any quiet stick and jump sequence without consulting sensors", () => {
  const quiet = fc.record({
    moveX: fc.double({ min: -0.1, max: 0.1, noNaN: true }),
    moveY: fc.double({ min: -0.1, max: 0.1, noNaN: true }),
    jump: fc.boolean(),
  });
  fc.assert(
    fc.property(fc.array(quiet, { minLength: 40, maxLength: 40 }), (inputs) => {
      const f = fixture();
      f.park();
      f.ctx.solidAt = () => {
        throw new Error("parked collision query");
      };
      f.ctx.waterAt = () => {
        throw new Error("parked water query");
      };
      for (const input of inputs) {
        const out = f.step(input);
        expect(out.dock?.hold).toEqual(f.pose);
        expect(out.depart).toBeUndefined();
      }
      expect(f.blockTypes).toHaveBeenCalledTimes(1);
    }),
  );
});

it("departs on the stick press, undocks before properties, and boards deck riders", () => {
  const f = fixture();
  f.park();
  const out = f.step(PUSH);
  expect(out.dock).toBeUndefined();
  expect(out.commands.slice(0, 2)).toEqual([
    { type: "triggerEvent", name: "undock" },
    { type: "setProperty", name: "docked", value: false },
  ]);
  expect(out.depart).toEqual(departure(f.pose));
  expect(out.boardDeckRiders).toBe(true);
  expect(f.drive.inspect().parked).toBe(false);
  expect(f.blockTypes).toHaveBeenLastCalledWith([
    ...cargoCells(f.pose),
    ...slotCells(f.pose),
    ...insidePlates(f.pose),
    ...exitCells(f.pose),
  ]);
});

it("refuses cargo only on each press and requires a new press after cargo is cleared", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 44 }), (index) => {
      const f = fixture();
      f.park();
      const cell = defined(cargoCells(f.pose)[index], "cargo cell");
      f.blocks.set(cellKey(cell), "minecraft:stone");
      expect(f.step(PUSH).message).toBe("clear_cargo");
      for (let i = 0; i < 20; i++) expect(f.step(PUSH).message).toBeUndefined();
      expect(f.blockTypes).toHaveBeenCalledTimes(2);
      f.step(NEUTRAL);
      expect(f.step(PUSH).message).toBe("clear_cargo");
      f.blocks.clear();
      expect(f.step(PUSH).dock).toBeDefined();
      f.step(NEUTRAL);
      expect(f.step(PUSH).depart).toEqual(departure(f.pose));
      expect(f.blockTypes).toHaveBeenCalledTimes(4);
    }),
  );
});

it("swings the entry, shower, and cabinet doors one step per tick until their target", () => {
  const cabinetDoors = {
    sink: "cabinet_sink_door",
    stove: "cabinet_stove_door",
  } as const;
  const names = ["door", "shower_door", ...Object.values(cabinetDoors)];
  fc.assert(
    fc.property(
      fc.constantFrom("door", "shower_door", "sink", "stove"),
      fc.array(fc.integer({ min: 0, max: 2 * DOOR_STEPS }), {
        minLength: 1,
        maxLength: 8,
      }),
      (door, gaps) => {
        const f = fixture();
        const storage = (id: string) =>
          defined(
            STORAGE_DOORS.find((row) => row.id === id),
            id,
          );
        const cabinet =
          door === "sink" || door === "stove" ? storage(door) : undefined;
        const other = cabinet
          ? storage(door === "sink" ? "stove" : "sink")
          : undefined;
        const name =
          door === "sink" || door === "stove" ? cabinetDoors[door] : door;
        const tap = (open: boolean) => {
          if (cabinet) {
            const hit = open
              ? hingedOpening(cabinet).plate
              : cabinet.compartment;
            return (
              f.room.storage.pressStorage({
                cell: localCellAt(f.pose, hit),
                tick: f.ctx.tick,
              })?.kind === "door"
            );
          }
          return door === "door"
            ? f.room.fixtures.useDockDoor(f.ctx.tick)
            : f.room.fixtures.pressShowerToilet(f.pose, f.ctx.tick);
        };
        expect(tap(false)).toBe(false);
        f.park();
        f.step();
        const taps = new Map<number, number>();
        let end = f.ctx.tick;
        for (const gap of gaps) {
          end += gap;
          taps.set(end, (taps.get(end) ?? 0) + 1);
        }
        let open = false;
        let lastTap = -Infinity;
        while (f.ctx.tick <= end + DOOR_STEPS) {
          const tick = f.ctx.tick;
          for (let count = taps.get(tick) ?? 0; count > 0; count--) {
            const accepted = tick - lastTap >= DOOR_STEPS;
            expect(tap(open)).toBe(accepted);
            if (accepted) {
              lastTap = tick;
              open = !open;
            }
          }
          const out = f.step();
          const elapsed = tick - lastTap + 1;
          const moving = elapsed <= DOOR_STEPS;
          const step = open ? elapsed : DOOR_STEPS - elapsed;
          expect(
            out.commands.filter((cmd) => names.includes(cmd.name)),
          ).toEqual(
            moving
              ? [{ type: "setProperty", name, value: step / DOOR_STEPS }]
              : [],
          );
          if (!moving) continue;
          const cells = defined(out.dock, "laid room").cells;
          const entry = cells.filter(({ block }) => block.type === "door");
          expect(entry).toHaveLength(3);
          expect(
            entry.every(
              ({ block }) =>
                block.type === "door" &&
                block.open === (door === "door" && open),
            ),
          ).toBe(true);
          if (!cabinet || !other) continue;
          const at = (cell: typeof cabinet.compartment) => {
            const key = cellKey(localCellAt(f.pose, cell));
            return cells.find((cell) => cellKey(cell) === key)?.block;
          };
          expect(at(cabinet.compartment)).toMatchObject({
            type: "cabinet",
            open: open || elapsed < DOOR_STEPS,
          });
          expect(at(other.compartment)).toMatchObject({
            type: "cabinet",
            open: false,
          });
          expect(at(hingedOpening(cabinet).plate)?.type).toBe(
            open ? "cabinetDoor" : "ceiling",
          );
          expect(at(hingedOpening(other).plate)?.type).toBe("ceiling");
        }
      },
    ),
  );
});

it("toggles each door once for two taps within a swing and twice for taps a swing apart (ADR 0105)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 2 * CAMPER_SPEC.doorSwingTicks }),
      fc.constantFrom("door", "shower_door"),
      (gap, name) => {
        const f = fixture();
        f.park();
        const tap = (tick: number) =>
          name === "door"
            ? f.room.fixtures.useDockDoor(tick)
            : f.room.fixtures.pressShowerToilet(f.pose, tick);
        const values: unknown[] = [];
        const step = () => {
          for (const c of f.step().commands)
            if (c.type === "setProperty" && c.name === name)
              values.push(c.value);
        };
        const first = f.ctx.tick;
        expect(tap(first)).toBe(true);
        while (f.ctx.tick < first + gap) step();
        expect(tap(f.ctx.tick)).toBe(gap >= CAMPER_SPEC.doorSwingTicks);
        for (let i = 0; i < 2 * CAMPER_SPEC.doorSwingTicks; i++) step();
        expect(values.at(-1)).toBe(gap >= CAMPER_SPEC.doorSwingTicks ? 0 : 1);
      },
    ),
  );
});

it("restores a laid open room immediately without a scan or dock event", () => {
  const f = fixture();
  const drive = new CamperDrive(90, {
    form: "car",
    docked: true,
    door: 1,
    [CAMPER_SAVED.laid]: true,
  });
  drive.onDriverMounted(-45);
  const out = drive.step(undefined, f.ctx);
  const pose = parkPose(f.ctx.location, 90);
  expect(out.dock?.cells).toEqual([
    ...roomCells(pose, true),
    ...furnitureCells(pose, []),
    ...compartmentCells(pose, [], new Set()),
  ]);
  expect(out.commands).not.toContainEqual({
    type: "triggerEvent",
    name: "dock",
  });
  expect(out.commands).toContainEqual({
    type: "setProperty",
    name: "door",
    value: 1,
  });
  expect(f.blockTypes).not.toHaveBeenCalled();
  drive.onDriverMounted(-45);
  expect(drive.yaw).toBe(90);
});

it("forgets the previous driver's tap when a new driver mounts while parked", () => {
  const f = fixture();
  for (let i = 0; i < DOCK.ticks - 2; i++) f.step();
  f.step({ ...PUSH, moveY: 0, jump: true });
  expect(f.step().dock?.hold).toEqual(f.pose);
  f.drive.onDriverMounted(-123);
  expect(f.drive.yaw).toBe(f.pose.yaw);
  expect(f.step({ ...PUSH, jump: true }).depart).toBeDefined();
  expect(f.drive.form).toBe("car");
});

it("keeps the snapped yaw when a parked driver's mount changes and boards from deck seat zero", () => {
  const f = fixture();
  f.park();
  f.drive.onDriverMounted(-123);
  expect(f.drive.yaw).toBe(f.pose.yaw);
  f.ctx.deckSeatInputs = [PUSH];
  expect(f.step().boardDeckRiders).toBe(true);
  f.ctx.deckSeatInputs = [undefined, PUSH];
  expect(f.step().boardDeckRiders).toBe(false);
});

it("checks both exit cells before parking and leaves overflow standing when the exit later blocks", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1 }),
      fc.constantFrom(AIR, ...CLEARABLE_DECORATIONS, "minecraft:stone"),
      (index, typeId) => {
        const f = fixture();
        const cell = defined(exitCells(f.pose)[index], "exit cell");
        expect(parkCheckCells(f.pose).map(cellKey)).toContain(cellKey(cell));
        f.blocks.set(cellKey(cell), "minecraft:stone");
        f.park();
        expect(f.drive.inspect().parked).toBe(false);
        f.step(PUSH);
        f.blocks.clear();
        f.park();
        f.blocks.set(cellKey(cell), typeId);
        const out = f.step(PUSH);
        expect(out.dock).toBeUndefined();
        expect(out.depart).toBeDefined();
        expect(out.depart?.exit).toEqual(
          typeId === "minecraft:stone" ? undefined : departure(f.pose).exit,
        );
        expect(f.blockTypes).toHaveBeenLastCalledWith([
          ...cargoCells(f.pose),
          ...slotCells(f.pose),
          ...insidePlates(f.pose),
          ...exitCells(f.pose),
        ]);
        expect(f.blockTypes.mock.calls.at(-1)?.[0]).toHaveLength(61);
      },
    ),
  );
});

it("recovers a clear unlaid room immediately and clears matching plants once", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 18 }), (index) => {
      const f = fixture();
      const drive = new CamperDrive(f.pose.yaw, {
        form: "car",
        docked: true,
        [CAMPER_SAVED.laid]: false,
      });
      const lower = defined(wallFootCells(f.pose)[index], "wall foot");
      const upper = { ...lower, y: lower.y + 1 };
      for (const cell of [lower, upper])
        f.blocks.set(cellKey(cell), "minecraft:tall_grass");
      const out = drive.step(undefined, f.ctx);
      expect(out.clear).toEqual([
        { ...upper, typeId: "minecraft:tall_grass" },
        { ...lower, typeId: "minecraft:tall_grass" },
      ]);
      expect(out.dock?.cells).toEqual([
        ...roomCells(f.pose, false),
        ...furnitureCells(f.pose, []),
        ...compartmentCells(f.pose, [], new Set()),
      ]);
      expect(f.blockTypes).toHaveBeenCalledExactlyOnceWith([
        ...parkCheckCells(f.pose),
        ...wallFootCells(f.pose),
      ]);
      for (let tick = 0; tick < 30; tick++)
        expect(drive.step(undefined, f.ctx).clear).toEqual([]);
      expect(f.blockTypes).toHaveBeenCalledTimes(1);
    }),
  );
});

it("restores the saved door target through either direction of a partial swing", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.integer({ min: 1, max: 9 }), (open, step) => {
      const f = fixture();
      const drive = new CamperDrive(0, {
        form: "car",
        docked: true,
        [CAMPER_SAVED.laid]: true,
        door: step / 10,
        [CAMPER_SAVED.doorOpen]: open,
      });
      for (let tick = 1; tick <= (open ? 10 - step : step); tick++) {
        const out = drive.step(undefined, f.ctx);
        expect(out.commands).toContainEqual({
          type: "setProperty",
          name: "door",
          value: (step + (open ? tick : -tick)) / 10,
        });
        expect(
          out.dock?.cells
            .filter((c) => c.block.type === "door")
            .every((c) => c.block.type === "door" && c.block.open === open),
        ).toBe(true);
      }
      expect(drive.step(undefined, f.ctx).commands).toEqual([]);
    }),
  );
});

it("sets, replaces, and empties only known slots and lists decor in slot order (ADR 0093)", () => {
  fc.assert(
    fc.property(shuffledDecor, (placements) => {
      const f = fixture();
      for (const { slot, item } of placements) {
        expect(f.room.decor.setDecor(slot, item)).toBe(true);
        expect(f.room.decor.setDecor(slot, item)).toBe(false);
      }
      const sorted = [...placements].sort(
        (a, b) => slotIndex(a) - slotIndex(b),
      );
      expect(f.room.decor.decor()).toEqual(sorted);
      const first = placements[0];
      if (first) {
        const { slot, item }: { slot: string; item: string } = first;
        const otherItem = item === "mug_pair" ? "toaster" : "mug_pair";
        expect(
          f.room.decor.setDecor(decorSlotId(slot), decorItemId(otherItem)),
        ).toBe(true);
        expect(f.room.decor.decor()).toContainEqual({
          slot: slot,
          item: otherItem,
        });
        expect(
          f.room.decor.setDecor(decorSlotId(slot), decorItemId(item)),
        ).toBe(true);
        expect(f.room.decor.decor()).toEqual(sorted);
      }
      expect(
        f.room.decor.setDecor(decorSlotId("nowhere"), decorItemId("mug_pair")),
      ).toBe(false);
      expect(
        f.room.decor.setDecor(
          defined(DECOR_SLOTS[0], "slot").id,
          decorItemId("Bad Item"),
        ),
      ).toBe(false);
      expect(f.room.decor.decor()).toEqual(sorted);
      for (const { slot } of placements) {
        expect(f.room.decor.setDecor(slot, undefined)).toBe(true);
        expect(f.room.decor.setDecor(slot, undefined)).toBe(false);
      }
      expect(f.room.decor.decor()).toEqual([]);
    }),
  );
});

it("lays the decor with the room on the tick after parking (ADR 0093)", () => {
  fc.assert(
    fc.property(decor, (placements) => {
      const f = fixture();
      for (const { slot, item } of placements)
        f.room.decor.setDecor(slot, item);
      f.park();
      expect(f.step().dock?.cells).toEqual([
        ...roomCells(f.pose, false),
        ...decorCells(f.pose, f.room.decor.decor()),
        ...furnitureCells(f.pose, f.room.decor.decor()),
        ...compartmentCells(f.pose, f.room.decor.decor(), new Set()),
      ]);
    }),
  );
});

it("lays decor set while parked on the next step and lays the furniture block again in an emptied slot (ADR 0097)", () => {
  const f = fixture();
  f.park();
  f.step();
  const table = decorSlotCell(f.pose, slotNamed("table"));
  const furniture = { ...table, block: { type: "furniture", height: 12 } };
  expect(f.step().dock?.cells).toContainEqual(furniture);
  f.room.decor.setDecor(decorSlotId("table"), decorItemId("potted_plant"));
  const laid = f.step().dock?.cells;
  expect(laid).toContainEqual(
    decorCells(f.pose, [
      { slot: decorSlotId("table"), item: decorItemId("potted_plant") },
    ])[0],
  );
  expect(laid).not.toContainEqual(furniture);
  f.room.decor.setDecor(decorSlotId("table"), undefined);
  const emptied = f.step().dock?.cells;
  expect(emptied?.some((c) => c.block.type === "decor")).toBe(false);
  expect(emptied).toContainEqual(furniture);
});

it("departs past its own decor blocks and refuses any other block in a slot cell (ADR 0093, 0097)", () => {
  const parked = (withDecor = true) => {
    const f = fixture();
    if (withDecor)
      f.room.decor.setDecor(decorSlotId("stove"), decorItemId("potted_plant"));
    f.park();
    f.step();
    return f;
  };
  const f = parked();
  const table = decorSlotCell(f.pose, slotNamed("stove"));
  f.blocks.set(cellKey(table), "yasu_ride:potted_plant_decor");
  const out = f.step(PUSH);
  expect(out.depart).toBeDefined();
  expect(out.message).toBeUndefined();
  expect(f.blockTypes.mock.calls.at(-1)?.[0]).toEqual([
    ...cargoCells(f.pose),
    ...slotCells(f.pose),
    ...insidePlates(f.pose),
    ...exitCells(f.pose),
  ]);
  expect(f.blockTypes.mock.calls.at(-1)?.[0]).toHaveLength(61);

  const departs = (withDecor: boolean, typeId: string) => {
    const g = parked(withDecor);
    g.blocks.set(cellKey(table), typeId);
    return g.step(PUSH);
  };
  for (const withDecor of [false, true])
    expect(
      departs(withDecor, "yasu_ride:camper_furniture").depart,
    ).toBeDefined();
  for (const [withDecor, typeId] of [
    [true, "minecraft:stone"],
    [false, "minecraft:stone"],
    [false, "yasu_ride:potted_plant_decor"],
  ] as const) {
    const refused = departs(withDecor, typeId);
    expect(refused.message).toBe("clear_cargo");
    expect(refused.depart).toBeUndefined();
  }

  const cargo = parked();
  cargo.blocks.set(
    cellKey(defined(cargoCells(cargo.pose)[0], "cargo cell")),
    "minecraft:stone",
  );
  expect(cargo.step(PUSH).message).toBe("clear_cargo");
});

it("keeps the decor through departure and lays it again on the next park", () => {
  const f = fixture();
  f.room.decor.setDecor(decorSlotId("stove"), decorItemId("percolator"));
  f.park();
  f.step();
  expect(f.step(PUSH).depart).toBeDefined();
  const stove = decorCells(f.pose, [
    { slot: decorSlotId("stove"), item: decorItemId("percolator") },
  ])[0];
  let relaid = false;
  for (let i = 0; i < 100 && !relaid; i++) {
    const cells = f.step(NEUTRAL).dock?.cells ?? [];
    if (cells.length > 0) {
      expect(cells).toContainEqual(stove);
      relaid = true;
    }
  }
  expect(relaid).toBe(true);
});

it("restores saved decor and moves an entry of a removed slot to the first free slot that takes it, docked or not (ADR 0103)", () => {
  const saved = JSON.stringify([
    { slot: decorSlotId("table"), item: decorItemId("potted_plant") },
    {
      slot: decorSlotId("wall_cabinet_front"),
      item: decorItemId("book_stack"),
    },
    { slot: decorSlotId("nowhere"), item: decorItemId("mug_pair") },
    { slot: decorSlotId("stove"), item: decorItemId("Bad Item") },
  ]);
  const expected = [
    { slot: decorSlotId("dashboard_center"), item: decorItemId("book_stack") },
    { slot: decorSlotId("dashboard_left"), item: decorItemId("mug_pair") },
    { slot: decorSlotId("table"), item: decorItemId("potted_plant") },
  ];
  expect(
    camperRoom(
      new CamperDrive(37, { [CAMPER_SAVED.decor]: saved }),
    ).decor.decor(),
  ).toEqual(expected);
  expect(
    camperRoom(
      new CamperDrive(37, {
        [CAMPER_SAVED.decor]: saved,
        docked: true,
        [CAMPER_SAVED.laid]: true,
        form: "car",
      }),
    ).decor.decor(),
  ).toEqual(expected);
});

it("restores each new standing item in every accepting standing slot", () => {
  fc.assert(
    fc.property(fc.integer(), (yaw) => {
      for (const item of ["alarm_clock", "instant_camera", "binoculars"]) {
        for (const slot of slotsFor(
          decorItemId(item),
          new Set(STORAGE_DOORS.map((d) => d.id)),
        )) {
          const entries = [{ slot: slot.id, item }];
          const restored = new CamperDrive(yaw, {
            [CAMPER_SAVED.decor]: JSON.stringify(entries),
          });
          expect(camperRoom(restored).decor.decor()).toEqual(entries);
        }
        for (const [oldSlot, currentSlot] of [
          ["shelf_low", "fridge_bottom_rear"],
          ["shelf_low_front", "fridge_bottom_front"],
          ["shelf_high", "fridge_top_rear"],
          ["shelf_high_front", "fridge_top_front"],
        ]) {
          const restored = new CamperDrive(yaw, {
            [CAMPER_SAVED.decor]: JSON.stringify([{ slot: oldSlot, item }]),
          });
          expect(camperRoom(restored).decor.decor()).toEqual([
            { slot: currentSlot, item },
          ]);
        }
      }
    }),
  );
});

it("restores saved decor to the first free accepting slot or stows it unchanged (ADR 0103)", () => {
  const everyDoor = new Set(STORAGE_DOORS.map((d) => d.id));
  const slotId = fc.constantFrom(
    ...DECOR_SLOTS.map((s) => s.id),
    decorSlotId("wall_cabinet_front"),
    decorSlotId("wall_cabinet_rear"),
    decorSlotId("nowhere"),
  );
  const entry = fc.record({
    slot: slotId,
    item: fc.constantFrom(...CAMPING_GEAR_IDS).map(decorItemId),
  });
  const savedEntry = (slot: string, item: string): DecorPlacement => ({
    slot: decorSlotId(slot),
    item: decorItemId(item),
  });
  const fullStandingSlots = DECOR_CELLS.flatMap(({ slots }) =>
    slots
      .filter((slot, i) => !slot.hanging && (i === 0 || slot.pair || slot.door))
      .map((slot) => savedEntry(slot.id, "mug_pair")),
  );
  const items = (list: readonly DecorPlacement[]) =>
    list.map((e) => e.item).sort();

  fc.assert(
    fc.property(fc.array(entry, { maxLength: 40 }), (entries) => {
      const placedByPlace = new Map<string, DecorPlacement>();
      const displaced = entries.filter((e) => {
        const slot = decorSlot(e.slot);
        if (!slot || (slot.items && !slot.items.includes(e.item))) return true;
        const place = placeOf(slot);
        if (placedByPlace.has(place)) return true;
        placedByPlace.set(place, e);
        return false;
      });

      const stowed: DecorPlacement[] = [];
      for (const e of displaced) {
        const free = slotsFor(e.item, everyDoor).find(
          (slot) => !placedByPlace.has(placeOf(slot)),
        );
        if (free) placedByPlace.set(placeOf(free), { ...e, slot: free.id });
        else stowed.push(e);
      }
      const placed = [...placedByPlace.values()].sort(
        (a, b) => slotIndex(a) - slotIndex(b),
      );

      const f = fixture(JSON.stringify(entries));
      const restored = f.room.decor.decor();
      expect(restored).toEqual([...placed, ...stowed]);
      expect(items(restored)).toEqual(items(entries));
      const reloaded = fixture(JSON.stringify(restored));
      expect(items(reloaded.room.decor.decor())).toEqual(items(entries));

      f.park();
      for (const e of stowed.filter((e) => decorSlot(e.slot) === undefined)) {
        expect(f.room.decor.setDecor(e.slot, undefined)).toBe(false);
        expect(f.room.decor.placeDecor(e.slot, e.item)).toBe(false);
      }
      const laid = defined(f.step().dock, "laid dock").cells;
      expect(
        laid.filter(
          (c) => c.block.type === "decor" || c.block.type === "decorPair",
        ),
      ).toEqual(decorCells(f.pose, placed));
      expect(laid.filter((c) => c.block.type === "furniture")).toEqual(
        furnitureCells(f.pose, placed),
      );
      expect(f.room.decor.decor()).toEqual(restored);
    }),
    {
      examples: [
        [
          [
            savedEntry("wall_cabinet_rear", "macrame_planter"),
            savedEntry("nowhere", "mug_pair"),
          ],
        ],
        [
          [
            ...fullStandingSlots,
            savedEntry("wall_cabinet_front", "book_stack"),
            savedEntry("wall_cabinet_rear", "toaster"),
          ],
        ],
        [
          [
            savedEntry("dashboard_center", "macrame_planter"),
            savedEntry("dashboard_left", "macrame_planter"),
            savedEntry("ceiling_hook", "potted_plant"),
            savedEntry("dashboard_center", "potted_plant"),
          ],
        ],
      ],
    },
  );
});

const stove = slotNamed("stove");

it("places and removes decor by hand once parked, and lays it with the room on the next step (ADR 0093)", () => {
  const f = fixture();
  for (let i = 1; i < DOCK.ticks; i++) f.step();
  const point = slotPoint(f.pose, stove);
  const cell = decorSlotCell(f.pose, stove);
  expect(
    f.room.decor.decorSlotFor(decorItemId("percolator"), point, cell, false),
  ).toBeUndefined();
  expect(
    f.room.decor.placeDecor(decorSlotId("stove"), decorItemId("percolator")),
  ).toBe(false);
  expect(f.room.decor.removeDecor(cell)).toBeUndefined();
  expect(f.room.decor.decor()).toEqual([]);

  expect(f.step().dock?.cells).toEqual([]);
  expect(
    f.room.decor.decorSlotFor(decorItemId("percolator"), point, cell, false),
  ).toBe("stove");
  expect(
    f.room.decor.placeDecor(
      decorSlotId("ceiling_hook"),
      decorItemId("percolator"),
    ),
  ).toBe(false);
  expect(
    f.room.decor.placeDecor(decorSlotId("nowhere"), decorItemId("percolator")),
  ).toBe(false);
  expect(
    f.room.decor.placeDecor(decorSlotId("stove"), decorItemId("percolator")),
  ).toBe(true);
  expect(
    f.room.decor.placeDecor(decorSlotId("stove"), decorItemId("enamel_kettle")),
  ).toBe(false);
  expect(
    f.room.decor.decorSlotFor(decorItemId("enamel_kettle"), point, cell, false),
  ).not.toBe("stove");
  expect(
    f.room.decor.decorSlotFor(
      decorItemId("macrame_planter"),
      point,
      decorSlotCell(f.pose, slotNamed("ceiling_hook")),
      false,
    ),
  ).toBe("ceiling_hook");

  const laid = defined(f.step().dock, "laid dock").cells;
  expect(laid).toEqual(expect.arrayContaining(roomCells(f.pose, false)));
  const decorLaid = laid.filter((c) => c.block.type === "decor");
  expect(decorLaid).toHaveLength(1);
  expect(decorLaid[0]).toMatchObject({
    ...cell,
    block: { type: "decor", item: decorItemId("percolator") },
  });
  expect(f.room.decor.decor()).toEqual([{ slot: "stove", item: "percolator" }]);

  expect(
    f.room.decor.removeDecor({ ...cell, y: cell.y + 100 }),
  ).toBeUndefined();
  expect(f.room.decor.removeDecor(cell)).toBe("percolator");
  expect(f.room.decor.removeDecor(cell)).toBeUndefined();
  const after = defined(f.step().dock, "laid dock").cells;
  expect(after.some((c) => c.block.type === "decor")).toBe(false);
  expect(f.room.decor.decor()).toEqual([]);
});

it("keeps placed decor through a departure and refuses changes while driving", () => {
  const f = fixture();
  f.park();
  expect(
    f.room.decor.placeDecor(decorSlotId("stove"), decorItemId("percolator")),
  ).toBe(true);
  f.step();
  expect(f.step(PUSH).depart).toEqual(departure(f.pose));
  expect(f.room.decor.decor()).toEqual([{ slot: "stove", item: "percolator" }]);
  expect(
    f.room.decor.decorSlotFor(
      decorItemId("enamel_kettle"),
      slotPoint(f.pose, stove),
      decorSlotCell(f.pose, stove),
      false,
    ),
  ).toBeUndefined();
  expect(
    f.room.decor.placeDecor(decorSlotId("table"), decorItemId("mug_pair")),
  ).toBe(false);
  expect(
    f.room.decor.removeDecor(decorSlotCell(f.pose, stove)),
  ).toBeUndefined();
});

it("places the item in the pressed slot ahead of a nearer free slot (ADR 0097)", () => {
  const f = fixture();
  f.park();
  f.step();
  expect(
    f.room.decor.decorSlotFor(
      decorItemId("mug_pair"),
      slotPoint(f.pose, slotNamed("dashboard_center")),
      decorSlotCell(f.pose, slotNamed("dashboard_left")),
      false,
    ),
  ).toBe("dashboard_left");
});

it("puts the stove item on its one burner and takes no second item while it holds one (ADR 0107, 0112)", () => {
  fc.assert(
    fc.property(fc.constantFrom(0, 90, 180, -90), (yaw) => {
      const f = fixture(undefined, yaw);
      f.park();
      f.step();
      const burner = stove;
      const cell = decorSlotCell(f.pose, burner);
      const point = slotPoint(f.pose, burner);
      expect(
        f.room.decor.decorSlotFor(decorItemId("saucepan"), point, cell, false),
      ).toBe("stove");
      expect(
        f.room.decor.placeDecor(decorSlotId("stove"), decorItemId("saucepan")),
      ).toBe(true);
      expect(
        f.room.decor.placeDecor(
          decorSlotId("stove"),
          decorItemId("enamel_kettle"),
        ),
      ).toBe(false);
      expect(
        f.room.decor.decorSlotFor(
          decorItemId("enamel_kettle"),
          point,
          cell,
          true,
        ),
      ).toBeUndefined();
      expect(
        decorSlot(
          defined(
            f.room.decor.decorSlotFor(
              decorItemId("enamel_kettle"),
              point,
              cell,
              false,
            ),
            "fallback slot",
          ),
        )?.cell,
      ).not.toEqual(burner.cell);
      const laid = defined(f.step().dock, "laid dock").cells;
      expect(
        laid.filter((c) => c.x === cell.x && c.y === cell.y && c.z === cell.z),
      ).toEqual([
        {
          ...cell,
          block: {
            type: "decor",
            item: "saucepan",
            face: quarterOf(f.pose.yaw),
            height: 15,
            spot: 0,
          },
        },
      ]);
      expect(f.room.decor.removeDecor(cell)).toBe("saucepan");
      expect(f.room.decor.decor()).toEqual([]);
    }),
  );
});

it("replaces the stove's item when a test sets it again, and refuses the removed burner slots (ADR 0107, 0112)", () => {
  const f = fixture();
  expect(
    f.room.decor.setDecor(decorSlotId("stove"), decorItemId("saucepan")),
  ).toBe(true);
  for (const old of ["stove_rear", "stove_wall", "stove_wall_rear"])
    expect(
      f.room.decor.setDecor(decorSlotId(old), decorItemId("enamel_kettle")),
    ).toBe(false);
  expect(
    f.room.decor.setDecor(decorSlotId("stove"), decorItemId("enamel_kettle")),
  ).toBe(true);
  expect(f.room.decor.decor()).toEqual([
    { slot: "stove", item: "enamel_kettle" },
  ]);
});

it("loads decor saved on a removed stove burner slot onto the stove (ADR 0112)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("stove", "stove_rear", "stove_wall", "stove_wall_rear"),
      fc.constantFrom(...CAMPING_GEAR_IDS),
      (old, item) => {
        fc.pre(slotsFor(decorItemId(item)).some((s) => s.id === "stove"));
        const saved = JSON.stringify([
          { slot: decorSlotId(old), item: decorItemId(item) },
        ]);
        expect(
          camperRoom(
            new CamperDrive(0, { [CAMPER_SAVED.decor]: saved }),
          ).decor.decor(),
        ).toEqual([{ slot: "stove", item: item }]);
      },
    ),
  );
});

it("holds two items on the table: a press on its cell sends the next item to the free end, one pair block draws both, an empty-hand press takes back the end nearest the press, and the camper departs past the pair block (ADR 0108)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90),
      fc.constantFrom(["table", "table_aisle"]),
      fc.boolean(),
      (yaw, ends, swap) => {
        const f = fixture(undefined, yaw);
        f.park();
        f.step();
        const [first, second] = (swap ? [...ends].reverse() : ends).map(
          slotNamed,
        );
        if (!first?.pair || !second?.pair) throw new Error("no pair ends");
        const cell = decorSlotCell(f.pose, first);
        expect(decorSlotCell(f.pose, second)).toEqual(cell);
        const at = (s: typeof first) => slotPoint(f.pose, s);
        expect(
          f.room.decor.decorSlotFor(
            decorItemId("cushion"),
            at(first),
            cell,
            false,
          ),
        ).toBe(first.id);
        expect(f.room.decor.placeDecor(first.id, decorItemId("cushion"))).toBe(
          true,
        );
        // Even a press on the first item sends the next one to the free end.
        expect(
          f.room.decor.decorSlotFor(
            decorItemId("book_stack"),
            at(first),
            cell,
            false,
          ),
        ).toBe(second.id);
        expect(
          f.room.decor.placeDecor(second.id, decorItemId("book_stack")),
        ).toBe(true);
        expect(
          f.room.decor.decorSlotFor(
            decorItemId("toaster"),
            at(first),
            cell,
            true,
          ),
        ).toBeUndefined();
        const both = [
          { slot: first.id, item: decorItemId("cushion") },
          { slot: second.id, item: decorItemId("book_stack") },
        ];
        const laid = defined(f.step().dock, "laid dock").cells.filter(
          (c) => cellKey(c) === cellKey(cell),
        );
        expect(laid).toEqual(decorCells(f.pose, both));
        expect(laid[0]?.block).toEqual({
          type: "decorPair",
          pair: first.pair.kind,
          face: quarterOf(f.pose.yaw),
          height: first.height,
          [`end${first.pair.end}`]: "cushion",
          [`end${second.pair.end}`]: "book_stack",
        });
        f.blocks.set(cellKey(cell), `yasu_ride:${first.pair.kind}_decor_pair`);
        expect(f.room.decor.removeDecor(cell, at(second))).toBe("book_stack");
        expect(f.room.decor.decor()).toEqual([
          { slot: first.id, item: "cushion" },
        ]);
        expect(
          f.room.decor.placeDecor(second.id, decorItemId("book_stack")),
        ).toBe(true);
        expect(f.room.decor.removeDecor(cell, at(first))).toBe("cushion");
        expect(f.room.decor.placeDecor(first.id, decorItemId("cushion"))).toBe(
          true,
        );
        f.step();
        f.blocks.set(cellKey(cell), `yasu_ride:cushion_decor`);
        expect(f.step(PUSH).message).toBe("clear_cargo");
        f.step(NEUTRAL);
        f.blocks.set(cellKey(cell), `yasu_ride:${first.pair.kind}_decor_pair`);
        expect(f.step(PUSH).depart).toBeDefined();
      },
    ),
  );
});

it("takes back the pair end the line of sight is aimed at, though the press lands nearer the other end (ADR 0108, 0110)", () => {
  const f = fixture(undefined, 0);
  f.park();
  f.step();
  const near = slotNamed("table_aisle");
  const far = slotNamed("table");
  const fill = () => {
    f.room.decor.setDecor(near.id, decorItemId("mug_pair"));
    f.room.decor.setDecor(far.id, decorItemId("fruit_bowl"));
  };
  fill();
  // At yaw 0 the aisle is toward -x. Seen from the aisle, the ray toward the wall-side item
  // enters the pair block's 8 px tall box halfway to the eye, over the aisle-side half.
  const aim = slotPoint(f.pose, far);
  const eye = { x: aim.x - 1.2, y: aim.y + 1, z: aim.z };
  const point = {
    x: (aim.x + eye.x) / 2,
    y: (aim.y + eye.y) / 2,
    z: (aim.z + eye.z) / 2,
  };
  const cell = decorSlotCell(f.pose, far);
  expect(f.room.decor.removeDecor(cell, point)).toBe("mug_pair");
  fill();
  expect(f.room.decor.removeDecor(cell, point, eye)).toBe("fruit_bowl");
  expect(f.room.decor.decor()).toEqual([{ slot: near.id, item: "mug_pair" }]);
});

it("moves a second saved entry of the stove, under any of its old slot ids, to a free slot (ADR 0107, 0112)", () => {
  const saved = JSON.stringify([
    { slot: decorSlotId("stove_wall"), item: decorItemId("percolator") },
    { slot: decorSlotId("stove_rear"), item: decorItemId("saucepan") },
  ]);
  expect(
    camperRoom(
      new CamperDrive(0, { [CAMPER_SAVED.decor]: saved }),
    ).decor.decor(),
  ).toEqual([
    { slot: "dashboard_center", item: "saucepan" },
    { slot: "stove", item: "percolator" },
  ]);
});

it("refuses an exact press on a taken slot instead of offering another one (ADR 0104)", () => {
  const f = fixture();
  f.park();
  f.step();
  expect(
    f.room.decor.placeDecor(decorSlotId("stove"), decorItemId("percolator")),
  ).toBe(true);
  const point = slotPoint(f.pose, stove);
  const cell = decorSlotCell(f.pose, stove);
  expect(
    f.room.decor.decorSlotFor(decorItemId("toaster"), point, cell, true),
  ).toBeUndefined();
  expect(
    f.room.decor.decorSlotFor(decorItemId("toaster"), point, cell, false),
  ).toBeDefined();
});

it("picks the free slot along the line of sight from the eye when one is given (ADR 0110)", () => {
  const f = fixture();
  f.park();
  f.step();
  const counter = slotNamed("counter");
  const aim = slotPoint(f.pose, counter);
  const beside = slotPoint(f.pose, stove);
  // The eye leans over the counter from beyond it, so the press lands under the stove.
  const eye = {
    x: 2 * aim.x - beside.x,
    y: aim.y + 1.2,
    z: 2 * aim.z - beside.z,
  };
  // Twice as far from the eye as the counter top, in a cell that holds no slot.
  const point = {
    x: 2 * aim.x - eye.x,
    y: 2 * aim.y - eye.y,
    z: 2 * aim.z - eye.z,
  };
  const cell = {
    x: Math.floor(point.x),
    y: Math.floor(point.y),
    z: Math.floor(point.z),
  };
  expect(
    f.room.decor.decorSlotFor(decorItemId("saucepan"), point, cell, false),
  ).not.toBe("counter");
  expect(
    f.room.decor.decorSlotFor(decorItemId("saucepan"), point, cell, false, eye),
  ).toBe("counter");
});

describe("shower-toilet (ADR 0094)", () => {
  const named = (out: DriveStep, name: string) =>
    out.commands.filter((c) => c.type === "setProperty" && c.name === name);

  it("ignores the shower door and the shower until parked", () => {
    const f = fixture();
    expect(f.room.fixtures.pressShowerToilet(f.pose, f.ctx.tick)).toBe(false);
    expect(
      f.room.fixtures.pressShowerToilet(showerFeet(f.pose), f.ctx.tick),
    ).toBe(false);
  });

  it("runs the shower for exactly showerTicks ticks and starts over on a new tap", () => {
    const f = fixture();
    f.park();
    f.step();
    expect(
      f.room.fixtures.pressShowerToilet(showerFeet(f.pose), f.ctx.tick),
    ).toBe(true);
    expect(f.step().commands).toContainEqual({
      type: "setProperty",
      name: "shower",
      value: true,
    });
    for (let i = 0; i < CAMPER_SPEC.showerTicks - 1; i++)
      expect(named(f.step(), "shower")).toEqual([]);
    expect(f.step().commands).toContainEqual({
      type: "setProperty",
      name: "shower",
      value: false,
    });
    const off = { type: "setProperty", name: "shower", value: false };
    f.room.fixtures.pressShowerToilet(showerFeet(f.pose), f.ctx.tick);
    for (let i = 0; i < 50; i++) f.step();
    f.room.fixtures.pressShowerToilet(showerFeet(f.pose), f.ctx.tick);
    for (let i = 0; i < CAMPER_SPEC.showerTicks; i++)
      expect(f.step().commands).not.toContainEqual(off);
    expect(f.step().commands).toContainEqual(off);
  });

  it("shuts the shower door and stops the shower on departure", () => {
    const f = fixture();
    f.park();
    f.step();
    f.room.fixtures.pressShowerToilet(showerFeet(f.pose), f.ctx.tick);
    f.room.fixtures.pressShowerToilet(f.pose, f.ctx.tick);
    for (let i = 0; i < CAMPER_SPEC.doorSwingTicks; i++) f.step();
    const out = f.step(PUSH);
    expect(out.commands).toContainEqual({
      type: "setProperty",
      name: "shower_door",
      value: 0,
    });
    expect(out.commands).toContainEqual({
      type: "setProperty",
      name: "shower",
      value: false,
    });
    expect(out.depart).toBeDefined();
    expect(
      f.room.fixtures.pressShowerToilet(showerFeet(f.pose), f.ctx.tick),
    ).toBe(false);
  });

  it("restores the shower door's swing but not the shower after a reload", () => {
    const f = fixture();
    const restored = (showerDoor: number) =>
      new CamperDrive(37, {
        form: "car",
        docked: true,
        door: 0,
        [CAMPER_SAVED.laid]: true,
        shower_door: showerDoor,
      });
    const open = restored(1).step(undefined, f.ctx);
    expect(open.commands).toContainEqual({
      type: "setProperty",
      name: "shower_door",
      value: 1,
    });
    expect(open.commands).toContainEqual({
      type: "setProperty",
      name: "shower",
      value: false,
    });
    const partial = restored(0.3);
    for (const value of [0.2, 0.1, 0])
      expect(partial.step(undefined, f.ctx).commands).toContainEqual({
        type: "setProperty",
        name: "shower_door",
        value,
      });
  });
});

it("keeps the compact toilet seat while parked and ignores its stick (ADR 0095)", () => {
  const f = fixture();
  f.park();
  f.step();
  const out = f.drive.step(undefined, {
    ...f.ctx,
    tick: 99,
    deckSeatInputs: [undefined, undefined, undefined, undefined, PUSH],
  });
  expect(out.dock?.seats).toHaveLength(5);
  expect(out.dock?.seats[4]?.compact).toBe(true);
  // ADR 0109: every parked deck seat names where its rider stands up.
  expect(out.dock?.seats.every((seat) => seat?.stand !== undefined)).toBe(true);
  expect(out.boardDeckRiders).toBe(false);
  expect(out.depart).toBeUndefined();
  expect(f.drive.inspect().parked).toBe(true);
});

it("restores dashboard saves at the new spots in every facing and relocates gear that no longer fits", () => {
  for (const yaw of [0, 90, 180, -90]) {
    const saved = [
      { slot: "dashboard_center", item: "road_map" },
      { slot: "dashboard_left", item: "mug_pair" },
      { slot: "table", item: "cushion" },
    ];
    const drive = new CamperDrive(yaw, {
      [CAMPER_SAVED.decor]: JSON.stringify(saved),
    });
    expect(camperRoom(drive).decor.decor()).toEqual(saved);
    const blocks = decorCells(
      parkPose({ x: 0, y: 0, z: 0 }, yaw),
      camperRoom(drive).decor.decor(),
    );
    expect(blocks.map((c) => c.block)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "decor", item: "road_map", spot: 9 }),
        expect.objectContaining({ type: "decor", item: "mug_pair", spot: 10 }),
      ]),
    );
    const oversized = new CamperDrive(yaw, {
      [CAMPER_SAVED.decor]: JSON.stringify([
        { slot: "dashboard_center", item: "cushion" },
        { slot: "dashboard_left", item: "binoculars" },
      ]),
    });
    expect(
      camperRoom(oversized)
        .decor.decor()
        .map((e) => e.item)
        .sort(),
    ).toEqual(["binoculars", "cushion"]);
    expect(
      camperRoom(oversized)
        .decor.decor()
        .every((e) => !e.slot.startsWith("dashboard_")),
    ).toBe(true);
  }
});
