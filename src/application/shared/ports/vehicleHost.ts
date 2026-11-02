// The host lookup one feature hands another through bootstrap (ADR 0046, 0129).
import type { HostPresence } from "../../../domain/shared/hostPresence";
import type { DimensionId } from "../../../domain/shared/ids";
import type { RoofTentMount } from "../../../domain/shared/roofTent";
import type { Vec3 } from "../../../domain/shared/vec";

export type VehicleHostState =
  | Readonly<{
      status: "present";
      dimensionId: DimensionId;
      location: Vec3;
      yaw: number;
      mount: RoofTentMount | undefined;
      driverPresent: boolean;
      moving: boolean;
    }>
  | { readonly status: Exclude<HostPresence, "present"> };

/** A pure read: it changes no block or entity. Unknown includes unloaded hosts; removed requires positive evidence. */
export type VehicleHostLookup = (vehicleId: string) => VehicleHostState;
