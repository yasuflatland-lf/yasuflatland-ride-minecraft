import {
  insideTent,
  inTentFootprint,
  type TentBlock,
  type TentId,
  tentBlockAt,
} from "../../../domain/camp/tent";
import type { TentEntry } from "../../../domain/camp/tentRegistry";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { chunkLoadedAt, safeBlockAt } from "../../shared/blocks";
import { dimensionById } from "../../shared/dimensions";
import { isOwnTypeId } from "../../shared/identifiers";
import type { CellLayer } from "../../shared/laidCells";
import type { DynamicPropertyTentRegistry } from "../persistence/tentRegistry";
import { TENT_CELL_CODEC } from "./tentBlocks";
import { tentEntityOf } from "./tentEntity";

export class TentSpace {
  constructor(
    private readonly deps: {
      registry: DynamicPropertyTentRegistry;
      blocks: CellLayer<TentId, TentBlock>;
    },
  ) {}

  /** Whether a pitched tent in that dimension takes `cell`; answers from the saved registry, before any tent is loaded. */
  isCampSpace(dimensionId: DimensionId, cell: Cell): boolean {
    return this.entriesIn(dimensionId).some((e) =>
      inTentFootprint(e.pose, cell),
    );
  }

  /** The tent whose block `typeId` is at `cell`; before the first lay after /reload, from the registry. */
  tentBlockOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): TentId | undefined {
    const laid = this.deps.blocks.laidBlockOwner(dimensionId, cell, typeId);
    if (laid !== undefined) return laid;
    return this.entriesIn(dimensionId).find((e) => {
      const block = tentBlockAt(e.pose, cell);
      return block !== undefined && TENT_CELL_CODEC.blockIdOf(block) === typeId;
    })?.id;
  }

  /** The loaded tent in that dimension whose rooms hold `feet`. */
  tentContaining(dimensionId: DimensionId, feet: Vec3): TentId | undefined {
    return this.entriesIn(dimensionId).find(
      (e) => insideTent(e.pose, feet) && tentEntityOf(e.id) !== undefined,
    )?.id;
  }

  entryOf(tentId: TentId): TentEntry | undefined {
    return this.deps.registry.all().find((e) => e.id === tentId);
  }

  entriesIn(dimensionId: DimensionId): TentEntry[] {
    return this.deps.registry
      .all()
      .filter((e) => e.dimensionId === dimensionId);
  }

  isOwnBlock(dimensionId: DimensionId, at: Vec3): boolean {
    return isOwnTypeId(this.typeIdAt(dimensionId, at));
  }

  typeIdAt(dimensionId: DimensionId, at: Vec3): string | undefined {
    return safeBlockAt(dimensionById(dimensionId), at)?.typeId;
  }

  entityLoaded(tentId: TentId): boolean {
    return tentEntityOf(tentId) !== undefined;
  }

  listTents(): readonly TentEntry[] {
    return this.deps.registry.all();
  }

  anchorLoaded(entry: TentEntry): boolean {
    const dimension = dimensionById(entry.dimensionId);
    return dimension !== undefined && chunkLoadedAt(dimension, entry.pose);
  }
}
