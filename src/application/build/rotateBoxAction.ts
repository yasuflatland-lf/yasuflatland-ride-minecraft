import { enterRotateMode } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { BoxAction, BoxActionCommand } from "./boxAction";
import type { RotateBox } from "./rotateBox";

export class RotateBoxAction implements BoxAction {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly rotate: Pick<RotateBox, "execute">,
  ) {}

  execute(cmd: BoxActionCommand): boolean {
    const { playerId, selection } = cmd;
    const { dimensionId, box } = selection;
    const session = this.repo.get(playerId);
    if (!session) return false;
    const flow = session.flow;
    if (flow.kind === "selected") {
      if (flow.selection.dimensionId !== dimensionId) return false;
    } else if (
      flow.kind !== "heightStep" ||
      flow.heightedKind !== "rotate" ||
      flow.dimensionId !== dimensionId
    )
      return false;
    // RotateBox consumes a selection; retain the height step if it refuses.
    if (flow.kind === "heightStep")
      session.setFlow({
        kind: "selected",
        menuLevel: "root",
        selection,
        from: box.min,
        to: box.max,
      });
    const rotated =
      this.rotate.execute({ playerId, dimensionId }) === "rotated";
    if (rotated) session.setFlow(enterRotateMode(session.flow));
    else session.setFlow(flow);
    return rotated;
  }
}
