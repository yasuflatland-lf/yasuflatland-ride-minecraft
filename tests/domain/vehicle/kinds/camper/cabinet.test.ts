// The wall cabinet's two doors and the items behind them (ADR 0114).
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { cellKey } from "../../../../../src/domain/shared/cells";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { decorFace } from "../../../../../src/domain/vehicle/dock/decor";
import type {
  DockBlock,
  DockCell,
} from "../../../../../src/domain/vehicle/dock/floor";
import type {
  DriveStep,
  TickContext,
} from "../../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../../src/domain/vehicle/driveInput";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  STORAGE_DOORS,
  type StorageDoorId,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  AIR,
  localCellAt,
  parkPose,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";
import { defined } from "../../../../support/defined";

const PUSH = { moveX: 0, moveY: 1, jump: false };
const SWING = CAMPER_SPEC.doorSwingTicks;
const DOORS = ["sink", "stove"] as const satisfies readonly StorageDoorId[];
const PROPERTY = {
  sink: "cabinet_sink_door",
  stove: "cabinet_stove_door",
} as const;

function fixture(yaw = 37, restored: Record<string, unknown> = {}) {
  const ctx: TickContext = {
    tick: 0,
    location: { x: 10.2, y: 64.005, z: -8.7 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: vi.fn((cells: readonly Vec3[]) => cells.map(() => AIR)),
  };
  const drive = new CamperDrive(yaw, restored);
  const pose = parkPose(ctx.location, drive.yaw);
  const step = (raw?: RawInput): DriveStep =>
    drive.step(raw, { ...ctx, tick: ctx.tick++ });
  const park = () => {
    for (let i = 0; i <= DOCK.ticks; i++) step();
  };
  const placeOf = (door: StorageDoorId) =>
    defined(
      STORAGE_DOORS.find((d) => d.id === door),
      door,
    );
  const compartment = (door: StorageDoorId) =>
    localCellAt(pose, placeOf(door).compartment);
  const aisle = (door: StorageDoorId) => localCellAt(pose, placeOf(door).plate);
  const press = (
    door: StorageDoorId,
    at: "compartment" | "aisle",
    point?: Vec3,
  ) =>
    drive.pressStorage(
      at === "compartment" ? compartment(door) : aisle(door),
      point,
      ctx.tick,
    );
  // Steps past the door's tap window, so the next press counts (ADR 0105).
  const settle = () => {
    for (let i = 0; i < SWING; i++) step();
  };
  return { ctx, drive, pose, step, park, compartment, aisle, press, settle };
}

const slotNamed = (id: string) =>
  defined(
    DECOR_SLOTS.find((s) => s.id === id),
    id,
  );
const blockAt = (cells: readonly DockCell[] | undefined, at: Vec3) =>
  cells?.find((c) => cellKey(c) === cellKey(at))?.block;
const propertyValues = (out: DriveStep, name: string) =>
  out.commands
    .filter((c) => c.type === "setProperty" && c.name === name)
    .map((c) => (c.type === "setProperty" ? c.value : undefined));

it("ignores presses on the cabinet until parked, and on cells that are not the cabinet's", () => {
  const f = fixture();
  expect(f.press("sink", "compartment")).toBeUndefined();
  f.park();
  const c = f.compartment("sink");
  expect(
    f.drive.pressStorage({ ...c, y: c.y - 1 }, undefined, f.ctx.tick),
  ).toBeUndefined();
});

it("opens one door per press, swings it in ten bounded steps each way, lays its plate in the aisle while open, and leaves the other door shut (ADR 0114)", () => {
  for (const door of DOORS) {
    const other = DOORS.find((d) => d !== door) ?? door;
    const f = fixture();
    f.park();
    expect(f.press(door, "compartment")).toEqual({ kind: "door" });
    for (const open of [true, false]) {
      if (!open) expect(f.press(door, "aisle")).toEqual({ kind: "door" });
      for (let tick = 1; tick <= SWING; tick++) {
        const out = f.step();
        expect(propertyValues(out, PROPERTY[door])).toEqual([
          (open ? tick : SWING - tick) / SWING,
        ]);
        expect(propertyValues(out, PROPERTY[other])).toEqual([]);
        const cells = out.dock?.cells;
        // The items show while the door is open or still swinging shut.
        expect(blockAt(cells, f.compartment(door))).toMatchObject({
          type: "cabinet",
          open: open || tick < SWING,
        });
        expect(blockAt(cells, f.compartment(other))).toMatchObject({
          type: "cabinet",
          open: false,
        });
        expect(blockAt(cells, f.aisle(door))?.type).toBe(
          open ? "cabinetDoor" : "ceiling",
        );
        expect(blockAt(cells, f.aisle(other))?.type).toBe("ceiling");
      }
    }
  }
});

it("acts once for two presses within a swing and twice for presses a swing apart, whichever cell takes them (ADR 0105, 0114)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 2 * SWING }),
      fc.constantFrom(...DOORS),
      (gap, door) => {
        const f = fixture();
        f.park();
        const first = f.ctx.tick;
        expect(f.press(door, "compartment")).toEqual({ kind: "door" });
        while (f.ctx.tick < first + gap) f.step();
        const second = f.press(door, "compartment");
        expect(second).toEqual(gap >= SWING ? { kind: "door" } : undefined);
        let last: unknown;
        for (let i = 0; i < 2 * SWING; i++)
          last = propertyValues(f.step(), PROPERTY[door]).at(-1) ?? last;
        expect(last).toBe(gap >= SWING ? 0 : 1);
      },
    ),
  );
});

it("takes back the item at the pressed end of an open compartment, and shuts the door from an empty end (ADR 0114)", () => {
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
        expect(f.drive.setDecor(heldEnd.id, "mug_pair")).toBe(true);
        f.park();
        // Shut, a press opens the door and takes nothing.
        expect(
          f.press(door, "compartment", slotPoint(f.pose, heldEnd)),
        ).toEqual({ kind: "door" });
        f.settle();
        expect(
          f.press(door, "compartment", slotPoint(f.pose, heldEnd)),
        ).toEqual({ kind: "item", item: "mug_pair" });
        expect(f.drive.decor()).toEqual([]);
        f.settle();
        expect(
          f.press(door, "compartment", slotPoint(f.pose, emptyEnd)),
        ).toEqual({ kind: "door" });
        f.settle();
        const last = f.step();
        expect(propertyValues(last, PROPERTY[door])).toEqual([]);
        expect(blockAt(last.dock?.cells, f.compartment(door))).toEqual({
          type: "cabinet",
          face: decorFace(f.pose.yaw),
          open: false,
        });
      },
    ),
  );
});

it("places gear behind an open door only, and never takes a cabinet item through an ordinary decor press (ADR 0114)", () => {
  const f = fixture(90);
  f.park();
  const sink = slotNamed("cabinet_sink_rear");
  const point = slotPoint(f.pose, sink);
  const cell = f.compartment("sink");
  const shut = f.drive.decorSlotFor("mug_pair", point, cell, false);
  expect(shut).toBeDefined();
  expect(slotNamed(defined(shut, "slot")).door).toBeUndefined();
  expect(f.drive.decorSlotFor("mug_pair", point, cell, true)).toBeUndefined();
  expect(f.drive.placeDecor(sink.id, "mug_pair")).toBe(false);
  f.press("sink", "compartment");
  expect(f.drive.decorSlotFor("mug_pair", point, cell, false)).toBe(sink.id);
  expect(f.drive.placeDecor(sink.id, "mug_pair")).toBe(true);
  expect(f.drive.decorSlotFor("cushion", point, cell, false)).toBe(
    "cabinet_sink_front",
  );
  expect(f.drive.removeDecor(cell, point)).toBeUndefined();
  expect(f.drive.decor()).toEqual([{ slot: sink.id, item: "mug_pair" }]);
  f.step();
  const laid = blockAt(f.step().dock?.cells, cell);
  expect(laid).toEqual({
    type: "cabinet",
    face: decorFace(f.pose.yaw),
    open: true,
    end0: "mug_pair",
  } satisfies DockBlock);
  // The stove's compartment stays shut, so a press on it sends the item elsewhere.
  const stoveSide = f.drive.decorSlotFor(
    "cushion",
    slotPoint(f.pose, slotNamed("cabinet_stove_rear")),
    f.compartment("stove"),
    false,
  );
  expect(slotNamed(defined(stoveSide, "slot")).door).not.toBe("stove");
});

it("shuts both doors at once on departure, keeps their items, and lays them shut on the next park (ADR 0114)", () => {
  const f = fixture();
  f.drive.setDecor("cabinet_stove_front", "toaster");
  f.park();
  f.press("sink", "compartment");
  f.press("stove", "compartment");
  for (let i = 0; i < SWING; i++) f.step();
  const out = f.step(PUSH);
  expect(out.depart).toBeDefined();
  for (const door of DOORS)
    expect(propertyValues(out, PROPERTY[door])).toEqual([0]);
  expect(f.drive.decor()).toEqual([
    { slot: "cabinet_stove_front", item: "toaster" },
  ]);
  let cells: readonly DockCell[] = [];
  for (let i = 0; i < 200 && cells.length === 0; i++)
    cells = f.step().dock?.cells ?? [];
  expect(blockAt(cells, f.compartment("stove"))).toEqual({
    type: "cabinet",
    face: decorFace(f.pose.yaw),
    open: false,
    end1: "toaster",
  });
  for (const door of DOORS)
    expect(blockAt(cells, f.aisle(door))).toEqual({ type: "ceiling" });
});

it("restores each door's swing after a reload of a parked camper, and shuts it when the camper was not parked (ADR 0114)", () => {
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
          cabinet_sink_door: swing,
          cabinet_stove_door: 1 - swing,
        });
        const out = drive.step(undefined, f.ctx);
        const step = (v: number) => (docked ? Math.round(v * SWING) : 0);
        const toward = (s: number) =>
          (s + Math.sign((s * 2 >= SWING ? SWING : 0) - s)) / SWING;
        expect(propertyValues(out, PROPERTY.sink)).toEqual([
          toward(step(swing)),
        ]);
        expect(propertyValues(out, PROPERTY.stove)).toEqual([
          toward(step(1 - swing)),
        ]);
      },
    ),
  );
});

it("stores saved decor of a removed slot in a shut cabinet once every open spot is full (ADR 0103, 0114)", () => {
  const open = DECOR_SLOTS.filter((s) => !s.hanging && s.door === undefined);
  const full = open.map((s) => ({ slot: s.id, item: "potted_plant" }));
  const drive = new CamperDrive(0, {
    dockDecor: JSON.stringify([
      ...full,
      { slot: "wall_cabinet_front", item: "book_stack" },
    ]),
  });
  expect(drive.decor()).toEqual([
    ...full,
    { slot: "cabinet_sink_rear", item: "book_stack" },
  ]);
});
