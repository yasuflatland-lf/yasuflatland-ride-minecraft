import type { Entity } from "@minecraft/server";
import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { DockCell } from "../../../domain/vehicle/dock/floor";

export interface DockLayer {
  doorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined;
  cellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined;
  laidBlockOwner(
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ): VehicleId | undefined;
  lay(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    wanted: readonly DockCell[],
  ): void;
  clearGone(live: ReadonlySet<VehicleId>): void;
  saved(vehicle: Entity): { laid: boolean; doorOpen: boolean | undefined };
}
