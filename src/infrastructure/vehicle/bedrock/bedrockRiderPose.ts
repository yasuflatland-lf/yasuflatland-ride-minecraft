import type { RiderPose } from "../../../application/vehicle/ports/drive";
import type { PlayerId } from "../../../domain/shared/ids";
import { NAMESPACE } from "../../shared/identifiers";
import type { EntityIndex } from "./entityIndex";
import {
  RIDER_POSE_ANIMATION_PREFIX,
  RIDER_POSE_CLEAR_BLEND_OUT_TIME,
  RIDER_POSE_CLEAR_EXPRESSION,
  RIDER_POSE_CONTROLLER,
  RIDER_POSE_PLAY_BLEND_OUT_TIME,
  RIDER_POSE_STOP_EXPRESSION,
} from "./identifiers";

export class BedrockRiderPose implements RiderPose {
  private readonly lastPose = new Map<PlayerId, string>();

  constructor(private readonly index: EntityIndex) {}

  play(playerId: PlayerId, pose: string): void {
    if (
      this.animate(
        playerId,
        pose,
        RIDER_POSE_STOP_EXPRESSION,
        RIDER_POSE_PLAY_BLEND_OUT_TIME,
      )
    )
      this.lastPose.set(playerId, pose);
  }

  clear(playerId: PlayerId): void {
    const pose = this.lastPose.get(playerId);
    this.lastPose.delete(playerId);
    if (pose !== undefined)
      this.animate(
        playerId,
        pose,
        RIDER_POSE_CLEAR_EXPRESSION,
        RIDER_POSE_CLEAR_BLEND_OUT_TIME,
      );
  }

  private animate(
    playerId: PlayerId,
    pose: string,
    stopExpression: string,
    blendOutTime: number,
  ): boolean {
    try {
      const player = this.index.player(playerId);
      if (!player?.isValid) return false;
      player.playAnimation(RIDER_POSE_ANIMATION_PREFIX + pose, {
        controller: RIDER_POSE_CONTROLLER,
        blendOutTime,
        stopExpression,
      });
      return true;
    } catch (error) {
      console.warn(`[${NAMESPACE}] rider pose failed: ${error}`);
      return false;
    }
  }
}
