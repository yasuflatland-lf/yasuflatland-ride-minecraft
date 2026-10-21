import type { Medium } from "./motion";

/**
 * Values a transforming drivetrain reads (ADR 0021, 0026, 0032, 0033, 0040,
 * 0044). Each transforming kind builds one from its own spec.
 */
export interface TransformingSpec {
  /** Body height in blocks; the vehicle counts as submerged at this water depth. */
  readonly carHeight: number;
  readonly doubleTapTicks: number;
  readonly takeoffTicks: number;
  readonly takeoffClimb: number;
  readonly landingSink: number;
  readonly maxClimb: number;
  readonly flightVerticalDrag: number;
  readonly waterVerticalDrag: number;
  readonly floatDraft: number;
  readonly floatGain: number;
  readonly surfaceRise: number;
  readonly submarineStepProbeDrop: number;
  readonly maxBank: number;
  readonly bankRate: number;
  readonly bankSink: number;
  readonly gearDownHeight: number;
  readonly gearProbeOffset: number;
  /** Blocks from the center to the front edge the step probe uses (ADR 0004). */
  readonly hitboxFront: number;
  readonly air: Medium;
  readonly water: Medium;
}
