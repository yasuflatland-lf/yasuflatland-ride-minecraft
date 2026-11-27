import type { BlockTap } from "../../domain/build/blockTap";
import { type CellBox, sameBox } from "../../domain/build/box";
import {
  cornerCell,
  turnCorner,
} from "../../domain/build/clipboard/anchorCorner";
import {
  type PasteTarget,
  pasteTarget,
} from "../../domain/build/clipboard/clipboard";
import { snapToGround } from "../../domain/build/clipboard/ground";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
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

export class ResolvePasteTarget {
  // Reuse a snap across outline redraws. It expires so changes under the
  // footprint show up even when the player keeps the same target.
  private readonly snaps = new Map<PlayerId, Snap>();

  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly ground: GroundProbe,
  ) {}

  execute(command: {
    playerId: PlayerId;
    tap: BlockTap;
    dimensionId: DimensionId;
    tick: number;
    fresh?: boolean;
  }): PasteTargetResult {
    const session = this.repo.get(command.playerId);
    if (!session?.clipboard || session.flow.kind !== "pasteAim") {
      this.snaps.delete(command.playerId);
      return { kind: "noTarget" };
    }
    if (command.tap.dimensionId !== command.dimensionId)
      return { kind: "noTarget" };
    const { tap } = command;
    const turn = session.pasteTurn;
    const target = pasteTarget(
      session.clipboard,
      tap.cell,
      tap.face ?? "up",
      turn,
    );
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
