import type { WarpPointId } from "./ids";
import type { WarpPoint } from "./warpPoint";
import { pointsOf, removePoint, type WarpRegistry } from "./warpRegistry";

export type BlockPresence = "present" | "gone" | "unloaded";

export function pruneGone(
  reg: WarpRegistry,
  probe: (p: WarpPoint) => BlockPresence,
): {
  registry: WarpRegistry;
  removed: readonly WarpPoint[];
  unverified: ReadonlySet<WarpPointId>;
} {
  let registry = reg;
  const removed: WarpPoint[] = [];
  const unverified = new Set<WarpPointId>();
  for (const point of pointsOf(reg)) {
    const presence = probe(point);
    if (presence === "gone") {
      registry = removePoint(registry, point.id);
      removed.push(point);
    } else if (presence === "unloaded") unverified.add(point.id);
  }
  return { registry, removed, unverified };
}
