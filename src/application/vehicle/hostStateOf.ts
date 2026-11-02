import type { DimensionId } from "../../domain/shared/ids";
import type { VehicleProfile } from "../../domain/vehicle/profile";
import { DRIVER_SEAT } from "../../domain/vehicle/seats";
import { SPEC } from "../../domain/vehicle/spec";
import type { VehicleHostState } from "../shared/ports/vehicleHost";
import type { VehicleSnapshot } from "./ports/drive";

export function hostStateOf(
  snapshot: Pick<VehicleSnapshot, "location" | "yaw" | "velocity" | "riders">,
  profile: VehicleProfile,
  dimensionId: DimensionId,
): Extract<VehicleHostState, { status: "present" }> {
  return {
    status: "present",
    dimensionId,
    location: snapshot.location,
    yaw: snapshot.yaw,
    mount: profile.roofTent,
    driverPresent: snapshot.riders.some((rider) => rider.slot === DRIVER_SEAT),
    moving:
      Math.hypot(snapshot.velocity.x, snapshot.velocity.z) >
      SPEC.hostMovingSpeed,
  };
}
