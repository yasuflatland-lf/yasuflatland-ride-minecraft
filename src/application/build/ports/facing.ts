import type { Facing } from "../../../domain/build/rotation/facing";
import type { PlayerId } from "../../../domain/shared/ids";

export interface FacingReader {
  facingOf(playerId: PlayerId): Facing;
}
