import type { TentId } from "../../../domain/camp/tent";
import type { PlayerId } from "../../../domain/shared/ids";
import type { Paint } from "../../../domain/shared/paint";

export interface TentPaintWorld {
  /** undefined when the tent no longer exists. */
  paintOf(tentId: TentId): Paint | undefined;
  paint(tentId: TentId, paint: Paint): void;
  consumeDye(playerId: PlayerId, paint: Paint): void;
  /** false when the player is not in the world. */
  isCreative(playerId: PlayerId): boolean;
}
