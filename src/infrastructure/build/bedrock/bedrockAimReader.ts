import { InputMode } from "@minecraft/server";
import type { AimReader } from "../../../application/build/ports/aim";
import type { AimSample, InputKind } from "../../../domain/build/aim/sample";
import { BUILD_SPEC } from "../../../domain/build/spec";
import { asDimensionId, type PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { blockFaceOf } from "../../shared/faces";
import { playerById } from "../../shared/players";

export function readInputKind(readMode: () => unknown): InputKind {
  try {
    return readMode() === InputMode.Touch ? "touch" : "pointer";
  } catch {
    return "pointer";
  }
}

export interface AimOverride {
  input?: InputKind;
  target?: Pick<AimSample, "block" | "input"> & { direction?: Vec3 };
}

export class BedrockAimReader implements AimReader {
  constructor(
    private readonly overrides: ReadonlyMap<PlayerId, AimOverride> = new Map(),
  ) {}

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
      const origin = player.getHeadLocation();
      const direction = player.getViewDirection();
      const override = this.overrides.get(playerId);
      if (override?.target) {
        const target = override.target;
        return {
          ray: { origin, direction: target.direction ?? direction },
          block: target.block,
          input: target.input,
        };
      }
      return {
        ray: { origin, direction },
        block: hit
          ? { cell: hit.block.location, face: blockFaceOf(hit.face) }
          : undefined,
        input:
          override?.input ??
          readInputKind(() => player.inputInfo.lastInputModeUsed),
      };
    } catch {
      return undefined;
    }
  }
}
