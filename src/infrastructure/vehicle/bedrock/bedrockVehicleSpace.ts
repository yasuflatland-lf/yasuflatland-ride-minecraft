// Queries dock ownership and vehicle placement space (ADR 0012).
import { type Entity, world } from "@minecraft/server";
import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { VEHICLE_KINDS } from "../../../domain/vehicle/kind";
import { profileOf } from "../../../domain/vehicle/kinds/index";
import type { DockLayer } from "./dockLayer";
import { kindOfEntity, VEHICLE_FAMILY } from "./identifiers";

// How far from a cell's middle a vehicle can stand and still reach into the cell: the
// largest footprint plus the cell's half diagonal, and the tallest clearance (ADR 0122).
const SPACE_QUERY_RADIUS = Math.max(
  ...VEHICLE_KINDS.map((kind) => {
    const { footprint, placement } = profileOf(kind);
    return Math.hypot(footprint + 1, placement.clearance.height + 1);
  }),
);

/** How far `cell`'s ground square lies from `point` across the ground. */
function groundGap(cell: Vec3, point: Vec3): number {
  const dx = Math.max(cell.x - point.x, 0, point.x - (cell.x + 1));
  const dz = Math.max(cell.z - point.z, 0, point.z - (cell.z + 1));
  return Math.hypot(dx, dz);
}

export class BedrockVehicleSpace {
  constructor(
    private readonly dockBlocks: DockLayer,
    private readonly cellOwner: (
      dimensionId: DimensionId,
      cell: Vec3,
    ) => VehicleId | undefined,
  ) {}

  /** The vehicle whose laid room door is at this cell, if any (ADR 0068). */
  dockDoorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.dockBlocks.doorOwner(dimensionId, cell);
  }

  /** The vehicle that laid any dock block at this cell, if any (ADR 0093). */
  dockCellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.dockBlocks.cellOwner(dimensionId, cell);
  }

  /** The vehicle whose laid dock block this is, while the world still holds it (ADR 0096). */
  dockBlockOwner(
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ): VehicleId | undefined {
    return this.dockBlocks.laidBlockOwner(dimensionId, cell, typeId);
  }

  /**
   * Whether a vehicle laid a room block in `cell` or in the block under it, or a
   * loaded vehicle's footprint, turned to any heading, reaches into `cell` at a height
   * within its kind's placement clearance (ADR 0122).
   */
  isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean {
    const below = { x: cell.x, y: cell.y - 1, z: cell.z };
    if (
      this.cellOwner(dimensionId, cell) !== undefined ||
      this.cellOwner(dimensionId, below) !== undefined
    )
      return true;
    const middle = { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 };
    let near: Entity[];
    try {
      near = world.getDimension(dimensionId).getEntities({
        families: [VEHICLE_FAMILY],
        location: middle,
        maxDistance: SPACE_QUERY_RADIUS,
      });
    } catch {
      return false; // Unknown dimension id
    }
    return near.some((vehicle) => {
      const kind = kindOfEntity(vehicle.typeId);
      if (kind === undefined) return false;
      const { footprint, placement } = profileOf(kind);
      const dy = cell.y - Math.floor(vehicle.location.y);
      return (
        dy >= 0 &&
        dy <= placement.clearance.height &&
        groundGap(cell, vehicle.location) < footprint
      );
    });
  }
}
