import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { RoofTentId } from "../../../domain/camp/ids";
import { roofTentCeilingCells } from "../../../domain/camp/roofTent/ceiling";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";
import { LaidBlockLayer, writeCeilingCells } from "../../shared/laidBlockLayer";
import {
  ROOF_TENT_CEILING_PROPERTY,
  ROOF_TENT_LADDER_PROPERTY,
  TENT_CEILING_BLOCK,
} from "../identifiers";
import { roofTentEntity } from "./bedrockRoofTentWorld";
import type { RoofTentOccupants } from "./roofTentOccupants";
export class RoofTentCeiling {
  private readonly layer: LaidBlockLayer;

  constructor(
    private readonly occupants: RoofTentOccupants,
    isVehicleSpace: SpaceCheck,
  ) {
    this.layer = new LaidBlockLayer(
      TENT_CEILING_BLOCK,
      isVehicleSpace,
      "roof tent ceiling",
    );
  }

  syncCeiling(id: RoofTentId): void {
    const tent = this.occupants.record(id);
    if (!tent) return;
    if (tent.state.occupant === undefined) {
      if (tent.ceiling.length > 0) this.clearCeiling(id);
      return;
    }

    const warn = this.layer.warning("lay");
    try {
      const entity = roofTentEntity(id);
      if (!entity) return;
      const variant =
        entity.getProperty(ROOF_TENT_LADDER_PROPERTY) === true
          ? "ladder"
          : "ground";
      // Keep the fallback record even if saving the entity property fails.
      const cells = this.layer.lay(
        tent.dimension,
        roofTentCeilingCells(entity.location, entity.getRotation().y, variant),
        tent.ceiling,
        warn,
      );
      this.occupants.setCeiling(id, cells);
      entity.setDynamicProperty(
        ROOF_TENT_CEILING_PROPERTY,
        writeCeilingCells(cells),
      );
    } catch (error) {
      warn(error);
    }
  }

  clearCeiling(id: RoofTentId): void {
    const tent = this.occupants.peek(id);
    if (!tent || tent.ceiling.length === 0) return;
    const warn = this.layer.warning("clear");
    this.layer.clear(tent.dimension, tent.ceiling, warn);
    this.occupants.setCeiling(id, []);
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
    return this.occupants.ceilingOwner(dimensionId, cell);
  }
}
