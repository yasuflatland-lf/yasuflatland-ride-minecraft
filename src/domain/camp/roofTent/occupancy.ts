import { type Cell, cellOf } from "../../shared/cells";
import type { PlayerId } from "../../shared/ids";
import { forward, type Vec3 } from "../../shared/vec";
import { ROOF_TENT_SPEC } from "../spec";

export interface Occupancy {
  readonly occupant: PlayerId | undefined;
}

export interface RoofTentState extends Occupancy {
  readonly exit: Cell;
  /** Players whose spawn point this tent set, without duplicates (ADR 0231). */
  readonly spawnSetters: readonly PlayerId[];
}

export function roofTentState(init: {
  occupant?: PlayerId;
  exit: Cell;
  spawnSetters?: readonly PlayerId[];
}): RoofTentState {
  return Object.freeze({
    occupant: init.occupant,
    exit: Object.freeze({ ...init.exit }),
    spawnSetters: Object.freeze([...new Set(init.spawnSetters)]),
  });
}

export function withOccupant(
  state: RoofTentState,
  occupant: PlayerId | undefined,
): RoofTentState {
  return Object.freeze({ ...state, occupant });
}

export function withSpawnSetter(
  state: RoofTentState,
  player: PlayerId,
): RoofTentState {
  return state.spawnSetters.includes(player)
    ? state
    : Object.freeze({
        ...state,
        spawnSetters: Object.freeze([...state.spawnSetters, player]),
      });
}

export function withoutSpawnSetters(state: RoofTentState): RoofTentState {
  return Object.freeze({ ...state, spawnSetters: Object.freeze([]) });
}

/** The cell one fallback distance in front of the tent, at its floored height. */
export function fallbackExit(location: Vec3, yaw: number): Cell {
  const direction = forward(yaw);
  const distance = ROOF_TENT_SPEC.exitFallbackDistance;
  return cellOf({
    x: location.x + direction.x * distance,
    y: location.y,
    z: location.z + direction.z * distance,
  });
}

/** A present host's entrance wins, then a valid saved exit, then the fallback. */
export function chooseExit(exits: {
  host?: Cell;
  saved?: Cell;
  fallback: Cell;
}): Cell {
  return exits.host ?? exits.saved ?? exits.fallback;
}

/** An older pack may have written a newer sleeper to the legacy key. */
export function mergeSpawnSetters(
  stored: readonly PlayerId[],
  legacy: PlayerId | undefined,
): readonly PlayerId[] {
  return [...new Set(legacy === undefined ? stored : [...stored, legacy])];
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
