import type { Entity } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { asRoofTentId, type RoofTentId } from "../../../domain/camp/ids";
import { roofTentCeilingCells } from "../../../domain/camp/roofTent/ceiling";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";
import { SingleBlockLayer } from "../../shared/laidBlockLayer";
import { ROOF_TENT_CEILING_PROPERTY, TENT_CEILING_BLOCK } from "../identifiers";
import { roofTentEntity, roofTentShell } from "./bedrockRoofTentWorld";
import type { RoofTentOccupants } from "./roofTentOccupants";
export class RoofTentCeiling {
  private readonly layer: SingleBlockLayer<RoofTentId>;

  constructor(
    private readonly occupants: RoofTentOccupants,
    isVehicleSpace: SpaceCheck,
  ) {
    this.layer = new SingleBlockLayer(
      TENT_CEILING_BLOCK,
      ROOF_TENT_CEILING_PROPERTY,
      isVehicleSpace,
      "roof tent ceiling",
    );
  }

  remember(entity: Entity): void {
    this.layer.remember(asRoofTentId(entity.id), entity);
  }

  forget(id: RoofTentId): void {
    this.layer.forget(id);
  }

  syncCeiling(id: RoofTentId): void {
    const tent = this.occupants.record(id);
    if (!tent) return;
    if (tent.state.occupant === undefined) {
      this.clearCeiling(id);
      return;
    }

    const warn = this.layer.warning("lay");
    try {
      const entity = roofTentEntity(id);
      if (!entity) return;
      this.layer.lay(
        id,
        entity,
        roofTentCeilingCells(
          entity.location,
          entity.getRotation().y,
          roofTentShell(entity),
        ),
        warn,
      );
    } catch (error) {
      warn(error);
    }
  }

  clearCeiling(id: RoofTentId): void {
    this.layer.clear(id, roofTentEntity(id));
  }

  ceilingOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): string | undefined {
    return this.layer.ownerOf(dimensionId, cell, typeId);
  }
}
