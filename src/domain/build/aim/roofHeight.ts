import type { BuildFlow } from "../flow/flow";
import { maxRoofHeight } from "../roof/roof";
import { BUILD_SPEC } from "../spec";
import { apexHeight, type Ray } from "./aim";

export function aimedRoofHeight(
  flow: Extract<BuildFlow, { kind: "roofHeight" }>,
  ray: Ray,
): number {
  const { base } = flow;
  return apexHeight({
    centerX: base.min.x + (base.max.x - base.min.x + 1) / 2,
    centerZ: base.min.z + (base.max.z - base.min.z + 1) / 2,
    baseY: base.min.y,
    ray,
    cap: maxRoofHeight(base, BUILD_SPEC.worldTopY),
    previous: flow.previous,
    // Heights count layers, so the exclusive ceiling keeps the last layer at worldTopY.
    maxY: BUILD_SPEC.worldTopY + 1,
  });
}
