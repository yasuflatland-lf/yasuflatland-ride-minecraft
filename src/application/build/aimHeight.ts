import type { Ray } from "../../domain/build/aim/aim";
import { aimedHeight } from "../../domain/build/aim/height";
import { setHeight } from "../../domain/build/flow/heightFlow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildBlockWorld } from "./ports/blocks";
export class AimHeight {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly blocks: Pick<BuildBlockWorld, "heightRange">,
  ) {}
  execute(cmd: { playerId: PlayerId; ray: Ray }): void {
    const session = this.repo.get(cmd.playerId);
    if (!session) return;
    const flow = session.flow;
    if (
      flow.kind !== "baseHeight" &&
      (flow.kind !== "heightStep" || flow.heightLocked)
    )
      return;
    const dimensionId =
      flow.kind === "baseHeight"
        ? flow.selection.dimensionId
        : flow.dimensionId;
    const height = aimedHeight(
      flow,
      cmd.ray,
      this.blocks.heightRange(dimensionId),
    );
    session.setFlow(setHeight(flow, height));
  }
}
