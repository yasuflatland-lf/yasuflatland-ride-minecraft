import type { BuildFlow } from "../flow/flow";
import { BUILD_SPEC } from "../spec";
import { geometryOf } from "../volume/geometry";
import { apexHeight, type Ray } from "./aim";

export function aimedHeight(
  flow: Extract<BuildFlow, { kind: "heightStep" }>,
  ray: Ray,
): number {
  const { base } = flow;
  return apexHeight({
    centerX: base.min.x + (base.max.x - base.min.x + 1) / 2,
    centerZ: base.min.z + (base.max.z - base.min.z + 1) / 2,
    baseY: base.min.y,
    ray,
    cap: geometryOf(flow.heightedKind).maxHeight(base, BUILD_SPEC.worldTopY),
    previous: flow.previous,
    // Heights count layers, so the exclusive ceiling keeps the last layer at worldTopY.
    maxY: BUILD_SPEC.worldTopY + 1,
  });
}
