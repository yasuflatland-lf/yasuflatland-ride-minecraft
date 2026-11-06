import type { BuildPlayers } from "../../../application/build/ports/players";
import { type Cell, cellOf } from "../../../domain/shared/cells";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import { playerById } from "../../shared/players";

export class BedrockBuildPlayers implements BuildPlayers {
  occupantOf(playerId: PlayerId) {
    const player = playerById(playerId);
    if (!player?.isValid || player.getComponent("minecraft:riding"))
      return undefined;
    return {
      dimensionId: asDimensionId(player.dimension.id),
      feet: cellOf(player.location),
    };
  }

  moveTo(playerId: PlayerId, cell: Cell): void {
    const player = playerById(playerId);
    if (!player?.isValid || player.getComponent("minecraft:riding")) return;
    player.teleport({ x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 });
  }
}
