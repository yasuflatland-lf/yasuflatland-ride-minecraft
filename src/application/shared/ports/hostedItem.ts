import type { Brand } from "../../../domain/shared/ids";
import type { TopRect } from "../../../domain/shared/tableTop";

/** The owning feature assigns this ID when it registers a hosted item kind (ADR 0129). */
export type HostedKindId = Brand<string, "HostedKindId">;

/** What the shared table top rule needs to know about one kind of item. */
export interface HostedItemKind {
  readonly id: HostedKindId;
  readonly footprint: TopRect;
  /** Free air cells the item needs above the table's ground cell. */
  readonly clearance: number;
}
