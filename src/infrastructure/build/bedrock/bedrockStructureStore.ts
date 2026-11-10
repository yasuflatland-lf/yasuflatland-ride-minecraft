import {
  type Dimension,
  type Entity,
  StructureSaveMode,
  world,
} from "@minecraft/server";
import type {
  BuildStructureStore,
  CaptureRefusal,
} from "../../../application/build/ports/structures";
import type { CellBox } from "../../../domain/build/box";
import {
  type StructureHandle,
  structureHandle,
} from "../../../domain/build/structure/handle";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import {
  fillChunks,
  isStructureTooLarge,
  structureIdentifier,
} from "./structureGeometry";

function entitiesInside(dimension: Dimension, box: CellBox): Entity[] {
  return dimension.getEntities().filter((entity) => {
    try {
      const p = entity.location;
      return (
        p.x >= box.min.x &&
        p.x < box.max.x + 1 &&
        p.y >= box.min.y &&
        p.y < box.max.y + 1 &&
        p.z >= box.min.z &&
        p.z < box.max.z + 1
      );
    } catch {
      // Entities can become invalid between the query and reading their location.
      return false;
    }
  });
}

export class BedrockStructureStore implements BuildStructureStore {
  private counter = 0;

  constructor(private readonly isExcluded: (typeId: string) => boolean) {}

  capture(
    dimensionId: DimensionId,
    box: CellBox,
    ownerId: PlayerId,
  ): StructureHandle | CaptureRefusal {
    if (isStructureTooLarge(box)) return "tooLarge";
    try {
      const dimension = world.getDimension(dimensionId);
      const height = dimension.heightRange;
      if (box.min.y < height.min || box.max.y >= height.max)
        return "unreadable";
      let name: string;
      do {
        name = structureIdentifier(ownerId, ++this.counter);
      } while (world.structureManager.get(name) !== undefined);
      world.structureManager.createFromWorld(
        name,
        dimension,
        box.min,
        box.max,
        {
          saveMode: StructureSaveMode.Memory,
          includeBlocks: true,
          includeEntities: true,
        },
      );
      return structureHandle(name);
    } catch {
      return "unreadable";
    }
  }

  place(
    handle: StructureHandle,
    dimensionId: DimensionId,
    anchor: Cell,
  ): boolean {
    try {
      const structure = world.structureManager.get(handle);
      if (!structure) return false;
      const dimension = world.getDimension(dimensionId);
      const size = structure.size;
      const box = {
        min: anchor,
        max: {
          x: anchor.x + size.x - 1,
          y: anchor.y + size.y - 1,
          z: anchor.z + size.z - 1,
        },
      };
      const before = new Set(
        entitiesInside(dimension, box).map((entity) => entity.id),
      );
      world.structureManager.place(structure, dimension, anchor, {
        includeBlocks: true,
        includeEntities: true,
      });
      // Removed in the same call as place, before any spawn event reaches the
      // fleet, so pasted vehicles never count against its limits (ADR 0243).
      for (const entity of entitiesInside(dimension, box)) {
        try {
          if (
            entity.typeId !== "minecraft:player" &&
            !before.has(entity.id) &&
            this.isExcluded(entity.typeId)
          )
            entity.remove();
        } catch {
          // The structure is already placed; one stale entity must not report failure.
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  clearEntities(dimensionId: DimensionId, box: CellBox): void {
    try {
      for (const entity of entitiesInside(
        world.getDimension(dimensionId),
        box,
      )) {
        try {
          if (
            entity.typeId !== "minecraft:player" &&
            !this.isExcluded(entity.typeId)
          )
            entity.remove();
        } catch {
          // A stale entity must not prevent cleanup of the remaining entities.
        }
      }
    } catch {
      // Dimension lookup and entity queries can fail during world teardown.
    }
  }

  clearBlocks(dimensionId: DimensionId, box: CellBox): boolean {
    try {
      const dimension = world.getDimension(dimensionId);
      for (const { min, max } of fillChunks(box)) {
        dimension.runCommand(
          `fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} air`,
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  discard(handle: StructureHandle): void {
    try {
      world.structureManager.delete(handle);
    } catch {
      // Missing or already invalidated handles require no further cleanup.
    }
  }
}
