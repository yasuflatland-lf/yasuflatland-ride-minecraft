import { sizeOf } from "../box";
import type { BaseHeightFlow, HeightStepFlow } from "../flow/state";
import { selectionHeightLimit } from "../selection";
import { BUILD_SPEC } from "../spec";
import { volumeOf } from "../volume/geometry";
import { apexHeight, type Ray } from "./aim";

export function aimedHeight(
  flow: HeightStepFlow | BaseHeightFlow,
  ray: Ray,
): number {
  const live = flow.kind === "baseHeight";
  const base = live ? flow.baseBox : flow.base;
  const size = sizeOf(base);
  return apexHeight({
    centerX: base.min.x + size.x / 2,
    centerZ: base.min.z + size.z / 2,
    baseY: base.min.y,
    // A level ray keeps the original top layer regardless of the player's eye height.
    ray: live
      ? { ...ray, origin: { ...ray.origin, y: flow.selection.box.max.y + 0.5 } }
      : ray,
    cap: live
      ? selectionHeightLimit(base)
      : volumeOf(flow.heightedKind).maxHeight(base, BUILD_SPEC.worldTopY),
    previous: flow.previous,
    // Heights count layers, so the exclusive ceiling keeps the last layer at worldTopY.
    maxY: BUILD_SPEC.worldTopY + 1,
  });
}
