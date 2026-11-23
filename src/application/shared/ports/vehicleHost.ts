// The host lookup one feature hands another through bootstrap (ADR 0046, 0129).
import type {
  HostPresence,
  PresentVehicleHost,
} from "../../../domain/shared/hostPresence";

export type VehicleHostState =
  | PresentVehicleHost
  | { readonly status: Exclude<HostPresence, "present"> };

/** A pure read: it changes no block or entity. Unknown includes unloaded hosts; removed requires positive evidence. */
export type VehicleHostLookup = (vehicleId: string) => VehicleHostState;
