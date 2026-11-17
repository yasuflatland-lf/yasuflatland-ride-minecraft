import type { WarpPlayers } from "../../../application/warp/ports/players";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import { playerById } from "../../shared/players";

export class BedrockWarpPlayers implements WarpPlayers {
  locationOf(playerId: PlayerId) {
    const player = playerById(playerId);
    if (!player?.isValid) return undefined;
    const { x, y, z } = player.location;
    return {
      dimension: asDimensionId(player.dimension.id),
      position: { x, y, z },
    };
  }

  nameOf(playerId: PlayerId): string | undefined {
    const player = playerById(playerId);
    return player?.isValid ? player.name : undefined;
  }
}
