import type { Footprint, TopItem } from "../../../domain/camp/tabletop";
import type { DimensionId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { GroundCellsWorld } from "./groundCells";

/** The kinds of item a table top can hold (ADR 0185). */
export type HostedKindId = "dutch_oven";

/** What the shared table top rule needs to know about one kind of item. */
export interface HostedItemKind {
  readonly id: HostedKindId;
  readonly footprint: Footprint;
  /** Free air cells the item needs above the table's ground cell. */
  readonly clearance: number;
}

export interface TableTopWorld extends GroundCellsWorld {
  table(
    id: string,
  ): { dimension: DimensionId; at: Vec3; yaw: number } | undefined;
  /** Every item standing on the table, whatever its kind. */
  itemsOnTable(id: string): readonly TopItem[];
  spawnHostedOnTable(
    kind: HostedKindId,
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
    host: string,
  ): void;
}
