import {
  aimedPasteTarget,
  type PasteTarget,
} from "../../domain/build/clipboard/clipboard";
import { snapToGround } from "../../domain/build/clipboard/ground";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { AimResult } from "./ports/aim";
import type { GroundProbe } from "./ports/ground";

type PasteTargetResult =
  | { kind: "noTarget" }
  | { kind: "noGround" }
  | { kind: "target"; target: PasteTarget };

export class ResolvePasteTarget {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly ground: GroundProbe,
  ) {}

  execute(command: {
    playerId: PlayerId;
    aim: AimResult;
    dimensionId: DimensionId;
  }): PasteTargetResult {
    const session = this.repo.get(command.playerId);
    if (!session?.clipboard) return { kind: "noTarget" };
    const target = aimedPasteTarget(
      session.clipboard,
      command.aim,
      session.pasteTurn,
    );
    if (!target) return { kind: "noTarget" };
    const box = snapToGround(target.box, (x, z) =>
      this.ground.topSolidY(command.dimensionId, x, z, target.box.min.y),
    );
    return box
      ? { kind: "target", target: { ...target, box, anchor: box.min } }
      : { kind: "noGround" };
  }
}
