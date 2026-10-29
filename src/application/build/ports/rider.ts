import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export interface RiderGate {
  /** Whether the player rides a yasu_ride:bulldozer (ADR 0178, Decision 4). */
  ridesBulldozer(playerId: PlayerId): boolean;
  /** The ridden bulldozer's feet cell (floor of its location) and dimension; undefined when not riding one. */
  bulldozerFeet(
    playerId: PlayerId,
  ): { dimensionId: DimensionId; cell: Cell } | undefined;
}
