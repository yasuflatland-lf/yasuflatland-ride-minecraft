import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { parseDecor } from "../../../../../src/domain/vehicle/dock/decor";
import {
  drawerBlockHit,
  drawerHit,
  drawerPressCell,
} from "../../../../../src/domain/vehicle/kinds/camper/drawerHit";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  DRAWER_COMPARTMENT,
  type StorageDoorId,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  axes,
  localCellAt,
} from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import {
  DRAWER_SLIDE_PX,
  DRAWER_HIT_PROFILE as HIT,
} from "../../../../../src/domain/vehicle/kinds/camper/spec";

import { decorItemId } from "../../../../support/decorIds";

const mug = decorItemId("mug_pair");
const pose = { x: 180.5, y: -60, z: 90.5, yaw: 0 };
const counter = { x: 179, y: -59, z: 89 };
const floor = { x: 180, y: -60, z: 89 };
const eye = { x: 180.784, y: -57.48, z: 89.822 };
const points = [
  { x: 180.146, y: -59, z: 89.125 },
  { x: 180.138, y: -59, z: 89.12 },
  { x: 180.059, y: -59, z: 89.845 },
];
const opened = new Set<StorageDoorId>(["drawer_bottom"]);
const contents = parseDecor('[{"slot":"drawer_bottom_0","item":"mug_pair"}]');
function drive(full = false, open = true) {
  const d = new CamperDrive(0, {
    docked: true,
    drawer_bottom: open ? 1 : 0,
    dockDecor: JSON.stringify(full ? contents : []),
  });
  d.step(undefined, {
    tick: 100,
    location: pose,
    velocity: { x: 0, y: 0, z: 0 },
    blockTypes: (cells) => cells.map(() => "minecraft:air"),
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
  });
  return d;
}
it("reconstructs the measured counter and aisle at the parked pose", () => {
  expect(localCellAt(pose, DRAWER_COMPARTMENT)).toEqual(counter);
  expect(localCellAt(pose, { x: 0, z: -1, layer: 1 })).toEqual({
    ...floor,
    y: -59,
  });
  expect(drawerPressCell(pose, floor)).toEqual(counter);
});
it("closes empty open drawers and returns populated contents for each recorded floor ray", () => {
  fc.assert(
    fc.property(fc.constantFrom(...points), fc.boolean(), (point, full) => {
      expect(
        drawerBlockHit(pose, floor, eye, point, full ? contents : [], opened),
      ).toMatchObject({ door: "drawer_bottom", takeContents: full });
      const d = drive(full);
      const press = d.pressStorage(floor, point, 104760, undefined, eye);
      expect(press).toMatchObject(
        full ? { kind: "item", item: "mug_pair" } : { kind: "door" },
      );
      expect(
        d.pressStorage(floor, point, 104764, undefined, eye),
      ).toBeUndefined();
      expect(d.decor()).toEqual([]);
      if (!full)
        expect(
          d.drawerTarget(eye, { x: -0.43, y: -0.903, z: 0.014 })?.open,
        ).not.toBe(true);
    }),
  );
});
it("places in the hit bottom slot and cannot fall back from a missed floor ray", () => {
  fc.assert(
    fc.property(fc.constantFrom(...points), (point) => {
      expect(drive().decorSlotFor(mug, point, floor, false, eye)).toBe(
        "drawer_bottom_0",
      );
      expect(
        drawerBlockHit(pose, floor, eye, point, [], new Set()),
      ).toBeUndefined();
      expect(
        drive(false, false).decorSlotFor(mug, point, floor, false, eye),
      ).toBeUndefined();
    }),
  );
});
it("uses the recorded itemUse view ray and confines the touch fallback to a sole free drawer in the aisle", () => {
  const direction = { x: -0.43, y: -0.903, z: 0.014 };
  expect(drawerHit(pose, eye, direction, [], opened)).toMatchObject({
    door: "drawer_bottom",
    takeContents: false,
  });
  expect(drive().drawerTarget(eye, direction, undefined, mug)).toMatchObject({
    slot: "drawer_bottom_0",
    open: true,
  });
  const away = { x: 1, y: 0, z: 0 };
  const feet = { x: eye.x, y: -59, z: eye.z };
  expect(drive().drawerTarget(eye, away, undefined, mug, feet)?.slot).toBe(
    "drawer_bottom_0",
  );
  expect(
    drive(true).drawerTarget(eye, away, undefined, mug, feet),
  ).toBeUndefined();
  expect(
    drive().drawerTarget(eye, away, undefined, mug, { ...feet, z: feet.z + 1 }),
  ).toBeUndefined();
  const both = drive();
  both.pressStorage(counter, { ...counter, y: counter.y + 0.6 }, 500);
  expect(both.drawerTarget(eye, away, undefined, mug, feet)).toBeUndefined();
});
it("ignores other floor cells and rays missing every target", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 30 }), (offset) => {
      const other = { ...floor, z: floor.z + offset };
      expect(drawerPressCell(pose, other)).toBeUndefined();
      expect(
        drawerBlockHit(
          pose,
          other,
          eye,
          { x: 180.146, y: -59, z: 89.125 },
          [],
          opened,
        ),
      ).toBeUndefined();
      expect(
        drive().pressStorage(other, points[0], 500, undefined, eye),
      ).toBeUndefined();
    }),
  );
  expect(
    drawerBlockHit(pose, floor, eye, { x: 181, y: -59, z: 89.8 }, [], opened),
  ).toBeUndefined();
});
it("hits aisle fronts across all yaws and preserves the upper front above an open lower drawer", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, -90),
      fc.double({ min: 20, max: 28, noNaN: true }),
      fc.double({ min: 0, max: 8, noNaN: true }),
      fc.constantFrom("drawer_bottom", "drawer_top"),
      (yaw, left, rise, door) => {
        const p = { ...pose, yaw };
        const cell = localCellAt(p, DRAWER_COMPARTMENT);
        const { f, l } = axes(yaw);
        const world = (x: number, y: number): Vec3 => ({
          x: cell.x + 0.5 + (x * l.x - 0.45 * f.x) / 16,
          y: cell.y + y / 16,
          z: cell.z + 0.5 + (x * l.z - 0.45 * f.z) / 16,
        });
        const height = HIT.frontBottom[door] + HIT.frontHeight / 2;
        const origin = world(left, height + rise);
        const point = world(HIT.frontLeftMax, height);
        const ray = {
          x: point.x - origin.x,
          y: point.y - origin.y,
          z: point.z - origin.z,
        };
        const hit = drawerHit(p, origin, ray, [], new Set());
        expect(hit?.door).toBe(door);
        expect(hit?.takeContents).toBe(false);
        const topEye = world(20.5, 24.3);
        const topPoint = world(8, 10);
        expect(
          drawerBlockHit(p, cell, topEye, topPoint, [], opened)?.door,
        ).toBe("drawer_top");
        expect(
          drawerBlockHit(
            p,
            cell,
            world(-28, height),
            world(0, height),
            [],
            new Set(),
          ),
        ).toBeUndefined();
      },
    ),
  );
});
it("ties the aisle front bounds to the shipped geometry and slide", () => {
  const model = JSON.parse(
    readFileSync(
      "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
      "utf8",
    ),
  );
  for (const door of ["drawer_top", "drawer_bottom"]) {
    const bone = model["minecraft:geometry"][0].bones.find(
      (b: { name: string }) => b.name === door,
    );
    const front = bone.cubes[0];
    expect(front.origin[0] + 16).toBeCloseTo(HIT.frontLeftMin);
    expect(front.origin[0] + front.size[0] + 16).toBeCloseTo(HIT.frontLeftMax);
    expect(HIT.frontLeftMin + DRAWER_SLIDE_PX).toBeCloseTo(13.6);
    expect(HIT.frontLeftMax + DRAWER_SLIDE_PX).toBeCloseTo(13.95);
  }
});
