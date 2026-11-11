import type { CellBox } from "../../domain/build/box";
import {
  aimedPasteTarget,
  type PasteTarget,
} from "../../domain/build/clipboard/clipboard";
import { snapToGround } from "../../domain/build/clipboard/ground";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
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

function sameBox(a: CellBox, b: CellBox): boolean {
  return (
    a.min.x === b.min.x &&
    a.min.y === b.min.y &&
    a.min.z === b.min.z &&
    a.max.x === b.max.x &&
    a.max.y === b.max.y &&
    a.max.z === b.max.z
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
  }): PasteTargetResult {
    const session = this.repo.get(command.playerId);
    if (!session?.clipboard) {
      this.snaps.delete(command.playerId);
      return { kind: "noTarget" };
    }
    const target = aimedPasteTarget(
      session.clipboard,
      command.aim,
      session.pasteTurn,
    );
    if (!target) return { kind: "noTarget" };
    const box = this.snap(command, target.box);
    return box
      ? { kind: "target", target: { ...target, box, anchor: box.min } }
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
