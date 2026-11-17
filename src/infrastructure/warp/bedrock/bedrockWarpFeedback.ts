import type { RawMessage } from "@minecraft/server";
import type { WarpFeedback } from "../../../application/warp/ports/feedback";
import type { PlayerId } from "../../../domain/shared/ids";
import type { WarpPoint } from "../../../domain/warp/warpPoint";
import { playerById } from "../../shared/players";
import { WARP_MESSAGE } from "../messages";

function showMessage(playerId: PlayerId, message: RawMessage): void {
  const player = playerById(playerId);
  if (!player?.isValid) return;
  player.onScreenDisplay.setActionBar(message);
}

export class BedrockWarpFeedback implements WarpFeedback {
  registryUnreadable(playerId: PlayerId): void {
    showMessage(playerId, { translate: WARP_MESSAGE.registryUnreadable });
  }
  registryFull(playerId: PlayerId): void {
    showMessage(playerId, { translate: WARP_MESSAGE.registryFull });
  }
  pointGone(playerId: PlayerId, point: WarpPoint): void {
    showMessage(playerId, {
      translate: WARP_MESSAGE.pointGone,
      with: [point.name],
    });
  }
  noPoints(playerId: PlayerId): void {
    showMessage(playerId, { translate: WARP_MESSAGE.noPoints });
  }
  teleportFailed(playerId: PlayerId): void {
    showMessage(playerId, { translate: WARP_MESSAGE.teleportFailed });
  }
}
