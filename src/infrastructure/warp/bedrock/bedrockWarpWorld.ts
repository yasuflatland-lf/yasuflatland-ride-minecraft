import { world } from "@minecraft/server";
import type { WarpWorld } from "../../../application/warp/ports/world";
import { type Cell, cellCenter, cellOf } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { isStandable } from "../../../domain/shared/standing";
import { WARP_LANDING_POLICY } from "../../../domain/warp/landing";
import type { BlockPresence } from "../../../domain/warp/presence";
import type { WarpPoint } from "../../../domain/warp/warpPoint";
import { sampleBlock } from "../../shared/blocks";
import { playerById } from "../../shared/players";
import { WARP_BLOCK_TYPE } from "../identifiers";

export class BedrockWarpWorld implements WarpWorld {
  presence(point: WarpPoint): BlockPresence {
    try {
      const block = world.getDimension(point.dimension).getBlock(point.cell);
      if (!block) return "unloaded";
      return block.typeId === WARP_BLOCK_TYPE ? "present" : "gone";
    } catch {
      return "unloaded";
    }
  }

  isStandable(dimensionId: DimensionId, feet: Cell): boolean {
    try {
      const dimension = world.getDimension(dimensionId);
      const floor = sampleBlock(dimension, cellOf({ ...feet, y: feet.y - 1 }));
      const body = sampleBlock(dimension, feet);
      const head = sampleBlock(dimension, cellOf({ ...feet, y: feet.y + 1 }));
      return isStandable(body, head, floor, WARP_LANDING_POLICY);
    } catch {
      return false;
    }
  }

  teleport(playerId: PlayerId, dimensionId: DimensionId, feet: Cell): boolean {
    try {
      const player = playerById(playerId);
      if (!player?.isValid) return false;
      // An unloaded target does not throw on BDS 1.26.63.1 (ADR 0249 probe); a throw still reports failure.
      player.teleport(cellCenter(feet), {
        dimension: world.getDimension(dimensionId),
      });
      return true;
    } catch {
      return false;
    }
  }
}
