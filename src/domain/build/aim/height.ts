import { sizeOf } from "../box";
import type { BuildFlow } from "../flow/flow";
import { BUILD_SPEC } from "../spec";
import { volumeOf } from "../volume/geometry";
import { apexHeight, type Ray } from "./aim";

export function aimedHeight(
  flow: Extract<BuildFlow, { kind: "heightStep" }>,
  ray: Ray,
): number {
  const { base } = flow;
  const size = sizeOf(base);
  return apexHeight({
    centerX: base.min.x + size.x / 2,
    centerZ: base.min.z + size.z / 2,
    baseY: base.min.y,
    ray,
    cap: volumeOf(flow.heightedKind).maxHeight(base, BUILD_SPEC.worldTopY),
    previous: flow.previous,
    // Heights count layers, so the exclusive ceiling keeps the last layer at worldTopY.
    maxY: BUILD_SPEC.worldTopY + 1,
  });
}
