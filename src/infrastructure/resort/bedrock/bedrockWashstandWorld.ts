import { type Entity, world } from "@minecraft/server";
import type { WashstandWorld } from "../../../application/resort/ports/washstandWorld";
import { asFurnitureId, type FurnitureId } from "../../../domain/resort/ids";
import { allDimensions } from "../../shared/dimensions";
import { entityOfType } from "../../shared/entities";
import { FURNITURE_IDS, WASHSTAND_RUNNING } from "../identifiers";

export class BedrockWashstandWorld implements WashstandWorld {
  entity(id: FurnitureId): Entity | undefined {
    try {
      return entityOfType(world, id, FURNITURE_IDS.washstand.entity);
    } catch {
      return undefined;
    }
  }

  setRunning(id: FurnitureId, on: boolean): void {
    this.entity(id)?.setProperty(WASHSTAND_RUNNING, on);
  }

  loadedWashstands(): readonly FurnitureId[] {
    return allDimensions().flatMap((dimension) =>
      dimension
        .getEntities({ type: FURNITURE_IDS.washstand.entity })
        .map((entity) => asFurnitureId(entity.id)),
    );
  }
}
