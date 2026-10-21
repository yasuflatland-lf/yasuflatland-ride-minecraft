import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type {
  DriveStep,
  TickContext,
} from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  slotPoint,
  slotsFor,
} from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  AIR,
  CLEARABLE_DECORATIONS,
  cargoCells,
  decorCells,
  decorSlotCell,
  departure,
  exitCells,
  parkCheckCells,
  parkPose,
  roomCells,
  showerFloorCell,
  wallFootCells,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";
import { defined } from "../../../../support/defined";

const PUSH = { moveX: 0, moveY: 1, jump: false };
const NEUTRAL = { moveX: 0, moveY: 0, jump: false };
const decorItem = fc.constantFrom("potted_plant", "percolator", "cushion");
const decor = fc
  .subarray([...DECOR_SLOTS])
  .chain((slots) =>
    fc.tuple(
      ...slots.map((s) => decorItem.map((item) => ({ slot: s.id, item }))),
    ),
  );
const shuffledDecor = fc
  .shuffledSubarray([...DECOR_SLOTS])
  .chain((slots) =>
    fc.tuple(
      ...slots.map((s) => decorItem.map((item) => ({ slot: s.id, item }))),
    ),
  );
const slotIndex = (p: { slot: string }) =>
  DECOR_SLOTS.findIndex((s) => s.id === p.slot);
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
        expect(f.drive.inspect().parked).toBe(true);
        expect(f.blockTypes).toHaveBeenCalledTimes(2);
      },
    ),
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
    ...exitCells(f.pose),
  ]);
});

it("refuses cargo only on each press and requires a new press after cargo is cleared", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 60 }), (index) => {
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
  const drive = new CamperDrive(90, {
    form: "car",
    docked: true,
    door: 1,
    dockLaid: true,
  });
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
          ...exitCells(f.pose),
        ]);
        expect(f.blockTypes.mock.calls.at(-1)?.[0]).toHaveLength(63);
      },
    ),
  );
});

it("recovers an unlaid parked room once, clearing matching plants before laying even after a blocked check", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: 0, max: 18 }),
      (blocked, index) => {
        const f = fixture();
        const drive = new CamperDrive(f.pose.yaw, {
          form: "car",
          docked: true,
          dockLaid: false,
        });
        const lower = defined(wallFootCells(f.pose)[index], "wall foot");
        const upper = { ...lower, y: lower.y + 1 };
        for (const cell of [lower, upper])
          f.blocks.set(cellKey(cell), "minecraft:tall_grass");
        if (blocked)
          f.blocks.set(
            cellKey(defined(cargoCells(f.pose)[0], "cargo cell")),
            "minecraft:stone",
          );
        const out = drive.step(undefined, f.ctx);
        expect(out.clear).toEqual([
          { ...upper, typeId: "minecraft:tall_grass" },
          { ...lower, typeId: "minecraft:tall_grass" },
        ]);
        expect(out.dock?.cells).toEqual(roomCells(f.pose, false));
        expect(f.blockTypes).toHaveBeenCalledExactlyOnceWith([
          ...parkCheckCells(f.pose),
          ...wallFootCells(f.pose),
        ]);
        for (let tick = 0; tick < 30; tick++)
          expect(drive.step(undefined, f.ctx).clear).toEqual([]);
        expect(f.blockTypes).toHaveBeenCalledTimes(1);
      },
    ),
  );
});

it("restores the saved door target through either direction of a partial swing", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.integer({ min: 1, max: 9 }), (open, step) => {
      const f = fixture();
      const drive = new CamperDrive(0, {
        form: "car",
        docked: true,
        dockLaid: true,
        door: step / 10,
        dockDoorOpen: open,
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
        expect(f.drive.setDecor(slot, item)).toBe(true);
        expect(f.drive.setDecor(slot, item)).toBe(false);
      }
      const sorted = [...placements].sort(
        (a, b) => slotIndex(a) - slotIndex(b),
      );
      expect(f.drive.decor()).toEqual(sorted);
      const first = placements[0];
      if (first) {
        const { slot, item }: { slot: string; item: string } = first;
        const otherItem = item === "mug_pair" ? "toaster" : "mug_pair";
        expect(f.drive.setDecor(slot, otherItem)).toBe(true);
        expect(f.drive.decor()).toContainEqual({ slot, item: otherItem });
        expect(f.drive.setDecor(slot, item)).toBe(true);
        expect(f.drive.decor()).toEqual(sorted);
      }
      expect(f.drive.setDecor("nowhere", "mug_pair")).toBe(false);
      expect(
        f.drive.setDecor(defined(DECOR_SLOTS[0], "slot").id, "Bad Item"),
      ).toBe(false);
      expect(f.drive.decor()).toEqual(sorted);
      for (const { slot } of placements) {
        expect(f.drive.setDecor(slot, undefined)).toBe(true);
        expect(f.drive.setDecor(slot, undefined)).toBe(false);
      }
      expect(f.drive.decor()).toEqual([]);
    }),
  );
});

it("lays the decor with the room on the tick after parking (ADR 0093)", () => {
  fc.assert(
    fc.property(decor, (placements) => {
      const f = fixture();
      for (const { slot, item } of placements) f.drive.setDecor(slot, item);
      f.park();
      expect(f.step().dock?.cells).toEqual([
        ...roomCells(f.pose, false),
        ...decorCells(f.pose, f.drive.decor()),
      ]);
    }),
  );
});

it("lays decor set while parked on the next step and clears an emptied slot", () => {
  const f = fixture();
  f.park();
  f.step();
  f.drive.setDecor("table", "potted_plant");
  expect(f.step().dock?.cells).toContainEqual(
    decorCells(f.pose, [{ slot: "table", item: "potted_plant" }])[0],
  );
  f.drive.setDecor("table", undefined);
  expect(f.step().dock?.cells.some((c) => c.block.type === "decor")).toBe(
    false,
  );
});

it("departs past its own decor blocks and refuses any other block in a decor cell (ADR 0093)", () => {
  const parked = () => {
    const f = fixture();
    f.drive.setDecor("table", "potted_plant");
    f.park();
    f.step();
    return f;
  };
  const f = parked();
  const table = defined(decorCells(f.pose, f.drive.decor())[0], "table cell");
  f.blocks.set(cellKey(table), "yasu_ride:potted_plant_decor");
  const out = f.step(PUSH);
  expect(out.depart).toBeDefined();
  expect(out.message).toBeUndefined();
  expect(f.blockTypes.mock.calls.at(-1)?.[0]).toEqual([
    ...cargoCells(f.pose, f.drive.decor()),
    ...decorCells(f.pose, f.drive.decor()).map(({ x, y, z }) => ({ x, y, z })),
    ...exitCells(f.pose),
  ]);

  const stone = parked();
  stone.blocks.set(cellKey(table), "minecraft:stone");
  const refused = stone.step(PUSH);
  expect(refused.message).toBe("clear_cargo");
  expect(refused.depart).toBeUndefined();

  const cargo = parked();
  cargo.blocks.set(
    cellKey(
      defined(cargoCells(cargo.pose, cargo.drive.decor())[0], "cargo cell"),
    ),
    "minecraft:stone",
  );
  expect(cargo.step(PUSH).message).toBe("clear_cargo");
});

it("keeps the decor through departure and lays it again on the next park", () => {
  const f = fixture();
  f.drive.setDecor("stove", "percolator");
  f.park();
  f.step();
  expect(f.step(PUSH).depart).toBeDefined();
  const stove = decorCells(f.pose, [{ slot: "stove", item: "percolator" }])[0];
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

it("restores saved decor in known slots only, docked or not", () => {
  const saved = JSON.stringify([
    { slot: "table", item: "potted_plant" },
    { slot: "nowhere", item: "cushion" },
    { slot: "stove", item: "Bad Item" },
  ]);
  const expected = [{ slot: "table", item: "potted_plant" }];
  expect(new CamperDrive(37, { dockDecor: saved }).decor()).toEqual(expected);
  expect(
    new CamperDrive(37, {
      dockDecor: saved,
      docked: true,
      dockLaid: true,
      form: "car",
    }).decor(),
  ).toEqual(expected);
});

const stove = defined(slotsFor("percolator")[0], "stove slot");

it("places and removes decor by hand once parked, and lays it with the room on the next step (ADR 0093)", () => {
  const f = fixture();
  for (let i = 1; i < DOCK.ticks; i++) f.step();
  const point = slotPoint(f.pose, stove);
  const cell = decorSlotCell(f.pose, stove);
  expect(f.drive.decorSlotFor("percolator", point)).toBeUndefined();
  expect(f.drive.placeDecor("stove", "percolator")).toBe(false);
  expect(f.drive.removeDecor(cell)).toBeUndefined();
  expect(f.drive.decor()).toEqual([]);

  expect(f.step().dock?.cells).toEqual([]);
  expect(f.drive.decorSlotFor("percolator", point)).toBe("stove");
  expect(f.drive.placeDecor("table", "percolator")).toBe(false);
  expect(f.drive.placeDecor("nowhere", "percolator")).toBe(false);
  expect(f.drive.placeDecor("stove", "percolator")).toBe(true);
  expect(f.drive.placeDecor("stove", "enamel_kettle")).toBe(false);
  expect(f.drive.decorSlotFor("enamel_kettle", point)).toBeUndefined();

  const laid = defined(f.step().dock, "laid dock").cells;
  expect(laid).toEqual(expect.arrayContaining(roomCells(f.pose, false)));
  const decorLaid = laid.filter((c) => c.block.type === "decor");
  expect(decorLaid).toHaveLength(1);
  expect(decorLaid[0]).toMatchObject({
    ...cell,
    block: { type: "decor", item: "percolator" },
  });
  expect(f.drive.decor()).toEqual([{ slot: "stove", item: "percolator" }]);

  expect(f.drive.removeDecor(cell)).toBe("percolator");
  expect(f.drive.removeDecor(cell)).toBeUndefined();
  const after = defined(f.step().dock, "laid dock").cells;
  expect(after.some((c) => c.block.type === "decor")).toBe(false);
  expect(f.drive.decor()).toEqual([]);
});

it("keeps placed decor through a departure and refuses changes while driving", () => {
  const f = fixture();
  f.park();
  expect(f.drive.placeDecor("stove", "percolator")).toBe(true);
  f.step();
  expect(f.step(PUSH).depart).toEqual(departure(f.pose));
  expect(f.drive.decor()).toEqual([{ slot: "stove", item: "percolator" }]);
  expect(
    f.drive.decorSlotFor("enamel_kettle", slotPoint(f.pose, stove)),
  ).toBeUndefined();
  expect(f.drive.placeDecor("table", "mug_pair")).toBe(false);
  expect(f.drive.removeDecor(decorSlotCell(f.pose, stove))).toBeUndefined();
});

describe("shower-toilet (ADR 0094)", () => {
  const ORIGIN = { x: 0, y: 0, z: 0 };
  const named = (out: DriveStep, name: string) =>
    out.commands.filter((c) => c.type === "setProperty" && c.name === name);

  it("ignores floor taps, the shower door, and the shower until parked", () => {
    const f = fixture();
    expect(f.drive.floorTap(showerFloorCell(f.pose), ORIGIN)).toBeUndefined();
    expect(f.drive.useShowerDoor()).toBe(false);
    expect(f.drive.runShower()).toBe(false);
  });

  it("routes a shower floor tap to the shower from inside its column and to the door from anywhere else", () => {
    const f = fixture();
    f.park();
    f.step();
    const floor = showerFloorCell(f.pose);
    fc.assert(
      fc.property(
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        (dx, dz) => {
          const player = {
            x: floor.x + 0.5 + dx,
            y: floor.y + 1,
            z: floor.z + 0.5 + dz,
          };
          const inside =
            Math.floor(player.x) === floor.x &&
            Math.floor(player.z) === floor.z;
          expect(f.drive.floorTap(floor, player)).toBe(
            inside ? "shower" : "showerDoor",
          );
          for (const c of roomCells(f.pose, false))
            if (cellKey(c) !== cellKey(floor))
              expect(f.drive.floorTap(c, player)).toBeUndefined();
          expect(
            f.drive.floorTap({ ...floor, y: floor.y + 1 }, player),
          ).toBeUndefined();
        },
      ),
    );
  });

  it("swings the shower door in ten bounded steps each way and leaves the entry door shut", () => {
    const f = fixture();
    f.park();
    expect(f.drive.useShowerDoor()).toBe(true);
    for (const open of [true, false]) {
      if (!open) expect(f.drive.useShowerDoor()).toBe(true);
      for (let tick = 1; tick <= 10; tick++) {
        const out = f.step();
        expect(out.commands).toContainEqual({
          type: "setProperty",
          name: "shower_door",
          value: (open ? tick : 10 - tick) / 10,
        });
        expect(
          out.dock?.cells
            .filter((c) => c.block.type === "door")
            .every((c) => c.block.type === "door" && c.block.open === false),
        ).toBe(true);
      }
      expect(f.step().commands).toEqual([]);
    }
  });

  it("runs the shower for exactly showerTicks ticks and starts over on a new tap", () => {
    const f = fixture();
    f.park();
    f.step();
    expect(f.drive.runShower()).toBe(true);
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
    f.drive.runShower();
    for (let i = 0; i < 50; i++) f.step();
    f.drive.runShower();
    for (let i = 0; i < CAMPER_SPEC.showerTicks; i++)
      expect(f.step().commands).not.toContainEqual(off);
    expect(f.step().commands).toContainEqual(off);
  });

  it("shuts the shower door and stops the shower on departure", () => {
    const f = fixture();
    f.park();
    f.step();
    f.drive.useShowerDoor();
    f.drive.runShower();
    for (let i = 0; i < 10; i++) f.step();
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
    expect(f.drive.runShower()).toBe(false);
    expect(f.drive.floorTap(showerFloorCell(f.pose), ORIGIN)).toBeUndefined();
  });

  it("restores the shower door's swing but not the shower after a reload", () => {
    const f = fixture();
    const restored = (showerDoor: number) =>
      new CamperDrive(37, {
        form: "car",
        docked: true,
        door: 0,
        dockLaid: true,
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
