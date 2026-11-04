// Applies camera and status effects to vehicle riders (ADR 0012).

import type { RiderEffectWorld } from "../../../application/vehicle/ports/drive";
import type { PlayerId } from "../../../domain/shared/ids";
import type { ChaseCamera } from "../../../domain/vehicle/profile";
import type { EntityIndex } from "./entityIndex";
import { CHASE_CAMERAS } from "./identifiers";

export class BedrockRiderEffects implements RiderEffectWorld {
  constructor(private readonly index: EntityIndex) {}

  setChaseCamera(playerId: PlayerId, chase: ChaseCamera | undefined): void {
    const camera = this.index.player(playerId)?.camera;
    if (!camera) return;
    if (chase) camera.setCamera(CHASE_CAMERAS[chase]);
    else camera.clear();
  }

  giveWaterBreathing(playerId: PlayerId, ticks: number): void {
    this.index.player(playerId)?.addEffect("water_breathing", ticks, {
      showParticles: false,
    });
  }

  protectFromFire(playerId: PlayerId): void {
    const player = this.index.player(playerId);
    if (!player) return;
    player.addEffect("fire_resistance", 2, { showParticles: false });
    player.extinguishFire(false);
  }
}
