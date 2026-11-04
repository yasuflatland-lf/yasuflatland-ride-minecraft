import type { Dimension, Player } from "@minecraft/server";
import type { TentFlaps } from "../../../domain/camp/flaps";
import {
  type FlapId,
  flapAt,
  flapCells,
  type TentId,
} from "../../../domain/camp/tent";
import { tentFlapExitCells } from "../../../domain/camp/tentFlapExit";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { safeBlockAt } from "../../shared/blocks";
import { AIR_BLOCK } from "../../shared/identifiers";
import { playerById } from "../../shared/players";
import {
  FLAP_BLOCKED_HINT,
  TENT_FLAP_BLOCK,
  TENT_OPEN_STATE,
} from "../identifiers";
import { dimensionOf } from "./tentDimension";
import { tentEntityOf } from "./tentEntity";
import type { TentFlapStore } from "./tentFlapStore";
import type { TentLayout } from "./tentLayout";

// Only feet inside a flap cell need checking; neighbouring bodies add no reach (ADR 0212).
function flapBlockerBox(cell: Vec3): {
  location: Vec3;
  volume: Vec3;
} {
  return {
    location: cell,
    volume: { x: 1, y: 1, z: 1 },
  };
}

export class BedrockTentFlapWorld {
  constructor(
    private readonly layout: TentLayout,
    private readonly flaps: TentFlapStore,
  ) {}

  /** The tent and flap whose tent_flap block is at `cell`; before the first lay after /reload, from the registry. */
  flapAt(
    dimensionId: DimensionId,
    cell: Vec3,
  ): { tentId: TentId; flap: FlapId } | undefined {
    const tentId = this.layout.tentBlockOwner(
      dimensionId,
      cell,
      TENT_FLAP_BLOCK,
    );
    if (tentId === undefined) return undefined;
    const entry = this.layout.entryOf(tentId);
    const flap = entry && flapAt(entry.pose, cell);
    return flap === undefined ? undefined : { tentId, flap };
  }

  flapsOf(tentId: TentId): TentFlaps | undefined {
    const tent = tentEntityOf(tentId);
    return tent ? this.flaps.flapsOf(tent) : undefined;
  }

  clearPlayersForClose(tentId: TentId, flap: FlapId): boolean {
    const entry = this.layout.entryOf(tentId);
    if (!entry) return true;
    const dimension = dimensionOf(entry.dimensionId);
    if (!dimension) return true;
    const cells = flapCells(entry.pose, flap);
    const moves = new Map<Player, Vec3>();
    for (const cell of cells) {
      const box = flapBlockerBox(cell);
      if (dimension.getEntities({ ...box, families: ["mob"] }).length > 0)
        return false;
      for (const player of dimension.getPlayers(box)) {
        const target = tentFlapExitCells(
          entry.pose,
          flap,
          cell,
          player.location,
        ).find((at) => this.isFlapExitFree(dimension, at));
        if (!target) return false;
        moves.set(player, {
          x: target.x + 0.5,
          y: player.location.y,
          z: target.z + 0.5,
        });
      }
    }
    for (const [player, target] of moves)
      player.teleport(target, {
        keepVelocity: false,
        rotation: player.getRotation(),
      });
    return true;
  }

  private isFlapExitFree(dimension: Dimension, cell: Cell): boolean {
    return [cell, { ...cell, y: cell.y + 1 }].every((at) => {
      const block = safeBlockAt(dimension, at);
      return (
        block?.typeId === AIR_BLOCK ||
        (block?.typeId === TENT_FLAP_BLOCK &&
          block.permutation.getAllStates()[TENT_OPEN_STATE] === true)
      );
    });
  }

  showFlapBlocked(playerId: PlayerId): void {
    playerById(playerId)?.onScreenDisplay.setActionBar({
      translate: FLAP_BLOCKED_HINT,
    });
  }
}
