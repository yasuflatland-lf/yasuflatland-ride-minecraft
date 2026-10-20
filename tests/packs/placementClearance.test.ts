import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VEHICLE_KINDS, type VehicleKind } from "../../src/domain/vehicle/kind";
import { profileOf } from "../../src/domain/vehicle/kinds/index";

interface CollisionBox {
  readonly width: number;
  readonly height: number;
}

type Components = Record<string, unknown>;

// Every collision box an entity can have: the base components and each
// component group, since a group (such as the camper's docked group) can
// replace the base box.
function collisionBoxes(kind: VehicleKind): CollisionBox[] {
  const entity = JSON.parse(
    readFileSync(
      `packs/yasu_ride_bp/entities/yasu_ride/${kind}.se.json`,
      "utf8",
    ),
  )["minecraft:entity"] as {
    components?: Components;
    component_groups?: Record<string, Components>;
  };
  return [
    entity.components ?? {},
    ...Object.values(entity.component_groups ?? {}),
  ]
    .map((components) => components["minecraft:collision_box"])
    .filter(
      (box): box is CollisionBox => typeof box === "object" && box !== null,
    );
}

it.each(VEHICLE_KINDS)(
  "fits every %s collision box inside its placement clearance",
  (kind) => {
    const { halfX, halfZ, height } = profileOf(kind).placement.clearance;
    const boxes = collisionBoxes(kind);
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      // The vehicle spawns at a cell center, so cells -half..half span
      // half + 0.5 blocks each way. Collision boxes stay axis-aligned at
      // any yaw.
      expect(box.width / 2).toBeLessThanOrEqual(halfX + 0.5);
      expect(box.width / 2).toBeLessThanOrEqual(halfZ + 0.5);
      expect(box.height).toBeLessThanOrEqual(height);
    }
  },
);
