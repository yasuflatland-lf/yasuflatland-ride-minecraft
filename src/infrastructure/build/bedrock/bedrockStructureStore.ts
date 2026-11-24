import {
  BlockPermutation,
  BlockVolume,
  type Dimension,
  type Entity,
  type Structure,
  StructureRotation,
  StructureSaveMode,
  world,
} from "@minecraft/server";
import type {
  BuildStructureStore,
  CaptureMode,
  CaptureRefusal,
} from "../../../application/build/ports/structures";
import { boxFromSize, type CellBox } from "../../../domain/build/box";
import {
  NO_TURN,
  type QuarterTurn,
  rotatedSize,
} from "../../../domain/build/rotation/quarterTurn";
import {
  type StructureHandle,
  structureHandle,
} from "../../../domain/build/structure/handle";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { blockHeightRange } from "./bedrockBlockWorld";
import {
  fillChunks,
  isStructureTooLarge,
  structureIdentifier,
  structureOffset,
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

  constructor(
    private readonly isExcluded: (typeId: string) => boolean,
    private readonly uncopyableBlockTypes: readonly string[] = [],
  ) {}

  capture(
    dimensionId: DimensionId,
    box: CellBox,
    ownerId: PlayerId,
    mode: CaptureMode,
  ): StructureHandle | CaptureRefusal {
    if (isStructureTooLarge(box)) return "tooLarge";
    try {
      const dimension = world.getDimension(dimensionId);
      const height = blockHeightRange(dimension);
      if (box.min.y < height.minY || box.max.y > height.maxY)
        return "unreadable";
      let name: string;
      do {
        name = structureIdentifier(ownerId, ++this.counter);
      } while (world.structureManager.get(name) !== undefined);
      const structure = world.structureManager.createFromWorld(
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
      if (mode === "copy" && !this.clearUncopyable(structure, dimension, box)) {
        this.discard(structureHandle(name));
        return "unreadable";
      }
      return structureHandle(name);
    } catch {
      return "unreadable";
    }
  }

  // The save options can only drop all blocks, so uncopyable types are
  // overwritten with air in the saved structure afterwards.
  private clearUncopyable(
    structure: Structure,
    dimension: Dimension,
    box: CellBox,
  ): boolean {
    if (this.uncopyableBlockTypes.length === 0) return true;
    try {
      const found = dimension.getBlocks(new BlockVolume(box.min, box.max), {
        includeTypes: [...this.uncopyableBlockTypes],
      });
      const air = BlockPermutation.resolve("minecraft:air");
      for (const cell of found.getBlockLocationIterator())
        structure.setBlockPermutation(structureOffset(box, cell), air);
      return true;
    } catch {
      return false;
    }
  }

  place(
    handle: StructureHandle,
    dimensionId: DimensionId,
    anchor: Cell,
    turn: QuarterTurn = NO_TURN,
  ): boolean {
    try {
      const structure = world.structureManager.get(handle);
      if (!structure) return false;
      const dimension = world.getDimension(dimensionId);
      const size = rotatedSize(structure.size, turn);
      const box = boxFromSize(anchor, size);
      const before = new Set(
        entitiesInside(dimension, box).map((entity) => entity.id),
      );
      world.structureManager.place(structure, dimension, anchor, {
        rotation: [
          StructureRotation.None,
          StructureRotation.Rotate90,
          StructureRotation.Rotate180,
          StructureRotation.Rotate270,
        ][turn],
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
