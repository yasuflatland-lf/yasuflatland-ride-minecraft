import type { DimensionId } from "./ids";
import type { RoofTentMount } from "./roofTent";
import type { Vec3 } from "./vec";

export type HostPresence = "present" | "unknown" | "removed";

export type PresentVehicleHost = Readonly<{
  status: "present";
  dimensionId: DimensionId;
  location: Vec3;
  yaw: number;
  mount: RoofTentMount | undefined;
  driverPresent: boolean;
  moving: boolean;
}>;
