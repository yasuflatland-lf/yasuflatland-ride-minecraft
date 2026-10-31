import { apexHeight, type Ray } from "../../domain/build/aim/aim";
import { setRoofHeight } from "../../domain/build/flow/flow";
import { maxRoofHeight } from "../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
export class AimRoofHeight {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; ray: Ray }): void {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind !== "roofHeight") return;
    const flow = session.flow;
    const { base } = flow;
    const height = apexHeight({
      centerX: base.min.x + (base.max.x - base.min.x + 1) / 2,
      centerZ: base.min.z + (base.max.z - base.min.z + 1) / 2,
      baseY: base.min.y,
      ray: cmd.ray,
      cap: maxRoofHeight(base, BUILD_SPEC.worldTopY),
      previous: flow.previous,
      // Heights count layers, so the exclusive ceiling keeps the last layer at worldTopY.
      maxY: BUILD_SPEC.worldTopY + 1,
    });
    session.setFlow(setRoofHeight(flow, height));
  }
}
