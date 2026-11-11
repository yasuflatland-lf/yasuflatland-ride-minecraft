import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { RotateBox } from "./rotateBox";

export class RotateModeTap {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly rotate: Pick<RotateBox, "execute">,
  ) {}

  execute(cmd: {
    playerId: PlayerId;
    dimensionId: DimensionId;
  }): "rotated" | "refused" | "busy" | "ignored" {
    const flow = this.repo.get(cmd.playerId)?.flow;
    if (flow?.kind !== "rotateMode" || flow.dimensionId !== cmd.dimensionId)
      return "ignored";
    return this.rotate.execute(cmd);
  }
}
