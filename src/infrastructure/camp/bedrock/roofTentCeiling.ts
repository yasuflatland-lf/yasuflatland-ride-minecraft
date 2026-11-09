import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { RoofTentId } from "../../../domain/camp/ids";
import { roofTentCeilingCells } from "../../../domain/camp/roofTent/ceiling";
import { type Cell, cellKey } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";
import { RainCeilingLayer, writeCeilingCells } from "../../shared/rainCeiling";
import {
  ROOF_TENT_CEILING_PROPERTY,
  ROOF_TENT_LADDER_PROPERTY,
  TENT_CEILING_BLOCK,
} from "../identifiers";
import { roofTentEntity } from "./bedrockRoofTentWorld";
import type { RoofTentOccupants, RoofTentSnapshot } from "./roofTentOccupants";
export class RoofTentCeiling {
  private readonly layer: RainCeilingLayer;

  constructor(
    private readonly occupants: RoofTentOccupants,
    isVehicleSpace: SpaceCheck,
  ) {
    this.layer = new RainCeilingLayer(
      TENT_CEILING_BLOCK,
      isVehicleSpace,
      "roof tent ceiling",
    );
  }

  syncCeiling(id: RoofTentId): void {
    const tent = this.occupants.snapshot(id);
    if (!tent) return;
    if (tent.occupant === undefined) {
      if (tent.ceiling.length > 0) this.clearCeiling(id);
      return;
    }
    this.layCeiling(id, tent);
  }

  private layCeiling(id: RoofTentId, tent: RoofTentSnapshot): void {
    const warn = this.layer.warning("lay");
    try {
      const entity = roofTentEntity(id);
      if (!entity) return;
      const variant =
        entity.getProperty(ROOF_TENT_LADDER_PROPERTY) === true
          ? "ladder"
          : "ground";
      // Keep the fallback record even if saving the entity property fails.
      tent.ceiling = this.layer.lay(
        tent.dimension,
        roofTentCeilingCells(entity.location, entity.getRotation().y, variant),
        tent.ceiling,
        warn,
      );
      entity.setDynamicProperty(
        ROOF_TENT_CEILING_PROPERTY,
        writeCeilingCells(tent.ceiling),
      );
    } catch (error) {
      warn(error);
    }
  }

  clearCeiling(id: RoofTentId): void {
    const tent = this.occupants.snapshots.get(id);
    if (!tent || tent.ceiling.length === 0) return;
    const warn = this.layer.warning("clear");
    this.layer.clear(tent.dimension, tent.ceiling, warn);
    tent.ceiling = [];
    try {
      roofTentEntity(id)?.setDynamicProperty(
        ROOF_TENT_CEILING_PROPERTY,
        undefined,
      );
    } catch (error) {
      warn(error);
    }
  }

  ceilingOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): string | undefined {
    if (typeId !== TENT_CEILING_BLOCK) return undefined;
    for (const [id, tent] of this.occupants.snapshots) {
      if (
        tent.dimension.id === dimensionId &&
        tent.ceiling.some((at) => cellKey(at) === cellKey(cell))
      )
        return id;
    }
    return undefined;
  }
}
