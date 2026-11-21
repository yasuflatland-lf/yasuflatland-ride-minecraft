import { InputMode } from "@minecraft/server";
import type { AimReader } from "../../../application/build/ports/aim";
import type { AimSample, InputKind } from "../../../domain/build/aim/sample";
import { BUILD_SPEC } from "../../../domain/build/spec";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import { playerById } from "../../shared/players";
import { FACES } from "./faces";

export function readInputKind(readMode: () => unknown): InputKind {
  try {
    return readMode() === InputMode.Touch ? "touch" : "pointer";
  } catch {
    return "pointer";
  }
}

export class BedrockAimReader implements AimReader {
  private readonly touchOverrides = new Set<PlayerId>();

  setTouchOverride(playerId: PlayerId, enabled: boolean): void {
    if (enabled) this.touchOverrides.add(playerId);
    else this.touchOverrides.delete(playerId);
  }

  dimensionOf(playerId: PlayerId) {
    try {
      const player = playerById(playerId);
      return player?.isValid ? asDimensionId(player.dimension.id) : undefined;
    } catch {
      return undefined;
    }
  }
  aim(playerId: PlayerId): AimSample | undefined {
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
        block: hit
          ? { cell: hit.block.location, face: FACES[hit.face] }
          : undefined,
        input: this.touchOverrides.has(playerId)
          ? "touch"
          : readInputKind(() => player.inputInfo.lastInputModeUsed),
      };
    } catch {
      return undefined;
    }
  }
}
