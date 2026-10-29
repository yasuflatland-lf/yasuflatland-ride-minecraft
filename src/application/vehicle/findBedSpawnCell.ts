import type { VehicleId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";

export interface FindBedSpawnCellCommand {
  vehicleId: VehicleId;
  cell: Vec3;
}

export class FindBedSpawnCell {
  constructor(private readonly repo: VehicleRepository) {}

  execute(cmd: FindBedSpawnCellCommand): Vec3 | undefined {
    return this.repo.get(cmd.vehicleId)?.bedSpawnCell(cmd.cell);
  }
}
