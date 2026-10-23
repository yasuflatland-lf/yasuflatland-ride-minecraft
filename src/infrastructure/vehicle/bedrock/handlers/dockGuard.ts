import type { DimensionId, VehicleId } from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import { registerLaidBlockGuard } from "../../../shared/laidBlockGuard";

export function registerDockGuard(
  dockBlockOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ) => VehicleId | undefined,
): void {
  registerLaidBlockGuard(dockBlockOwner);
}
