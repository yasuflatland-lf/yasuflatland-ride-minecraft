// The fridge in place of the shelf: two doors hinged at its front end, a compartment behind
// each, and plates in the aisle in the room's inside layers, all from the doored storage
// mechanism (ADR 0121, 0123).
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { decorFace } from "../../../../../src/domain/vehicle/dock/decor";
import type { DockCell } from "../../../../../src/domain/vehicle/dock/floor";
import type {
  DriveStep,
  TickContext,
} from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import { STORAGE_DOOR_PROPERTY } from "../../../../../src/domain/vehicle/kinds/camper/entity";
import {
  CEILING_LIGHTS,
  FRIDGE,
  type StorageDoorId,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  AIR,
  ceilingLightCells,
  localCellAt,
  parkPose,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";
import { defined } from "../../../../support/defined";

const PUSH = { moveX: 0, moveY: 1, jump: false };
const SWING = CAMPER_SPEC.doorSwingTicks;
const DOORS = [
  "fridge_bottom",
  "fridge_top",
] as const satisfies readonly StorageDoorId[];
const HEIGHT = { fridge_bottom: 3, fridge_top: 4 } as const;
const PLATE_BLOCK = "yasu_ride:camper_fridge_door";

function fixture(yaw = 37, restored: Record<string, unknown> = {}) {
  const blocks = new Map<string, string>();
  const ctx: TickContext = {
    tick: 0,
    location: { x: 10.2, y: 64.005, z: -8.7 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: vi.fn((cells: readonly Vec3[]) =>
      cells.map((c) => blocks.get(cellKey(c)) ?? AIR),
    ),
  };
  const drive = new CamperDrive(yaw, restored);
  const pose = parkPose(ctx.location, drive.yaw);
  const step = (raw?: RawInput): DriveStep =>
    drive.step(raw, { ...ctx, tick: ctx.tick++ });
  const park = () => {
    for (let i = 0; i <= DOCK.ticks; i++) step();
  };
  const door = (id: StorageDoorId) =>
    defined(
      FRIDGE.doors.find((d) => d.id === id),
      id,
    );
  const compartment = (id: StorageDoorId) =>
    localCellAt(pose, door(id).compartment);
  const plate = (id: StorageDoorId) => localCellAt(pose, door(id).plate);
  const press = (
    id: StorageDoorId,
    at: "compartment" | "plate",
    point?: Vec3,
  ) =>
    drive.pressStorage(
      at === "compartment" ? compartment(id) : plate(id),
      point,
      ctx.tick,
    );
  // Steps past the door's tap window, so the next press counts (ADR 0105).
  const settle = () => {
    for (let i = 0; i < SWING; i++) step();
  };
  // Feet on the floor under the front ceiling light, inside the room (ADR 0115).
  const front = defined(ceilingLightCells(pose)[0], "front light");
  const inside = { x: front.x + 0.5, y: front.y - 1, z: front.z + 0.5 };
  return {
    blocks,
    ctx,
    drive,
    pose,
    step,
    park,
    compartment,
    plate,
    press,
    settle,
    inside,
  };
}

const blockAt = (cells: readonly DockCell[] | undefined, at: Vec3) =>
  cells?.find((c) => cellKey(c) === cellKey(at))?.block;
const propertyValues = (out: DriveStep, name: string) =>
  out.commands
    .filter((c) => c.type === "setProperty" && c.name === name)
    .map((c) => (c.type === "setProperty" ? c.value : undefined));

it("opens one fridge door per press, swings it in ten bounded steps each way, stands its plate in the aisle cell beside the fridge while open, and leaves the other door shut (ADR 0105, 0121, 0123)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90),
      fc.constantFrom(...DOORS),
      (yaw, door) => {
        const other = DOORS.find((d) => d !== door) ?? door;
        const f = fixture(yaw);
        f.park();
        expect(f.press(door, "compartment")).toEqual({ kind: "door" });
        for (const open of [true, false]) {
          if (!open) expect(f.press(door, "plate")).toEqual({ kind: "door" });
          for (let tick = 1; tick <= SWING; tick++) {
            const out = f.step();
            expect(propertyValues(out, STORAGE_DOOR_PROPERTY[door])).toEqual([
              (open ? tick : SWING - tick) / SWING,
            ]);
            expect(propertyValues(out, STORAGE_DOOR_PROPERTY[other])).toEqual(
              [],
            );
            const cells = out.dock?.cells;
            // The items show while the door is open or still swinging shut.
            expect(blockAt(cells, f.compartment(door))).toEqual({
              type: "fridge",
              face: decorFace(f.pose.yaw),
              height: HEIGHT[door],
              open: open || tick < SWING,
            });
            expect(blockAt(cells, f.compartment(other))).toMatchObject({
              type: "fridge",
              open: false,
            });
            // The ceiling lights are off, so no plate is lit.
            expect(blockAt(cells, f.plate(door))).toEqual(
              open
                ? { type: "fridgeDoor", face: expect.any(Number), lit: false }
                : undefined,
            );
            expect(blockAt(cells, f.plate(other))).toBeUndefined();
          }
        }
      },
    ),
  );
});

it("acts once for two presses within a swing and twice for presses a swing apart, on the compartment or the plate (ADR 0105, 0123)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 2 * SWING }),
      fc.constantFrom(...DOORS),
      fc.constantFrom<"compartment" | "plate">("compartment", "plate"),
      (gap, door, second) => {
        const f = fixture();
        f.park();
        const first = f.ctx.tick;
        expect(f.press(door, "compartment")).toEqual({ kind: "door" });
        while (f.ctx.tick < first + gap) f.step();
        expect(f.press(door, second)).toEqual(
          gap >= SWING ? { kind: "door" } : undefined,
        );
        let last: unknown;
        for (let i = 0; i < 2 * SWING; i++)
          last =
            propertyValues(f.step(), STORAGE_DOOR_PROPERTY[door]).at(-1) ??
            last;
        expect(last).toBe(gap >= SWING ? 0 : 1);
      },
    ),
  );
});

it("takes back the item at the pressed end of an open compartment, and shuts the door from an empty end (ADR 0114, 0123)", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90),
      fc.constantFrom(...DOORS),
      fc.constantFrom<0 | 1>(0, 1),
      (yaw, door, held) => {
        const f = fixture(yaw);
        const ends = DECOR_SLOTS.filter((s) => s.door === door);
        const heldEnd = defined(ends[held], "held end");
        const emptyEnd = defined(ends[1 - held], "empty end");
        expect(f.drive.setDecor(heldEnd.id, "toaster")).toBe(true);
        f.park();
        expect(
          f.press(door, "compartment", slotPoint(f.pose, heldEnd)),
        ).toEqual({ kind: "door" });
        f.settle();
        expect(
          f.press(door, "compartment", slotPoint(f.pose, heldEnd)),
        ).toEqual({ kind: "item", item: "toaster" });
        expect(f.drive.decor()).toEqual([]);
        f.settle();
        expect(
          f.press(door, "compartment", slotPoint(f.pose, emptyEnd)),
        ).toEqual({ kind: "door" });
        f.settle();
        expect(blockAt(f.step().dock?.cells, f.compartment(door))).toEqual({
          type: "fridge",
          face: decorFace(f.pose.yaw),
          height: HEIGHT[door],
          open: false,
        });
      },
    ),
  );
});

it("places gear behind an open fridge door only, and lays it in the open compartment (ADR 0114, 0123)", () => {
  const f = fixture(90);
  f.park();
  const top = defined(
    DECOR_SLOTS.find((s) => s.id === "fridge_top_rear"),
    "top rear",
  );
  const point = slotPoint(f.pose, top);
  const cell = f.compartment("fridge_top");
  expect(f.drive.decorSlotFor("mug_pair", point, cell, true)).toBeUndefined();
  expect(f.drive.placeDecor(top.id, "mug_pair")).toBe(false);
  f.press("fridge_top", "compartment");
  expect(f.drive.decorSlotFor("mug_pair", point, cell, false)).toBe(top.id);
  expect(f.drive.placeDecor(top.id, "mug_pair")).toBe(true);
  expect(f.drive.removeDecor(cell, point)).toBeUndefined();
  f.step();
  expect(blockAt(f.step().dock?.cells, cell)).toEqual({
    type: "fridge",
    face: decorFace(f.pose.yaw),
    height: HEIGHT.fridge_top,
    open: true,
    end0: "mug_pair",
  });
});

it("lights the top door's plate in place of the front ceiling light while the lights are on, and never the bottom door's (ADR 0115, 0123)", () => {
  fc.assert(
    fc.property(fc.subarray([...DOORS]), fc.boolean(), (open, lightsOn) => {
      const f = fixture();
      f.park();
      if (lightsOn) expect(f.drive.switchCeilingLights(f.inside)).toBe(true);
      for (const door of open) f.press(door, "compartment");
      const cells = f.step().dock?.cells ?? [];
      const front = localCellAt(f.pose, defined(CEILING_LIGHTS[0], "front"));
      expect(cellKey(front)).toBe(cellKey(f.plate("fridge_top")));
      const topOpen = open.includes("fridge_top");
      expect(blockAt(cells, front)).toEqual(
        topOpen
          ? { type: "fridgeDoor", face: expect.any(Number), lit: lightsOn }
          : lightsOn
            ? { type: "light" }
            : undefined,
      );
      expect(blockAt(cells, f.plate("fridge_bottom"))).toEqual(
        open.includes("fridge_bottom")
          ? { type: "fridgeDoor", face: expect.any(Number), lit: false }
          : undefined,
      );
      expect(cells.filter((c) => c.block.type === "light")).toHaveLength(
        lightsOn ? CEILING_LIGHTS.length - (topOpen ? 1 : 0) : 0,
      );
    }),
  );
});

it("shuts both fridge doors on departure past their own plates, keeps their items, and lays them shut on the next park (ADR 0114, 0121, 0123)", () => {
  const f = fixture();
  f.drive.setDecor("fridge_bottom_front", "toaster");
  f.park();
  for (const door of DOORS) f.press(door, "compartment");
  f.settle();
  for (const door of DOORS) f.blocks.set(cellKey(f.plate(door)), PLATE_BLOCK);
  const out = f.step(PUSH);
  expect(out.depart).toBeDefined();
  for (const door of DOORS)
    expect(propertyValues(out, STORAGE_DOOR_PROPERTY[door])).toEqual([0]);
  expect(f.drive.decor()).toEqual([
    { slot: "fridge_bottom_front", item: "toaster" },
  ]);
  f.blocks.clear();
  let cells: readonly DockCell[] = [];
  for (let i = 0; i < 200 && cells.length === 0; i++)
    cells = f.step().dock?.cells ?? [];
  expect(blockAt(cells, f.compartment("fridge_bottom"))).toEqual({
    type: "fridge",
    face: decorFace(f.pose.yaw),
    height: HEIGHT.fridge_bottom,
    open: false,
    end1: "toaster",
  });
  for (const door of DOORS)
    expect(blockAt(cells, f.plate(door))).toBeUndefined();
});

it("refuses to depart while a player's block stands in a fridge door's aisle cell (ADR 0121, 0123)", () => {
  fc.assert(
    fc.property(fc.constantFrom(...DOORS), (door) => {
      const f = fixture();
      f.park();
      f.blocks.set(cellKey(f.plate(door)), "minecraft:stone");
      const out = f.step(PUSH);
      expect(out.depart).toBeUndefined();
      expect(out.message).toBe("clear_cargo");
    }),
  );
});

it("restores each fridge door's swing after a reload of a parked camper, and shuts it when the camper was not parked (ADR 0114, 0123)", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.boolean(),
      (swing, docked) => {
        const f = fixture();
        const drive = new CamperDrive(37, {
          form: "car",
          docked,
          dockLaid: true,
          fridge_top_door: swing,
          fridge_bottom_door: 1 - swing,
        });
        const out = drive.step(undefined, f.ctx);
        const step = (v: number) => (docked ? Math.round(v * SWING) : 0);
        const toward = (s: number) =>
          (s + Math.sign((s * 2 >= SWING ? SWING : 0) - s)) / SWING;
        expect(propertyValues(out, "fridge_top_door")).toEqual([
          toward(step(swing)),
        ]);
        expect(propertyValues(out, "fridge_bottom_door")).toEqual([
          toward(step(1 - swing)),
        ]);
      },
    ),
  );
});

it("loads decor saved on the shelf boards at the same end of the fridge compartment in that board's cell, out of sight until its door opens (ADR 0108, 0123)", () => {
  const saved = [
    { slot: "shelf_low", item: "book_stack" },
    { slot: "shelf_low_front", item: "cushion" },
    { slot: "shelf_high", item: "photo_frame" },
    { slot: "shelf_high_front", item: "mug_pair" },
  ];
  const f = fixture(0, { dockDecor: JSON.stringify(saved) });
  expect(f.drive.decor()).toEqual([
    { slot: "fridge_bottom_rear", item: "book_stack" },
    { slot: "fridge_bottom_front", item: "cushion" },
    { slot: "fridge_top_rear", item: "photo_frame" },
    { slot: "fridge_top_front", item: "mug_pair" },
  ]);
  f.park();
  const shut = f.step().dock?.cells;
  expect(blockAt(shut, f.compartment("fridge_top"))).toEqual({
    type: "fridge",
    face: decorFace(f.pose.yaw),
    height: HEIGHT.fridge_top,
    open: false,
    end0: "photo_frame",
    end1: "mug_pair",
  });
  f.press("fridge_top", "compartment");
  expect(blockAt(f.step().dock?.cells, f.compartment("fridge_top"))).toEqual(
    expect.objectContaining({ open: true }),
  );
});
