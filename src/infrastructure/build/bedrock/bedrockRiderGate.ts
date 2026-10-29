import type { RiderGate } from "../../../application/build/ports/rider";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import { playerById } from "../../shared/players";
import { BULLDOZER_TYPE } from "../identifiers";

export class BedrockRiderGate implements RiderGate {
  private bulldozer(playerId: PlayerId) {
    const player = playerById(playerId);
    if (!player?.isValid) return undefined;
    const ridden = player.getComponent("minecraft:riding")?.entityRidingOn;
    return ridden?.isValid && ridden.typeId === BULLDOZER_TYPE
      ? ridden
      : undefined;
  }

  ridesBulldozer(playerId: PlayerId): boolean {
    return this.bulldozer(playerId) !== undefined;
  }

  bulldozerFeet(playerId: PlayerId) {
    const ridden = this.bulldozer(playerId);
    if (!ridden) return undefined;
    const { x, y, z } = ridden.location;
    return {
      dimensionId: asDimensionId(ridden.dimension.id),
      cell: { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) },
    };
  }
}
