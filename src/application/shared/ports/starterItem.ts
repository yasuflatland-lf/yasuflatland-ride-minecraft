import type { PlayerId } from "../../../domain/shared/ids";

export interface StarterItemWorld {
  isCreative(playerId: PlayerId): boolean;
  received(playerId: PlayerId): boolean | undefined;
  markReceived(playerId: PlayerId): void;
  give(playerId: PlayerId): void;
}
