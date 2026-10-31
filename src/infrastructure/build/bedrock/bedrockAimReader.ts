import type { AimReader } from "../../../application/build/ports/aim";
import { BUILD_SPEC } from "../../../domain/build/spec";
import type { PlayerId } from "../../../domain/shared/ids";
import { playerById } from "../../shared/players";

export class BedrockAimReader implements AimReader {
  aim(playerId: PlayerId) {
    try {
      const player = playerById(playerId);
      if (!player?.isValid) return undefined;
      const hit = player.getBlockFromViewDirection({
        maxDistance: BUILD_SPEC.reach,
      });
      return {
        ray: {
          origin: player.getHeadLocation(),
          direction: player.getViewDirection(),
        },
        block: hit ? { cell: hit.block.location, face: hit.face } : undefined,
      };
    } catch {
      return undefined;
    }
  }
}
