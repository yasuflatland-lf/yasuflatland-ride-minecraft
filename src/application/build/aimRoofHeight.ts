import type { Ray } from "../../domain/build/aim/aim";
import { aimedRoofHeight } from "../../domain/build/aim/roofHeight";
import { setRoofHeight } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
export class AimRoofHeight {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; ray: Ray }): void {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind !== "roofHeight") return;
    const flow = session.flow;
    const height = aimedRoofHeight(flow, cmd.ray);
    session.setFlow(setRoofHeight(flow, height));
  }
}
