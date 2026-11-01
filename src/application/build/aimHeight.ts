import type { Ray } from "../../domain/build/aim/aim";
import { aimedHeight } from "../../domain/build/aim/height";
import { setHeight } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
export class AimHeight {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; ray: Ray }): void {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind !== "heightStep" || session.flow.heightLocked)
      return;
    const flow = session.flow;
    const height = aimedHeight(flow, cmd.ray);
    session.setFlow(setHeight(flow, height));
  }
}
