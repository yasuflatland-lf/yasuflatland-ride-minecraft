import type { PlayerId } from "../../shared/ids";

export interface Occupancy {
  readonly occupant: PlayerId | undefined;
}

export function enter(
  occupancy: Occupancy,
  playerId: PlayerId,
): Occupancy | undefined {
  if (occupancy.occupant === playerId) return occupancy;
  return occupancy.occupant === undefined
    ? Object.freeze({ occupant: playerId })
    : undefined;
}

export function leave(occupancy: Occupancy, playerId: PlayerId): Occupancy {
  return occupancy.occupant === playerId
    ? Object.freeze({ occupant: undefined })
    : occupancy;
}
