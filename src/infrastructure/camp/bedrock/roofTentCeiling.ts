import { BlockPermutation } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { RoofTentId } from "../../../domain/camp/ids";
import { roofTentCeilingCells } from "../../../domain/camp/roofTent/ceiling";
import { type Cell, cellKey } from "../../../domain/shared/cells";
import { asDimensionId, type DimensionId } from "../../../domain/shared/ids";
import { NAMESPACE } from "../../shared/identifiers";
import {
  ROOF_TENT_CEILING_PROPERTY,
  ROOF_TENT_LADDER_PROPERTY,
  TENT_CEILING_BLOCK,
} from "../identifiers";
import { roofTentEntity } from "./bedrockRoofTentWorld";
import type { RoofTentOccupants, RoofTentSnapshot } from "./roofTentOccupants";
export class RoofTentCeiling {
  constructor(
    private readonly occupants: RoofTentOccupants,
    private readonly isVehicleSpace: SpaceCheck,
  ) {}

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
    let warned = false;
    const warn = (error: unknown) => {
      if (!warned)
        console.warn(`[${NAMESPACE}] roof tent ceiling lay failed: ${error}`);
      warned = true;
    };
    try {
      const entity = roofTentEntity(id);
      if (!entity) return;
      const variant =
        entity.getProperty(ROOF_TENT_LADDER_PROPERTY) === true
          ? "ladder"
          : "ground";
      const recorded = new Map(
        tent.ceiling.map((cell) => [cellKey(cell), cell]),
      );
      for (const cell of roofTentCeilingCells(
        entity.location,
        entity.getRotation().y,
        variant,
      )) {
        try {
          if (this.isVehicleSpace(asDimensionId(tent.dimension.id), cell))
            continue;
          const block = tent.dimension.getBlock(cell);
          if (!block) continue;
          if (
            block.typeId === TENT_CEILING_BLOCK &&
            recorded.has(cellKey(cell))
          )
            continue;
          if (!block.isAir) continue;
          block.setPermutation(BlockPermutation.resolve(TENT_CEILING_BLOCK));
          recorded.set(cellKey(cell), cell);
          // Keep the fallback record even if saving the entity property fails.
          tent.ceiling = [...recorded.values()];
        } catch (error) {
          warn(error);
        }
      }
      entity.setDynamicProperty(
        ROOF_TENT_CEILING_PROPERTY,
        tent.ceiling.length > 0 ? JSON.stringify(tent.ceiling) : undefined,
      );
    } catch (error) {
      warn(error);
    }
  }

  clearCeiling(id: RoofTentId): void {
    const tent = this.occupants.snapshots.get(id);
    if (!tent || tent.ceiling.length === 0) return;
    let warned = false;
    const warn = (error: unknown) => {
      if (!warned)
        console.warn(`[${NAMESPACE}] roof tent ceiling clear failed: ${error}`);
      warned = true;
    };
    for (const cell of tent.ceiling) {
      try {
        const block = tent.dimension.getBlock(cell);
        if (block?.typeId === TENT_CEILING_BLOCK)
          block.setPermutation(BlockPermutation.resolve("minecraft:air"));
      } catch (error) {
        warn(error);
      }
    }
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
export function readCeiling(saved: unknown): Cell[] {
  if (typeof saved !== "string") return [];
  try {
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (cell): cell is Cell =>
        cell !== null &&
        typeof cell === "object" &&
        [cell.x, cell.y, cell.z].every(Number.isSafeInteger),
    );
  } catch {
    return [];
  }
}
