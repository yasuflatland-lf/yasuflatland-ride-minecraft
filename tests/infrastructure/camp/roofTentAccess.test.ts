import type { Entity, Player } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import type {
  VehicleHostLookup,
  VehicleHostState,
} from "../../../src/application/shared/ports/vehicleHost";
import { entranceWorld } from "../../../src/domain/camp/roofTent/access";
import { asDimensionId } from "../../../src/domain/shared/ids";
import type { RoofTentMount } from "../../../src/domain/shared/roofTent";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { createEntranceReach } from "../../../src/infrastructure/camp/bedrock/roofTentAccess";
import { ROOF_TENT_HOST_PROPERTY } from "../../../src/infrastructure/camp/identifiers";

vi.mock("@minecraft/server", () => ({
  world: { getDimension: vi.fn(), getEntity: vi.fn() },
}));

const mount = SUV_PROFILE.roofTent as RoofTentMount;
const hostPose = { location: { x: 10, y: 64, z: -5 }, yaw: 30 };
const present = (
  overrides: Partial<Extract<VehicleHostState, { status: "present" }>> = {},
): VehicleHostState => ({
  status: "present",
  dimensionId: asDimensionId("minecraft:overworld"),
  ...hostPose,
  mount,
  driverPresent: false,
  moving: false,
  ...overrides,
});
const tentWith = (marker: unknown): Entity =>
  ({
    getDynamicProperty: (key: string) =>
      key === ROOF_TENT_HOST_PROPERTY ? marker : undefined,
  }) as unknown as Entity;
const atEntrance = (): Player => {
  const e = entranceWorld(mount, hostPose);
  return {
    location: { x: e.x, y: hostPose.location.y + mount.roofHeight, z: e.z },
  } as unknown as Player;
};
const farAway = (): Player =>
  ({ location: { x: 500, y: 64, z: 500 } }) as unknown as Player;

it("reaches the entrance of the hosting vehicle by its marker id", () => {
  const lookup = vi.fn<VehicleHostLookup>(() => present());
  const reach = createEntranceReach(lookup);
  expect(reach(tentWith("vehicle:car-1"), atEntrance())).toBe(true);
  expect(lookup).toHaveBeenCalledExactlyOnceWith("car-1");
  expect(reach(tentWith("vehicle:car-1"), farAway())).toBe(false);
});

it("refuses without consulting the lookup when the marker is missing or not a vehicle host", () => {
  const lookup = vi.fn<VehicleHostLookup>(() => present());
  const reach = createEntranceReach(lookup);
  for (const marker of [undefined, 5, "", "fire_pit:pit:0"]) {
    expect(reach(tentWith(marker), atEntrance())).toBe(false);
  }
  expect(lookup).not.toHaveBeenCalled();
});

it.each([
  ["unknown", { status: "unknown" } as VehicleHostState],
  ["removed", { status: "removed" } as VehicleHostState],
  ["a host without a tent mount", present({ mount: undefined })],
])("refuses when the host is %s", (_, state) => {
  const reach = createEntranceReach(() => state);
  expect(reach(tentWith("vehicle:car-1"), atEntrance())).toBe(false);
});
