import type { DimensionId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
// Use case: a player tapped a floor block of a held vehicle's room; the vehicle decides what it means (ADR 0094).
import type { FloorTap } from "../../domain/vehicle/drive";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { DockFloorWorld } from "./ports/dockFloor";
import type { RunShower } from "./runShower";
import type { UseShowerDoor } from "./useShowerDoor";

export interface TapDockFloorCommand {
  dimensionId: DimensionId;
  cell: Vec3;
  /** Where the tapping player stands. */
  player: Vec3;
}

export class TapDockFloor {
  constructor(
    private readonly world: DockFloorWorld,
    private readonly repo: VehicleRepository,
    private readonly showerDoor: UseShowerDoor,
    private readonly shower: RunShower,
  ) {}

  /** Returns whether the tap did anything. */
  execute(cmd: TapDockFloorCommand): boolean {
    const vehicleId = this.world.floorOwner(cmd.dimensionId, cmd.cell);
    if (!vehicleId) return false;
    const tap = this.repo.get(vehicleId)?.floorTap(cmd.cell, cmd.player);
    if (tap === undefined) return false;
    const useCases: Record<FloorTap, UseShowerDoor | RunShower> = {
      showerDoor: this.showerDoor,
      shower: this.shower,
    };
    return useCases[tap].execute({ vehicleId });
  }
}
