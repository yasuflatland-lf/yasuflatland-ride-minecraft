import type { CellBox } from "../../domain/build/box";
import { enterRotateMode } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { BoxAction } from "./boxAction";
import type { RotateBox } from "./rotateBox";

export class RotateBoxAction implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly rotate: Pick<RotateBox, "execute">,
  ) {}

  execute(playerId: PlayerId, dimensionId: DimensionId, box: CellBox): boolean {
    const session = this.repo.get(playerId);
    if (!session) return false;
    const flow = session.flow;
    if (
      (flow.kind !== "endpoint" &&
        !(flow.kind === "heightStep" && flow.heightedKind === "rotate")) ||
      flow.dimensionId !== dimensionId
    )
      return false;
    // RotateBox consumes an endpoint; retain the height step if it refuses.
    if (flow.kind === "heightStep")
      session.setFlow({
        kind: "endpoint",
        dimensionId,
        from: box.min,
        to: box.max,
        material: flow.material,
      });
    const rotated =
      this.rotate.execute({ playerId, dimensionId }) === "rotated";
    if (rotated) session.setFlow(enterRotateMode(session.flow));
    else session.setFlow(flow);
    return rotated;
  }
}
