import type { PresentVehicleHost } from "../shared/hostPresence";
import type { DimensionId } from "../shared/ids";
import { length, type Vec3 } from "../shared/vec";
import type { VehicleProfile } from "./profile";
import { DRIVER_SEAT } from "./seats";
import { SPEC } from "./spec";

interface HostSnapshot {
  readonly riders: readonly { readonly slot: number }[];
  readonly velocity: Vec3;
  readonly location: Vec3;
  readonly yaw: number;
}

export function hostStateFrom(
  { riders, velocity, location, yaw }: HostSnapshot,
  profile: VehicleProfile,
  dimensionId: DimensionId,
): PresentVehicleHost {
  return {
    status: "present",
    dimensionId,
    location,
    yaw,
    mount: profile.roofTent,
    driverPresent: riders.some((rider) => rider.slot === DRIVER_SEAT),
    moving: length(velocity) > SPEC.hostMovingSpeed,
  };
}
