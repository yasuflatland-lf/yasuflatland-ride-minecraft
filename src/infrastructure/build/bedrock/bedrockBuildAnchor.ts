import type { BuildAnchor } from "../../../application/build/ports/anchor";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import { playerById } from "../../shared/players";

export class BedrockBuildAnchor implements BuildAnchor {
  feetOf(playerId: PlayerId) {
    const player = playerById(playerId);
    if (!player?.isValid) return undefined;
    try {
      const { x, y, z } = player.location;
      return {
        dimensionId: asDimensionId(player.dimension.id),
        cell: { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) },
      };
    } catch {
      return undefined;
    }
  }
}
