import type { Vec2 } from "../shared/vec";
import type { HintZones } from "./hints";
import type { VehicleKind } from "./kind";
import type { Paint } from "./paint/paint";
import type { PlacementGift } from "./placement/gift";
import type { PlacementRule } from "./placement/placement";
import type { StandInRule } from "./standIn";

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
  /**
   * The farthest any part of the body, or a stand-in box, reaches from the center
   * across the ground, in blocks: a circle the vehicle covers at any heading. Things
   * placed beside vehicles keep out of it (ADR 0122).
   */
  readonly footprint: number;
  readonly seats: SeatLayout;
  /**
   * Seats that exist only while the vehicle is parked, as deck seats after the deck
   * seats of its own seats (x = left, z = forward). Absent = none (ADR 0095).
   */
  readonly parkedSeats?: SeatLayout;
  readonly beams: BeamPattern;
  readonly placement: PlacementRule;
  readonly chaseCamera: ChaseCamera;
  /** The paint the variant-0 slot (PAINTS[0]) shows for this kind (ADR 0076). */
  readonly defaultPaint: Paint;
  /**
   * Where players on foot get hints (ADR 0086). Absent = the kind shows no hints: the
   * SUV and the boat take hits on their whole body.
   */
  readonly hints?: HintZones;
  /**
   * A stand-in entity that takes the vehicle's hits and interactions at a spot its own
   * hitboxes cannot follow as it turns (ADR 0116). Absent = none: the SUV and the boat take
   * hits on their own boxes.
   */
  readonly standIn?: StandInRule;
  /** The gift a player gets the first time they place this kind (ADR 0093). Absent = no gift. */
  readonly placementGift?: PlacementGift;
}
