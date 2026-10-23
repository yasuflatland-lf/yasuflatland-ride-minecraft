// Select targets in a rectangle in front of the vehicle (behind it when reversing) and decide the damage and push (ADR 0006).
import { dot, rightOf, type Vec2, type Vec3 } from "../shared/vec";
import type { VehicleBody } from "./profile";
import { SPEC } from "./spec";

/** What a ram target is riding, as far as ram protection cares (ADR 0006). */
export type RamMount = "vehicle" | "deckSeat";

export interface RamTarget {
  readonly id: string;
  readonly offset: Vec3;
  /** Undefined when the target rides nothing, or something that is neither a vehicle nor a deck seat. */
  readonly mount?: RamMount;
}
export interface RamHit {
  readonly id: string;
  readonly damage: number;
  readonly push: Vec2;
  readonly pushUp: number;
}

/**
 * Riders of a vehicle are never rammed (ADR 0006). A deck seat is not a
 * vehicle seat, so its rider is treated like a target on foot until the
 * product decides otherwise.
 */
export function isProtectedFromRam(target: RamTarget): boolean {
  return target.mount === "vehicle";
}

export function ramDamage(speed: number): number {
  return Math.max(1, Math.round(Math.abs(speed) * SPEC.ramDamagePerSpeed));
}

export function selectHits(
  f: Vec2,
  speed: number,
  targets: readonly RamTarget[],
  lastHit: ReadonlyMap<string, number>,
  tick: number,
  body: Pick<VehicleBody, "front" | "halfWidth">,
): RamHit[] {
  if (Math.abs(speed) <= SPEC.ramMinSpeed) return [];
  const dir = Math.sign(speed);
  const right = rightOf(f);
  const reach = body.front + SPEC.targetHalfWidth;
  const halfWidth = body.halfWidth + SPEC.targetHalfWidth;
  const damage = ramDamage(speed);
  const pushSpeed =
    dir * (SPEC.ramPushBase + Math.abs(speed) * SPEC.ramPushPerSpeed);
  const push = { x: f.x * pushSpeed, z: f.z * pushSpeed };
  const hits: RamHit[] = [];
  for (const t of targets) {
    if (isProtectedFromRam(t)) continue;
    const ahead = dot(t.offset, f) * dir;
    const side = Math.abs(dot(t.offset, right));
    if (ahead < 0 || ahead > reach || side > halfWidth) continue;
    if (t.offset.y < SPEC.ramMinDy || t.offset.y > SPEC.ramMaxDy) continue;
    const last = lastHit.get(t.id);
    if (last !== undefined && tick - last < SPEC.ramCooldown) continue;
    hits.push({ id: t.id, damage, push, pushUp: SPEC.ramPushUp });
  }
  return hits;
}
