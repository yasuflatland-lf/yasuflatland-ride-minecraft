import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type {
  DriveStep,
  TickContext,
} from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { cellKey } from "../../../../../src/domain/vehicle/headlights";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  AIR,
  CLEARABLE_DECORATIONS,
  cargoCells,
  departure,
  parkCheckCells,
  parkPose,
  roomCells,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";
import { defined } from "../../../../support/defined";

const PUSH = { moveX: 0, moveY: 1, jump: false };
const NEUTRAL = { moveX: 0, moveY: 0, jump: false };
function fixture() {
  const blocks = new Map<string, string>();
  const blockTypes = vi.fn(
    (cells: readonly { x: number; y: number; z: number }[]) =>
      cells.map((c) => blocks.get(cellKey(c)) ?? AIR),
  );
  const ctx: TickContext = {
    tick: 0,
    location: { x: 10.2, y: 64.005, z: -8.7 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    targets: () => [],
    blockTypes,
  };
  const drive = new CamperDrive(37, {});
  const pose = parkPose(ctx.location, drive.yaw);
  const step = (raw?: RawInput): DriveStep =>
    drive.step(raw, { ...ctx, tick: ctx.tick++ });
  const park = () => {
    for (let i = 0; i < DOCK.ticks; i++) step();
  };
  return { blocks, blockTypes, ctx, drive, pose, step, park };
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
  expect(f.step().dock?.cells).toEqual(roomCells(f.pose, false));
  expect(f.blockTypes).toHaveBeenCalledExactlyOnceWith(parkCheckCells(f.pose));
  expect(f.drive.isParked).toBe(true);
  expect(f.drive.speed).toBe(0);
});

it("refuses any blocking cell once per stop, then retries after the stick resets the stop", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 165 }),
      fc.string().filter((t) => t !== AIR && !CLEARABLE_DECORATIONS.has(t)),
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
        expect(f.drive.isParked).toBe(true);
        expect(f.blockTypes).toHaveBeenCalledTimes(2);
      },
    ),
  );
});

it("clears only decorations once on the tick after parking, top first", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 165 }), {
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
  expect(f.drive.isParked).toBe(false);
  expect(f.blockTypes).toHaveBeenLastCalledWith(cargoCells(f.pose));
});

it("refuses cargo only on each press and requires a new press after cargo is cleared", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 62 }), (index) => {
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

it("toggles all three door cells and swings the model in ten bounded steps each way", () => {
  const f = fixture();
  expect(f.drive.useDockDoor()).toBe(false);
  f.park();
  expect(f.drive.useDockDoor()).toBe(true);
  for (const open of [true, false]) {
    if (!open) expect(f.drive.useDockDoor()).toBe(true);
    for (let tick = 1; tick <= 10; tick++) {
      const out = f.step();
      const doors = out.dock?.cells.filter((c) => c.block.type === "door");
      expect(doors).toHaveLength(3);
      expect(
        doors?.every((c) => c.block.type === "door" && c.block.open === open),
      ).toBe(true);
      expect(out.commands).toContainEqual({
        type: "setProperty",
        name: "door",
        value: (open ? tick : 10 - tick) / 10,
      });
    }
    expect(f.step().commands).toEqual([]);
  }
});

it("restores a laid open room immediately without a scan or dock event", () => {
  const f = fixture();
  const drive = new CamperDrive(90, { form: "car", docked: true, door: 1 });
  drive.onDriverMounted(-45);
  const out = drive.step(undefined, f.ctx);
  expect(out.dock?.cells).toEqual(
    roomCells(parkPose(f.ctx.location, 90), true),
  );
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
