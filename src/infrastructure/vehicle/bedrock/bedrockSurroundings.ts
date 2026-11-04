// Reads the blocks and targets surrounding a vehicle (ADR 0012).
import type { Entity } from "@minecraft/server";
import type { SurroundingsWorld } from "../../../application/vehicle/ports/drive";
import type { VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { RAM_QUERY_RADIUS } from "../../../domain/vehicle/kinds/index";
import type { RamTarget } from "../../../domain/vehicle/ram";
import { AIR_BLOCK } from "../../shared/identifiers";
import { isLightBlock } from "../../shared/lightBlocks";
import { mountOf } from "../../shared/mount";
import type { EntityIndex } from "./entityIndex";
import { ramMountOf } from "./identifiers";
import { isLavaAt, isWaterAt } from "./water";

function offsetFrom(vehicle: Entity, offset: Vec3): Vec3 {
  return {
    x: vehicle.location.x + offset.x,
    y: vehicle.location.y + offset.y,
    z: vehicle.location.z + offset.z,
  };
}

export class BedrockSurroundings implements SurroundingsWorld {
  constructor(private readonly index: EntityIndex) {}

  waterAt(vehicleId: VehicleId, offset: Vec3): boolean {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return false;
    return isWaterAt(vehicle.dimension, offsetFrom(vehicle, offset));
  }

  lavaAt(vehicleId: VehicleId, offset: Vec3): boolean {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return false;
    return isLavaAt(vehicle.dimension, offsetFrom(vehicle, offset));
  }

  solidAt(vehicleId: VehicleId, offset: Vec3): boolean {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return false;
    try {
      const at = offsetFrom(vehicle, offset);
      const b = vehicle.dimension.getBlock(at);
      if (!b || b.isAir || b.isLiquid || isLightBlock(b)) return false;
      // A ray that starts inside a block finds nothing, so a cell under
      // another block counts as solid without one.
      const above = b.above();
      if (above && !above.isAir && !above.isLiquid) return true;
      // Flowers, grass, carpets and torches have no collision box: a ray cast
      // down from just above the cell passes through them (ADR 0035).
      const hit = vehicle.dimension.getBlockFromRay(
        { x: at.x, y: b.location.y + 1.001, z: at.z },
        { x: 0, y: -1, z: 0 },
        {
          includePassableBlocks: false,
          includeLiquidBlocks: false,
          maxDistance: 1,
        },
      );
      return hit?.block.location.y === b.location.y;
    } catch {
      return false; // Unloaded chunk or outside the world
    }
  }

  blockTypes(
    vehicleId: VehicleId,
    cells: readonly Vec3[],
  ): (string | undefined)[] {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return cells.map(() => undefined);
    return cells.map((c) => {
      try {
        const b = vehicle.dimension.getBlock(c);
        if (!b) return undefined;
        return b.isAir || isLightBlock(b) ? AIR_BLOCK : b.typeId;
      } catch {
        return undefined; // Unloaded chunk or outside the world
      }
    });
  }

  targetsNear(vehicleId: VehicleId): RamTarget[] {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return [];
    return vehicle.dimension
      .getEntities({
        location: vehicle.location,
        maxDistance: RAM_QUERY_RADIUS,
        excludeFamilies: ["inanimate"],
        excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
      })
      .filter((e) => e.id !== vehicle.id)
      .map((e) => ({
        id: e.id,
        offset: {
          x: e.location.x - vehicle.location.x,
          y: e.location.y - vehicle.location.y,
          z: e.location.z - vehicle.location.z,
        },
        mount: ramMountOf(mountOf(e)?.typeId),
      }));
  }
}
