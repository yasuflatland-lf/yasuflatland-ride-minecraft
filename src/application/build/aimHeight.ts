import type { Ray } from "../../domain/build/aim/aim";
import { aimedHeight } from "../../domain/build/aim/height";
import { setHeight } from "../../domain/build/flow/heightFlow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
export class AimHeight {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; ray: Ray }): void {
    const session = this.repo.get(cmd.playerId);
    if (!session) return;
    const flow = session.flow;
    if (
      flow.kind !== "baseHeight" &&
      (flow.kind !== "heightStep" || flow.heightLocked)
    )
      return;
    const height = aimedHeight(flow, cmd.ray);
    session.setFlow(setHeight(flow, height));
  }
}
