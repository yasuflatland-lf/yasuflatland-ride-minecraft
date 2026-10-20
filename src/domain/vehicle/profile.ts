import type { Vec2 } from "../shared/vec";
import type { VehicleKind } from "./kind";
import type { PlacementRule } from "./placement";

/** Body dimensions from the center, in blocks. */
export interface RamBody {
  readonly front: number;
  readonly halfWidth: number;
}

export interface SeatLayout {
  /** x = left, z = forward; index 0 is the driver. */
  readonly positions: readonly Vec2[];
}

export interface BeamPattern {
  /** Blocks ahead of the center. */
  readonly reach: readonly number[];
  /** Sideways offsets in blocks. */
  readonly lanes: readonly number[];
}

/**
 * The view riders get off the road (ADR 0028, 0071): `near` is the vanilla view from
 * behind, as F5 shows it, and `far` pulls back far enough to show a long body whole.
 */
export type ChaseCamera = "near" | "far";

export interface VehicleProfile {
  readonly kind: VehicleKind;
  /** Most vehicles of this kind one player keeps; one more removes their oldest (ADR 0066). */
  readonly fleetLimit: number;
  readonly ram: RamBody;
  readonly seats: SeatLayout;
  readonly beams: BeamPattern;
  readonly placement: PlacementRule;
  readonly chaseCamera: ChaseCamera;
}
