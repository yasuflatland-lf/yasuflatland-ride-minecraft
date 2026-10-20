// Banking into turns in flight, like an airplane (ADR 0026), and under water (ADR 0044).
import { approach, clamp } from "../../shared/vec";
import type { Form } from "./forms";
import type { TransformingSpec } from "./transforming";
import { turnFraction } from "./turn";

/**
 * Next bank angle in degrees; positive lowers the right side. In flight and
 * under water the target follows how fast the heading turns, so a turn at the
 * full `turnRate` banks fully whatever the speed or direction of travel. In
 * every other form the target is level. The angle moves toward the target by at most
 * `spec.bankRate` per tick.
 */
export function stepBank(
  prev: number,
  form: Form,
  yawBefore: number,
  yawAfter: number,
  turnRate: number,
  spec: Pick<TransformingSpec, "maxBank" | "bankRate">,
): number {
  const turn = turnFraction(yawBefore, yawAfter, turnRate);
  const target =
    (form === "hover" || form === "submarine") && turn !== undefined
      ? clamp(turn, -1, 1) * spec.maxBank
      : 0;
  return approach(prev, target, spec.bankRate);
}

/** Altitude lost per tick while flying banked, in proportion to the bank angle. */
export function bankSink(
  form: Form,
  bank: number,
  spec: Pick<TransformingSpec, "maxBank" | "bankSink">,
): number {
  if (form !== "hover") return 0;
  return (Math.abs(bank) / spec.maxBank) * spec.bankSink;
}
