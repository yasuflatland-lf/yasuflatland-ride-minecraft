import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../../../src/domain/shared/vec";
import { parseDecor } from "../../../../../src/domain/vehicle/dock/decor";
import type { HoldPose } from "../../../../../src/domain/vehicle/dock/floor";
import {
  drawerBlockHit as drawerHit,
  drawerHit as rayHit,
} from "../../../../../src/domain/vehicle/kinds/camper/drawerHit";
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

const recordedPose: HoldPose = { x: -0.5, y: -60, z: 5.5, yaw: 0 };
const recordedEye = { x: -0.15, y: -58.48, z: 4.5 };
const floorCell = { x: -1, y: -60, z: 4 };
function floorHit(
  pose: HoldPose,
  eye: Vec3,
  point: Vec3,
  open: StorageDoorId[],
) {
  return rayHit(
    pose,
    eye,
    { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z },
    [],
    new Set(open),
    floorCell,
  );
}
it.each([
  [["drawer_bottom"], "drawer_bottom"],
  [["drawer_top", "drawer_bottom"], "drawer_bottom"],
  [["drawer_top"], "drawer_top"],
] as [StorageDoorId[], StorageDoorId][])(
  "routes the recorded floor hit with %s open",
  (open, door) => {
    expect(localCellAt(recordedPose, DRAWER_COMPARTMENT)).toEqual({
      x: -2,
      y: -59,
      z: 4,
    });
    expect(
      floorHit(recordedPose, recordedEye, { x: -0.686, y: -60, z: 4.491 }, open)
        ?.door,
    ).toBe(door);
  },
);
it("ignores recorded floor taps beyond the extended footprint and closed drawers", () => {
  // These taps are 22.3 and 21.0 px out from the cell center, beyond the footprint.
  for (const [x, z] of [
    [0.893, 0.433],
    [0.811, 0.437],
  ] as const) {
    expect(
      floorHit(recordedPose, recordedEye, { x: -1 + x, y: -60, z: 4 + z }, [
        "drawer_bottom",
      ]),
    ).toBeUndefined();
  }
  expect(
    floorHit(recordedPose, recordedEye, { x: -0.686, y: -60, z: 4.491 }, []),
  ).toBeUndefined();
});
it("closes the lowest open drawer throughout the floor footprint at every yaw", () => {
  fc.assert(
    fc.property(
      poses,
      fc.double({ min: 6.51, max: 15.44, noNaN: true }),
      fc.double({ min: -8.79, max: 7.89, noNaN: true }),
      (pose, left, ahead) => {
        const point = world(pose, left, -16, ahead);
        const eye = world(pose, left, -1, ahead);
        const counter = localCellAt(pose, DRAWER_COMPARTMENT);
        const cell = localCellAt(pose, {
          x: 0,
          z: DRAWER_COMPARTMENT.z,
          layer: 0,
        });
        for (const [open, door] of [
          [["drawer_bottom"], "drawer_bottom"],
          [["drawer_top"], "drawer_top"],
          [["drawer_top", "drawer_bottom"], "drawer_bottom"],
        ] as [StorageDoorId[], StorageDoorId][]) {
          const hit = rayHit(
            pose,
            eye,
            { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z },
            [],
            new Set(open),
            cell,
          );
          expect(hit?.door).toBe(door);
          expect(
            rayHit(
              pose,
              eye,
              { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z },
              [],
              new Set(open),
              counter,
            ),
          ).toBeUndefined();
        }
        for (const far of [world(pose, 30, -16), world(pose, 10, -16, 20)]) {
          expect(
            rayHit(
              pose,
              far,
              { x: 0, y: -1, z: 0 },
              [],
              new Set(["drawer_bottom"]),
              cell,
            ),
          ).toBeUndefined();
        }
      },
    ),
  );
});
it("extends only open fronts to the floor and preserves a positive top-front hit", () => {
  const cell = localCellAt(recordedPose, DRAWER_COMPARTMENT);
  for (const open of [[], ["drawer_bottom"]] as StorageDoorId[][]) {
    expect(
      drawerHit(
        recordedPose,
        cell,
        world(recordedPose, 28, 0.5),
        world(recordedPose, 0, 0.5),
        [],
        new Set(open),
      )?.door,
    ).toBe(open.length ? "drawer_bottom" : undefined);
  }
  expect(
    floorHit(
      recordedPose,
      world(recordedPose, 28, 65),
      world(recordedPose, 8, -16),
      ["drawer_top", "drawer_bottom"],
    )?.door,
  ).toBe("drawer_top");
});
