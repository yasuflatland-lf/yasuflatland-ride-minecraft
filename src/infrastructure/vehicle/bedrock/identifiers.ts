import { asPlayerId, asVehicleId } from "../../../domain/shared/ids";
import { HEADLIGHTS_PROPERTY_NAME } from "../../../domain/vehicle/entityContract";
import type { FleetEntry } from "../../../domain/vehicle/fleet/fleet";
import { VEHICLE_KINDS, type VehicleKind } from "../../../domain/vehicle/kind";
import {
  CAMPING_GEAR_IDS,
  MONITOR_TOOL_ITEMS,
  SPORTSBOAT_EQUIPMENT_IDS,
  STAND_IN_NAMES,
} from "../../../domain/vehicle/kinds/index";
import {
  PLACEMENT_GIFTS,
  type PlacementGift,
} from "../../../domain/vehicle/placement/gift";
import type { StarterKind } from "../../../domain/vehicle/placement/starter";
import type { ChaseCamera } from "../../../domain/vehicle/profile";
import type { RamMount } from "../../../domain/vehicle/ram";
import type { StandInAxis } from "../../../domain/vehicle/standIn";
import { id, NAMESPACE } from "../../shared/identifiers";

/**
 * Every ENTITY_TYPE entity must list this family in minecraft:type_family.
 * loadedVehicles and loadedFleetEntries query entities by this family and then
 * keep the known kinds, so an entity without it is never driven or counted.
 */
export const VEHICLE_FAMILY = "yasu_ride_vehicle";
export const ENTITY_TYPE: Readonly<Record<VehicleKind, string>> = Object.freeze(
  {
    suv: id("suv"),
    sportsboat: id("sportsboat"),
    camper: id("camper"),
    bulldozer: id("bulldozer"),
  },
);
export const ITEM_TYPE: Readonly<Record<VehicleKind, string>> = Object.freeze({
  suv: id("suv_item"),
  sportsboat: id("sportsboat_item"),
  camper: id("camper_item"),
  bulldozer: id("bulldozer_item"),
});
export function kindOfEntity(
  typeId: string | undefined,
): VehicleKind | undefined {
  return VEHICLE_KINDS.find((kind) => ENTITY_TYPE[kind] === typeId);
}
export function isVehicleEntity(typeId: string | undefined): boolean {
  return kindOfEntity(typeId) !== undefined;
}
export function kindOfItem(
  typeId: string | undefined,
): VehicleKind | undefined {
  return VEHICLE_KINDS.find((kind) => ITEM_TYPE[kind] === typeId);
}
export const PLAYER_TYPE = "minecraft:player";
/** Player dynamic property set after they have been given each starter kind's item (ADR 0023). The SUV keeps the original key, so nobody gets a second SUV. */
export const STARTER_RECEIVED_PROPERTY: Readonly<Record<StarterKind, string>> =
  Object.freeze({
    suv: id("starter_received"),
    bulldozer: id("bulldozer_starter_received"),
  });

/** The item of each placement gift (ADR 0093). */
export const GIFT_ITEM: Readonly<Record<PlacementGift, string>> = Object.freeze(
  {
    camping_gear_box: id("camping_gear_box"),
    sportsboat_equipment_box: id("sportsboat_equipment_box"),
  },
);

/** Player dynamic property recording who received each gift (ADR 0093). */
export const GIFT_RECEIVED_PROPERTY: Readonly<Record<PlacementGift, string>> =
  Object.freeze({
    camping_gear_box: id("camping_gear_given"),
    sportsboat_equipment_box: id("sportsboat_equipment_given"),
  });

/** The items each gift holds, in its kind's equipment order (ADR 0093, 0171). */
export const GIFT_CONTENTS: Readonly<Record<PlacementGift, readonly string[]>> =
  Object.freeze({
    camping_gear_box: Object.freeze(CAMPING_GEAR_IDS.map(id)),
    sportsboat_equipment_box: Object.freeze(SPORTSBOAT_EQUIPMENT_IDS.map(id)),
  });

/** Lang key of the lore line on every item a gift holds (ADR 0093). */
export const GIFT_LORE: Readonly<Record<PlacementGift, string>> = Object.freeze(
  {
    camping_gear_box: `${NAMESPACE}.lore.camping_gear`,
    sportsboat_equipment_box: `${NAMESPACE}.lore.sportsboat_equipment`,
  },
);

export function giftOfItem(
  typeId: string | undefined,
): PlacementGift | undefined {
  return PLACEMENT_GIFTS.find((gift) => GIFT_ITEM[gift] === typeId);
}

/** World dynamic property holding the fleet as JSON (ADR 0038). */
export const FLEET_PROPERTY = id("fleet");
/** Entity dynamic property on a vehicle placed from its item: the placing player's id (ADR 0066). */
export const OWNER_PROPERTY = id("owner");
/**
 * Entity property declared in every vehicle entity file (suv, sportsboat and
 * camper .se.json); the render controller makes the lamps glow by it.
 */
export const HEADLIGHTS_PROPERTY = id(HEADLIGHTS_PROPERTY_NAME);
/** Dynamic property on a vehicle holding the cells it put light blocks in. */
export const LIT_CELLS_PROPERTY = id("lit_cells");
export const entityPropertyId = (name: string): string => id(name);
export const entityEventId = (name: string): string => id(name);
export const entityAnimationId = (entityTypeId: string, name: string): string =>
  `animation.${NAMESPACE}.${entityTypeId.slice(NAMESPACE.length + 1)}.${name}`;
/** Invisible collision floor for held vehicles (ADR 0063). */
export const DECK_FLOOR_BLOCK = id("deck_floor");
/** Collision height in pixels, matching the floor block permutations. */
export const DECK_FLOOR_HEIGHT_STATE = id("height");
/** Dynamic property on a vehicle holding its laid floor cells as JSON (ADR 0063). */
export const DECK_CELLS_PROPERTY = id("deck_cells");
/** Auxiliary seat entity spawned on a held vehicle (ADR 0063). */
export const DECK_SEAT_TYPE = id("deck_seat");
/**
 * Invisible rider that holds a free seat below a taken one, so the engine, which seats
 * riders by their place in its rider list, puts each player in the seat they chose (ADR
 * 0120). Its entity file also lists "inanimate", so the ram query skips it.
 */
export const SEAT_FILLER_TYPE = id("seat_filler");
/** Maps the type of the entity a ram target rides to the domain's mount (ADR 0006, 0063, 0068). */
export function ramMountOf(typeId: string | undefined): RamMount | undefined {
  if (isVehicleEntity(typeId)) return "vehicle";
  if (typeId === DECK_SEAT_TYPE) return "deckSeat";
  return undefined;
}
/**
 * Family of every stand-in entity (ADR 0116). The entity files also list "inanimate", so
 * the ram query skips them.
 */
export const STAND_IN_FAMILY = "yasu_ride_stand_in";
/** The stand-in entity type named `name` whose row of boxes lies along `axis` (ADR 0116). */
export function standInType(name: string, axis: StandInAxis): string {
  return id(`${name}_${axis}`);
}
const STAND_IN_TYPES: ReadonlySet<string> = new Set(
  STAND_IN_NAMES.flatMap((name) => [
    standInType(name, "x"),
    standInType(name, "z"),
  ]),
);
/** Whether `typeId` is one of the kinds' stand-in entity types (ADR 0116). */
export function isStandInEntity(typeId: string | undefined): boolean {
  return typeId !== undefined && STAND_IN_TYPES.has(typeId);
}
/** Dynamic property on a vehicle holding its stand-in's entity id (ADR 0116). */
export const STAND_IN_PROPERTY = id("stand_in");
/** Dynamic property on a stand-in holding the id of its vehicle (ADR 0116). */
export const STAND_IN_OF_PROPERTY = id("stand_in_of");
/** Dynamic property on a vehicle holding its deck seat entity ids as JSON. */
export const DECK_SEATS_PROPERTY = id("deck_seats");
/** Dynamic property on a deck seat holding the id of its vehicle. */
export const DECK_SEAT_OF_PROPERTY = id("deck_seat_of");
/** Event and component group that shrink a deck seat's hit box to the toilet (ADR 0095). */
export const DECK_SEAT_COMPACT_EVENT = entityEventId("compact");
/** Event and component group that give a deck seat the Drive interact text (ADR 0177). */
export const DECK_SEAT_DRIVER_EVENT = entityEventId("driver");
/**
 * Test input messages have the form "<vehicleId>,<moveX>,<moveY>,<jump>"
 * (jump is 0 / 1). "<vehicleId>,clear" clears the input.
 */
export const TEST_INPUT_EVENT = id("test_input");
export const TEST_DECOR_EVENT = id("test_decor");
/** Server-only test tool messages use "<vehicleId>,<bare item id>,<state>" (ADR 0171). */
export const TEST_TOOL_EVENT = id("test_tool");
/** Test held-item messages have the form "<vehicleId>,<full namespaced item id>" or "<vehicleId>,clear" (ADR 0139, 0181). */
export const TEST_HELD_ITEM_EVENT = id("test_held_item");

/** Item routes for every kind's monitor tools (ADR 0171). */
export const MONITOR_TOOL_TYPES = MONITOR_TOOL_ITEMS.map(id);
/**
 * Camera presets for each chase camera: the vanilla preset that views the player from
 * behind, as F5 does (ADR 0028), and the pack's presets pulled back from it (ADR 0071, 0170).
 */
export const CHASE_CAMERAS: Readonly<Record<ChaseCamera, string>> =
  Object.freeze({
    near: "minecraft:third_person",
    mid: id("mid_chase"),
    far: id("far_chase"),
  });

export function fleetEntryOf(entity: {
  id: string;
  typeId: string;
  getDynamicProperty(id: string): unknown;
}): FleetEntry | undefined {
  const kind = kindOfEntity(entity.typeId);
  if (kind === undefined) return undefined;
  const owner = entity.getDynamicProperty(OWNER_PROPERTY);
  return {
    id: asVehicleId(entity.id),
    kind,
    owner:
      typeof owner === "string" && owner.length > 0
        ? asPlayerId(owner)
        : undefined,
  };
}

/** A camper's decor, as JSON [{ slot, item }] (ADR 0093). */
export const DECOR_PROPERTY = id("decor");
/** The item type of a camping gear id (ADR 0093). */
export function campingGearItem(gear: string): string {
  return id(gear);
}

/** Action bar hints for players on foot near a vehicle (ADR 0086). */
export const hintKey = (name: string): string => `${NAMESPACE}.hint.${name}`;
