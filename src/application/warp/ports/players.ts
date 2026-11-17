import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface WarpPlayers {
  locationOf(
    playerId: PlayerId,
  ): { dimension: DimensionId; position: Vec3 } | undefined;
  nameOf(playerId: PlayerId): string | undefined;
}
