import type { TopRect } from "../../../domain/shared/tableTop";

/** The kinds of item a table top can hold (ADR 0185). */
export type HostedKindId = "dutch_oven" | "gas_lantern";

/** What the shared table top rule needs to know about one kind of item. */
export interface HostedItemKind {
  readonly id: HostedKindId;
  readonly footprint: TopRect;
  /** Free air cells the item needs above the table's ground cell. */
  readonly clearance: number;
}
