import type { PlayerId } from "../../../domain/shared/ids";
import type { Paint } from "../../../domain/shared/paint";

export interface RepaintWorld<Id extends string> {
  /** undefined when the entity no longer exists. */
  paintOf(entityId: Id): Paint | undefined;
  /** The paint variant 0 shows for this entity; undefined when it no longer exists or cannot be painted. */
  defaultPaintOf(entityId: Id): Paint | undefined;
  setPaint(entityId: Id, paint: Paint): void;
  consumeDye(playerId: PlayerId, paint: Paint): void;
  /** false when the player is not in the world. */
  isCreative(playerId: PlayerId): boolean;
}
