// The only way to build a vehicle: every caller names the kind, so none falls back to SUV values (ADR 0055).
import type { VehicleId } from "../../shared/ids";
import type { Drive, RestoredValues } from "../drive";
import type { EntityContract } from "../entityContract";
import type { FleetLimitOf } from "../fleet/fleet";
import { VEHICLE_KINDS, type VehicleKind } from "../kind";
import type { VehicleProfile } from "../profile";
import { ramQueryRadius } from "../ramQuery";
import { farthestSeatReach } from "../seats";
import { type RiderView, Vehicle } from "../vehicle";
import { BulldozerDrive } from "./bulldozer/drive";
import { BULLDOZER_ENTITY } from "./bulldozer/entity";
import { BULLDOZER_PROFILE } from "./bulldozer/profile";
import { CamperDrive } from "./camper/drive";
import { CAMPER_ENTITY } from "./camper/entity";
import { CAMPER_PROFILE } from "./camper/profile";
import { ScooterDrive } from "./scooter/drive";
import { SCOOTER_ENTITY } from "./scooter/entity";
import { SCOOTER_PROFILE } from "./scooter/profile";
import { SportsboatDrive } from "./sportsboat/drive";
import { SPORTSBOAT_ENTITY } from "./sportsboat/entity";
import { SPORTSBOAT_PROFILE } from "./sportsboat/profile";
import { SuvDrive } from "./suv/drive";
import { SUV_ENTITY } from "./suv/entity";
import { SUV_PROFILE } from "./suv/profile";

/** @public Flight boost control for the vehicle item use case. */
export { BOOST_CONTROL } from "../boost";

export {
  asCampingGear,
  CAMPING_GEAR_IDS,
  type CampingGearId,
  STANDING_GEAR_IDS,
} from "./camper/campingGear";
export { pairHeights } from "./camper/decor";
export {
  type DecorItemId,
  type DecorPlacement,
  type DecorSlotId,
  parseDecorSlotId,
  serializeDecor,
} from "./camper/decorData";
export { DECOR_MESSAGES } from "./camper/decorMessages";
/** @public Room contracts exposed to vehicle use cases. */
export type {
  CamperRoom,
  RoomStorageHost,
  StoragePressRequest,
} from "./camper/room";
export { CAMPER_ROOM, type DrawerTarget } from "./camper/room";
export type { CamperRoomBlock, Face } from "./camper/roomBlocks";
export { CAMPER_SAVED } from "./camper/saved";
export { SeatPresses, seatSlotCell } from "./camper/seatPress";
export { COUNTER_HEIGHT, DRAWER_GEAR_IDS } from "./camper/spec";

export { SPORTSBOAT_EQUIPMENT_IDS } from "./sportsboat/equipment";

export type { RestoredValues };

interface KindDefinition {
  profile: VehicleProfile;
  entity: EntityContract;
  createDrive(yaw: number, restored: RestoredValues): Drive;
}

// Frozen, rows included, so a write cannot swap a kind's profile or drive for
// every vehicle of that kind.
export const KINDS: Readonly<Record<VehicleKind, Readonly<KindDefinition>>> =
  Object.freeze({
    scooter: Object.freeze<KindDefinition>({
      profile: SCOOTER_PROFILE,
      entity: SCOOTER_ENTITY,
      createDrive: (yaw, restored) => new ScooterDrive(yaw, restored),
    }),
    suv: Object.freeze<KindDefinition>({
      profile: SUV_PROFILE,
      entity: SUV_ENTITY,
      createDrive: (yaw, restored) => new SuvDrive(yaw, restored),
    }),
    camper: Object.freeze<KindDefinition>({
      profile: CAMPER_PROFILE,
      entity: CAMPER_ENTITY,
      createDrive: (yaw, restored) => new CamperDrive(yaw, restored),
    }),
    sportsboat: Object.freeze<KindDefinition>({
      profile: SPORTSBOAT_PROFILE,
      entity: SPORTSBOAT_ENTITY,
      createDrive: (yaw, restored) => new SportsboatDrive(yaw, restored),
    }),
    bulldozer: Object.freeze<KindDefinition>({
      profile: BULLDOZER_PROFILE,
      entity: BULLDOZER_ENTITY,
      createDrive: (yaw, restored) => new BulldozerDrive(yaw, restored),
    }),
  });

const MONITOR_TOOLS = VEHICLE_KINDS.flatMap(
  (kind) => KINDS[kind].profile.monitor?.tools ?? [],
);

export const MONITOR_TOOL_ITEMS: readonly string[] = Object.freeze([
  ...new Set(MONITOR_TOOLS.map((tool) => tool.item)),
]);

export function toolFeedback(item: string, state: string): string | undefined {
  for (const tool of MONITOR_TOOLS)
    if (
      tool.item === item &&
      tool.feedback !== undefined &&
      tool.states.includes(state)
    )
      return `${tool.feedback}_${state}`;
  return undefined;
}

export const fleetLimitOf: FleetLimitOf = (kind) =>
  KINDS[kind].profile.fleetLimit;

export const RAM_QUERY_RADIUS = ramQueryRadius(
  Object.values(KINDS).map(({ profile }) => profile),
);

/** How far any kind's deck seat can stand from its vehicle, parked seats included; every kind is included so a new kind with farther seats is covered (ADR 0063, 0095). */
export const DECK_SEAT_REACH = farthestSeatReach(
  Object.values(KINDS).flatMap(({ profile }) =>
    profile.heldSeats ? [profile.seats, profile.heldSeats] : [profile.seats],
  ),
);

/** The names of the kinds' stand-in entities (ADR 0116). */
export const STAND_IN_NAMES: readonly string[] = Object.freeze(
  Object.values(KINDS).flatMap(({ profile }) =>
    profile.standIn ? [profile.standIn.name] : [],
  ),
);

/** How far any kind's stand-in stands from its vehicle (ADR 0116). */
export const STAND_IN_REACH = Math.max(
  0,
  ...Object.values(KINDS).map(({ profile }) => profile.standIn?.ahead ?? 0),
);

export function createVehicle(
  kind: VehicleKind,
  id: VehicleId,
  yaw: number,
): Vehicle {
  return new Vehicle(id, profileOf(kind), KINDS[kind].createDrive(yaw, {}));
}

/**
 * Rebuilds a vehicle whose aggregate was lost; `restored` holds the values read
 * back: the entity properties its kind's entity contract lists in `restored`,
 * plus any values its infrastructure reader adds. The form comes from the
 * entity, so a vehicle in the air keeps flying (ADR 0021).
 */
export function rebuildVehicle(
  kind: VehicleKind,
  id: VehicleId,
  yaw: number,
  riders: readonly RiderView[],
  restored: RestoredValues,
): Vehicle {
  return Vehicle.withRidersAboard(
    id,
    profileOf(kind),
    KINDS[kind].createDrive(yaw, restored),
    riders,
    yaw,
  );
}

export function profileOf(kind: VehicleKind): VehicleProfile {
  return KINDS[kind].profile;
}

export function entityContractOf(kind: VehicleKind): EntityContract {
  return KINDS[kind].entity;
}
