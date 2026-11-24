import fc from "fast-check";
import { expect, it } from "vitest";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  DRAWER_SPLIT_HEIGHT,
  drawerAtHeight,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import { CAMPER_SAVED } from "../../../../../src/domain/vehicle/kinds/camper/saved";
import { camperRoom } from "../../../../support/camperRoom";

const pose = { x: 180.5, y: -60, z: 90.5, yaw: 0 };
// Device cell (-2,-59,4) translated to the parked pose's counter cell, aisle +x.
const cell = { x: 179, y: -59, z: 89 };
const eye = { x: cell.x + 1.7, y: cell.y + 0.52, z: cell.z + 0.7 };
const ctx = (tick: number) => ({
  tick,
  location: pose,
  velocity: { x: 0, y: 0, z: 0 },
  blockTypes: (cells: readonly unknown[]) => cells.map(() => "minecraft:air"),
  onGround: true,
  deckSeatInputs: [],
  solidAt: () => false,
  waterAt: () => false,
});

function drive(top: boolean, bottom: boolean) {
  const d = new CamperDrive(0, {
    docked: true,
    drawer_top: top ? 1 : 0,
    drawer_bottom: bottom ? 1 : 0,
    [CAMPER_SAVED.decor]: "[]",
  });
  d.step(undefined, ctx(100));
  return d;
}

function state(d: CamperDrive, tick: number) {
  for (let i = 0; i < 60; i += 1) d.step(undefined, ctx(tick + i));
  d.resync();
  const out = d.step(undefined, ctx(tick + 60));
  const read = (name: string) =>
    out.commands.find((c) => c.type === "setProperty" && c.name === name) as
      | { value: number }
      | undefined;
  return {
    top: (read("drawer_top")?.value ?? 0) > 0,
    bottom: (read("drawer_bottom")?.value ?? 0) > 0,
  };
}

function tap(d: CamperDrive, faceY: number, faceX = 0, faceZ = 0.5) {
  const point = { x: cell.x + faceX, y: cell.y + faceY, z: cell.z + faceZ };
  return camperRoom(d).storage.pressStorage({
    cell,
    point,
    tick: 200,
    eye,
    openOnly: false,
    drawersSideFace: true,
  });
}

const combos = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const;

it("uses the ray through an open upper drawer when a rerouted floor side face has no drawer height", () => {
  const floorPoint = { x: 180, y: -59.2, z: 89.125 };
  const head = { x: 180.784, y: -57.48, z: 89.822 };
  const direction = {
    x: floorPoint.x - head.x,
    y: floorPoint.y - head.y,
    z: floorPoint.z - head.z,
  };
  const d = drive(true, false);
  expect(
    camperRoom(d).storage.drawerTarget({
      cell: {
        x: 180,
        y: -60,
        z: 89,
      },
      eye: head,
      direction,
    }),
  ).toMatchObject({ cell });
  expect(drawerAtHeight(floorPoint.y - cell.y)).toBeUndefined();
  expect(
    camperRoom(drive(true, false)).storage.pressStorage({
      cell,
      point: floorPoint,
      tick: 200,
      eye: head,
      openOnly: false,
      drawersSideFace: true,
    }),
  ).toBeUndefined();
  expect(
    camperRoom(d).storage.pressStorage({
      cell,
      point: floorPoint,
      tick: 200,
      eye: head,
      openOnly: false,
      drawersSideFace: false,
    }),
  ).toMatchObject({ kind: "door" });
  expect(state(d, 300)).toEqual({ top: false, bottom: false });
});

it("toggles only the pressed drawer for true heights and corrected device taps in every state", () => {
  const taps = [
    { y: 0.3394165, x: 0, z: 0.6558795, door: "bottom" },
    { y: 0.8228302, x: 0, z: 0.367517, door: "top" },
    { y: 1 - 4.679 / 16, x: 0, z: 0.5, door: "top" },
    { y: 1 - 10.467 / 16, x: 0, z: 0.5, door: "bottom" },
  ] as const;
  for (const t of taps)
    for (const [top, bottom] of combos) {
      const d = drive(top, bottom);
      expect(tap(d, t.y, t.x, t.z)).toMatchObject({ kind: "door" });
      const after = state(d, 300);
      expect(after.top).toBe(t.door === "top" ? !top : top);
      expect(after.bottom).toBe(t.door === "bottom" ? !bottom : bottom);
    }
});

it("toggles exactly the drawer of the pressed height, whatever the depth", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 0.8749, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.constantFrom(...combos),
      (y, x, [top, bottom]) => {
        const d = drive(top, bottom);
        expect(tap(d, y, x)).toMatchObject({ kind: "door" });
        const after = state(d, 300);
        const door = drawerAtHeight(y);
        expect(after.top).toBe(door === "drawer_top" ? !top : top);
        expect(after.bottom).toBe(door === "drawer_bottom" ? !bottom : bottom);
        expect(y >= DRAWER_SPLIT_HEIGHT).toBe(door === "drawer_top");
      },
    ),
  );
});
