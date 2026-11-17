import type { FacingReader } from "../../../application/build/ports/facing";
import {
  type Facing,
  facingFromDirection,
  facingFromYaw,
} from "../../../domain/build/rotation/facing";
import type { PlayerId } from "../../../domain/shared/ids";
import { playerById } from "../../shared/players";

export class BedrockFacingReader implements FacingReader {
  facingOf(playerId: PlayerId): Facing {
    try {
      const player = playerById(playerId);
      if (!player?.isValid) return "north";
      try {
        const facing = facingFromDirection(player.getViewDirection());
        if (facing) return facing;
      } catch {
        // Body yaw remains usable when the view direction is unavailable.
      }
      return facingFromYaw(player.getRotation().y) ?? "north";
    } catch {
      return "north";
    }
  }
}
