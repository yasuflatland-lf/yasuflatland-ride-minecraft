import { type CellBox, sameBox } from "../../domain/build/box";
import {
  cornerCell,
  turnCorner,
} from "../../domain/build/clipboard/anchorCorner";
import {
  aimedPasteTarget,
  type PasteTarget,
} from "../../domain/build/clipboard/clipboard";
import { snapToGround } from "../../domain/build/clipboard/ground";
import {
  effectiveTurn,
  type Facing,
  facingFromDirection,
} from "../../domain/build/rotation/facing";
import { NO_TURN } from "../../domain/build/rotation/quarterTurn";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { AimResult } from "./ports/aim";
import type { GroundProbe } from "./ports/ground";

type PasteTargetResult =
  | { kind: "noTarget" }
  | { kind: "noGround" }
  | { kind: "target"; target: PasteTarget };

type Snap = {
  dimensionId: DimensionId;
  aimed: CellBox;
  tick: number;
  snapped: CellBox | undefined;
};

export function pasteFacing(
  copied: Facing,
  previous: Facing | undefined,
  direction: Vec3 | undefined,
): Facing {
  return (
    (direction && facingFromDirection(direction, previous)) ??
    previous ??
    copied
  );
}

export class ResolvePasteTarget {
  // The outline redraws every few ticks while the gaze often rests on one
  // block, so the preview reuses the last snap instead of rescanning the
  // footprint. Entries expire so blocks placed under it still show up.
  private readonly snaps = new Map<PlayerId, Snap>();

  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly ground: GroundProbe,
  ) {}

  execute(command: {
    playerId: PlayerId;
    aim: AimResult;
    dimensionId: DimensionId;
    tick: number;
    fresh?: boolean;
    facing?: Facing;
  }): PasteTargetResult {
    const session = this.repo.get(command.playerId);
    if (!session?.clipboard) {
      this.snaps.delete(command.playerId);
      return { kind: "noTarget" };
    }
    const flow = session.flow;
    const copied = session.clipboard.facing;
    const facing =
      command.facing ??
      pasteFacing(
        copied,
        flow.kind === "pasteAim" ? flow.facing : undefined,
        command.aim.ray.direction,
      );
    const turn =
      flow.kind === "pasteAim"
        ? effectiveTurn(copied, facing, flow.manualTurn)
        : NO_TURN;
    const target = aimedPasteTarget(session.clipboard, command.aim, turn);
    if (!target) return { kind: "noTarget" };
    const box = this.snap(command, target.box);
    return box
      ? {
          kind: "target",
          target: {
            turn,
            box,
            anchor: box.min,
            corner: cornerCell(box, turnCorner(session.clipboard.anchor, turn)),
          },
        }
      : { kind: "noGround" };
  }

  private snap(
    command: {
      playerId: PlayerId;
      dimensionId: DimensionId;
      tick: number;
      fresh?: boolean;
    },
    aimed: CellBox,
  ): CellBox | undefined {
    const cached = this.snaps.get(command.playerId);
    if (
      !command.fresh &&
      cached &&
      cached.dimensionId === command.dimensionId &&
      sameBox(cached.aimed, aimed) &&
      command.tick >= cached.tick &&
      command.tick - cached.tick < BUILD_SPEC.groundCacheTicks
    )
      return cached.snapped;
    const snapped = snapToGround(aimed, (x, z, lowestY) =>
      this.ground.topSolidY(command.dimensionId, x, z, aimed.min.y, lowestY),
    );
    this.snaps.set(command.playerId, {
      dimensionId: command.dimensionId,
      aimed,
      tick: command.tick,
      snapped,
    });
    return snapped;
  }
}
