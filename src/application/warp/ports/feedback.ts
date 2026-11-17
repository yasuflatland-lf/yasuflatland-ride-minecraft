import type { PlayerId } from "../../../domain/shared/ids";
import type { WarpPoint } from "../../../domain/warp/warpPoint";

export interface WarpFeedback {
  registryUnreadable(playerId: PlayerId): void;
  registryFull(playerId: PlayerId): void;
  pointGone(playerId: PlayerId, point: WarpPoint): void;
  noPoints(playerId: PlayerId): void;
  teleportFailed(playerId: PlayerId): void;
}
