import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { parseDecor } from "../../../../../src/domain/vehicle/dock/decor";
import type { HoldPose } from "../../../../../src/domain/vehicle/dock/floor";
import { drawerBlockHit as drawerHit } from "../../../../../src/domain/vehicle/kinds/camper/drawerHit";
import {
  DRAWER_COMPARTMENT,
  drawerAtHeight,
  KITCHEN_DRAWERS,
  type StorageDoorId,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  axes,
  localCellAt,
} from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import {
  DRAWER_GEAR_IDS,
  DRAWER_HIT_PROFILE,
} from "../../../../../src/domain/vehicle/kinds/camper/spec";

const poses = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }).map((n) => n + 0.5),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }).map((n) => n + 0.5),
  yaw: fc.constantFrom(0, 90, 180, -90),
});
const world = (
  pose: HoldPose,
  left: number,
  height: number,
  ahead = -0.45,
): Vec3 => {
  const cell = localCellAt(pose, DRAWER_COMPARTMENT);
  const { f, l } = axes(pose.yaw);
  return {
    x: cell.x + 0.5 + (left * l.x + ahead * f.x) / 16,
    y: cell.y + height / 16,
    z: cell.z + 0.5 + (left * l.z + ahead * f.z) / 16,
  };
};
const contents = parseDecor(
  JSON.stringify([
    { slot: "drawer_top_0", item: "mug_pair" },
    { slot: "drawer_bottom_0", item: "road_map" },
  ]),
);

describe("drawer press ray targets", () => {
  it("ties the content hit dimensions and allowlist to the gear catalogue", () => {
    const catalogue = JSON.parse(
      readFileSync("tools/camping_gear.json", "utf8"),
    ) as {
      id: string;
      width_px: number;
      height_px: number;
    }[];
    expect(Object.keys(DRAWER_HIT_PROFILE.gear)).toEqual([...DRAWER_GEAR_IDS]);
    for (const [id, size] of Object.entries(DRAWER_HIT_PROFILE.gear)) {
      const row = catalogue.find((item) => item.id === id);
      expect(size).toEqual({ width: row?.width_px, height: row?.height_px });
    }
  });

  it("selects an open drawer's contents independently of pose and yaw", () => {
    fc.assert(
      fc.property(
        poses,
        fc.constantFrom("drawer_top", "drawer_bottom"),
        (pose, id) => {
          const door = KITCHEN_DRAWERS.doors.find((door) => door.id === id);
          const height = door?.slots[0]?.height;
          expect(height).toBeDefined();
          const cell = localCellAt(pose, DRAWER_COMPARTMENT);
          const hit = drawerHit(
            pose,
            cell,
            world(pose, 8.6, 20),
            world(pose, 8.6, 0),
            contents,
            new Set<StorageDoorId>([id]),
          );
          expect(hit?.takeContents).toBe(true);
          expect(hit?.point.y).toBeCloseTo(cell.y + (height ?? 0) / 16);
          expect(drawerAtHeight((hit?.point.y ?? 0) - cell.y)).toBe(id);
        },
      ),
    );
  });

  it("hits the closed or extended front before contents when aiming across the aisle", () => {
    fc.assert(
      fc.property(
        poses,
        fc.constantFrom("drawer_top", "drawer_bottom"),
        fc.boolean(),
        (pose, id, opened) => {
          const height = id === "drawer_top" ? 8 : 3;
          const cell = localCellAt(pose, DRAWER_COMPARTMENT);
          const hit = drawerHit(
            pose,
            cell,
            world(pose, 28, height),
            world(pose, 0, height),
            contents,
            new Set<StorageDoorId>(opened ? [id] : []),
          );
          expect(hit?.takeContents).toBe(false);
          expect(drawerAtHeight((hit?.point.y ?? 0) - cell.y)).toBe(id);
        },
      ),
    );
  });

  it("retains counter targeting above the drawers", () => {
    fc.assert(
      fc.property(
        poses,
        fc.double({ min: -7, max: 7, noNaN: true }),
        (pose, left) => {
          const cell = localCellAt(pose, DRAWER_COMPARTMENT);
          const hit = drawerHit(
            pose,
            cell,
            world(pose, left, 25),
            world(pose, left, 0),
            contents,
            new Set<StorageDoorId>(["drawer_top", "drawer_bottom"]),
          );
          expect(hit?.takeContents).toBe(false);
          expect(hit?.point.y).toBeCloseTo(cell.y + 14 / 16);
          expect(drawerAtHeight((hit?.point.y ?? 0) - cell.y)).toBeUndefined();
        },
      ),
    );
  });

  it("gives an empty open drawer a body target", () => {
    fc.assert(
      fc.property(poses, (pose) => {
        const cell = localCellAt(pose, DRAWER_COMPARTMENT);
        const hit = drawerHit(
          pose,
          cell,
          world(pose, 8.6, 20),
          world(pose, 8.6, 0),
          [],
          new Set<StorageDoorId>(["drawer_bottom"]),
        );
        expect(hit?.door).toBe("drawer_bottom");
        expect(hit?.takeContents).toBe(false);
        expect(
          drawerHit(
            pose,
            cell,
            world(pose, 8.6, 20),
            world(pose, 8.6, 0),
            contents,
            new Set(),
          ),
        ).toBeUndefined();
      }),
    );
  });

  it("rejects rays behind the eye, outside every target, zero rays and other cells", () => {
    fc.assert(
      fc.property(poses, (pose) => {
        const cell = localCellAt(pose, DRAWER_COMPARTMENT);
        const eye = world(pose, 28, 3);
        const away = world(pose, 30, 3);
        const open = new Set<StorageDoorId>();
        expect(
          drawerHit(pose, cell, eye, away, contents, open),
        ).toBeUndefined();
        expect(drawerHit(pose, cell, eye, eye, contents, open)).toBeUndefined();
        expect(
          drawerHit(
            pose,
            cell,
            world(pose, 28, 30),
            world(pose, 28, 0),
            contents,
            open,
          ),
        ).toBeUndefined();
        expect(
          drawerHit(
            pose,
            { ...cell, x: cell.x + 5 },
            eye,
            world(pose, 0, 3),
            contents,
            open,
          ),
        ).toBeUndefined();
        for (const value of [NaN, Infinity, -Infinity]) {
          expect(
            drawerHit(
              pose,
              cell,
              { ...eye, y: value },
              world(pose, 0, 3),
              contents,
              open,
            ),
          ).toBeUndefined();
        }
      }),
    );
  });
});
