import { asPlayerId, asVehicleId } from "../../../domain/shared/ids";
import { HEADLIGHTS_PROPERTY_NAME } from "../../../domain/vehicle/entityContract";
import type { FleetEntry } from "../../../domain/vehicle/fleet/fleet";
import { VEHICLE_KINDS, type VehicleKind } from "../../../domain/vehicle/kind";
import {
  CAMPING_GEAR_IDS,
  MONITOR_TOOL_ITEMS,
  pairHeights,
  SPORTSBOAT_EQUIPMENT_IDS,
  STAND_IN_NAMES,
  STANDING_GEAR_IDS,
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
/** The family a vehicle's minecraft:rideable lets ride besides players, for its seat fillers (ADR 0120). */
export const SEAT_FILLER_FAMILY = "yasu_ride_seat_filler";
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
/**
 * Test input messages have the form "<vehicleId>,<moveX>,<moveY>,<jump>"
 * (jump is 0 / 1). "<vehicleId>,clear" clears the input.
 */
export const TEST_INPUT_EVENT = id("test_input");
export const TEST_DECOR_EVENT = id("test_decor");
/** Server-only test tool messages use "<vehicleId>,<bare item id>,<state>" (ADR 0171). */
export const TEST_TOOL_EVENT = id("test_tool");
/** Test held-tool messages have the form "<vehicleId>,<bare item id>" or "<vehicleId>,clear" (ADR 0139). */
export const TEST_HELD_TOOL_EVENT = id("test_held_tool");

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

/** Invisible room blocks of a parked camper (ADR 0063, 0068). */
export const CAMPER_FLOOR_BLOCK = id("camper_floor");
export const CAMPER_CEILING_BLOCK = id("camper_ceiling");
export const CAMPER_WALL_BLOCK = id("camper_wall");
export const CAMPER_DOOR_BLOCK = id("camper_door");
export const CAMPER_BED_BLOCK = id("camper_bed");
export const CAMPER_SHOWER_TOILET_BLOCK = id("camper_shower_toilet");
/** An open wall cabinet door's plate in the aisle cell under the ceiling (ADR 0114). */
export const CAMPER_CABINET_DOOR_BLOCK = id("camper_cabinet_door");
/** An open fridge door's plate in its aisle cell, without collision (ADR 0123). */
export const CAMPER_FRIDGE_DOOR_BLOCK = id("camper_fridge_door");
/** The rear wall behind the open shower door, selectable so a tap on that door reaches the shower-toilet (ADR 0118). */
export const CAMPER_SHOWER_DOOR_BLOCK = id("camper_shower_door");
/** Invisible, collisionless block over an empty decor slot's furniture top (ADR 0097). */
export const CAMPER_FURNITURE_BLOCK = id("camper_furniture");
/** Custom component handling taps on camper door blocks (ADR 0068). */
export const CAMPER_DOOR_COMPONENT = id("camper_door");
/** Custom component handling taps on camper bed blocks (ADR 0092). */
export const CAMPER_BED_COMPONENT = id("camper_bed");
/** Custom component handling presses on the camper shower-toilet block (ADR 0098). */
export const CAMPER_SHOWER_TOILET_COMPONENT = id("camper_shower_toilet");
/**
 * Custom component handling presses on storage compartments and open storage doors' plates.
 * It keeps the wall cabinet's id, which the packs and saved worlds use (ADR 0114, 0121).
 */
export const CAMPER_CABINET_COMPONENT = id("camper_cabinet");
/** A camper's decor, as JSON [{ slot, item }] (ADR 0093). */
export const DECOR_PROPERTY = id("decor");
/**
 * Block states of the wall and the door: the cell side of the plate (Face), and whether
 * the door is open. The face is also the side of the shower-toilet's plate (ADR 0098).
 */
export const ROOM_FACE_STATE = id("face");
export const ROOM_OPEN_STATE = id("open");
/** Fridge door plate state: whether it gives the ceiling light whose cell it takes (ADR 0115, 0123). */
export const ROOM_LIT_STATE = id("lit");
/** Camping gear decor block state: the parked camper's yaw quarter (ADR 0093). */
export const DECOR_FACE_STATE = id("face");
/** The slot height in px, on the decor blocks and on the furniture block (ADR 0093, 0097). */
export const DECOR_HEIGHT_STATE = id("height");
/** Decor block state: where on its cell the item stands, an index in DECOR_SPOTS (ADR 0107). */
export const DECOR_SPOT_STATE = id("spot");
/** The decor block that shows a camping gear item in a parked camper (ADR 0093). */
export function decorBlockId(item: string): string {
  return id(`${item}_decor`);
}

/**
 * The block that draws both items of a shelf board or the table, `kind` "shelf" or "table"
 * (ADR 0108), or of a storage compartment, `kind` its pair kind: "cabinet" for the wall
 * cabinet and "fridge" for the fridge (ADR 0114, 0121, 0123).
 */
export function pairDecorBlockId(kind: string): string {
  return id(`${kind}_decor_pair`);
}
/**
 * The pair block's states for the item at each end. A block state holds at most 16 values
 * and an end takes 19 (empty or one of 18 standing items), so the end's code, 0 for empty
 * and 1 + its index in STANDING_GEAR_IDS, is split into `page` (code / PAIR_PAGE_SIZE) and
 * `item` (code % PAIR_PAGE_SIZE) (ADR 0108).
 */
export const PAIR_END_STATES = [
  { item: id("end0_item"), page: id("end0_page") },
  { item: id("end1_item"), page: id("end1_page") },
] as const;
export const PAIR_PAGE_SIZE = 10;

/** The pair block's states for `item` at end `end`, both 0 for an empty end (ADR 0108). */
export function pairEndStates(
  end: 0 | 1,
  item: string | undefined,
): Record<string, number> {
  const code = item === undefined ? 0 : STANDING_GEAR_IDS.indexOf(item) + 1;
  const states = PAIR_END_STATES[end];
  return {
    [states.page]: Math.floor(code / PAIR_PAGE_SIZE),
    [states.item]: code % PAIR_PAGE_SIZE,
  };
}

/**
 * The pair block's height state for `height`. BDS rejects a block whose enum state lists one
 * value ("Block State enum array must have more than 1 value"), so a pair block whose ends
 * share one height, the table's, has no height state and its permutations lift it by that
 * height; it gets no state here (ADR 0108).
 */
export function pairHeightStates(
  kind: (typeof PAIR_KINDS)[number],
  height: number,
): Record<string, number> {
  return pairHeights(kind).length > 1 ? { [DECOR_HEIGHT_STATE]: height } : {};
}

const PAIR_KINDS = ["shelf", "table", "cabinet", "fridge"] as const;

/** The furniture whose pair block `typeId` is, or undefined for any other block (ADR 0108). */
export function pairKindOfBlock(
  typeId: string,
): (typeof PAIR_KINDS)[number] | undefined {
  return PAIR_KINDS.find((kind) => pairDecorBlockId(kind) === typeId);
}

/** Whether `typeId` is a camping gear decor block or a pair block (ADR 0093, 0108). */
export function isDecorBlock(typeId: string): boolean {
  return (
    campingGearOfDecorBlock(typeId) !== undefined ||
    pairKindOfBlock(typeId) !== undefined
  );
}

/** Custom component handling taps on camper decor blocks (ADR 0093). */
export const CAMPER_DECOR_COMPONENT = id("camper_decor");

const CAMPER_ROOM_BLOCKS: ReadonlySet<string> = new Set([
  CAMPER_FLOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_WALL_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_BED_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_CABINET_DOOR_BLOCK,
  CAMPER_FRIDGE_DOOR_BLOCK,
  CAMPER_SHOWER_DOOR_BLOCK,
]);

// Room blocks without collision that a player may stand in: an open fridge door's plate
// stands in an aisle cell where a seat's rider stands up (ADR 0109, 0123).
const STANDABLE_ROOM_BLOCKS: ReadonlySet<string> = new Set([
  CAMPER_FRIDGE_DOOR_BLOCK,
]);

/** Whether a player can stand in a cell holding the room block `typeId`: it has no collision (ADR 0109, 0123). */
export function isStandableRoomBlock(typeId: string): boolean {
  return STANDABLE_ROOM_BLOCKS.has(typeId);
}

/** A block the parked camper's room lays (ADR 0068, 0092, 0097, 0098, 0114, 0118, 0123); the door step is a shared deck floor and is left out. */
export function isCamperRoomBlock(typeId: string): boolean {
  return CAMPER_ROOM_BLOCKS.has(typeId);
}

/** The item type of a camping gear id (ADR 0093). */
export function campingGearItem(gear: string): string {
  return id(gear);
}

/** The camping gear id of an item type, if it is camping gear. */
export function campingGearOfItem(
  typeId: string | undefined,
): string | undefined {
  return CAMPING_GEAR_IDS.find((gear) => campingGearItem(gear) === typeId);
}

/** The camping gear id of a decor block type, if it is one. */
export function campingGearOfDecorBlock(typeId: string): string | undefined {
  return CAMPING_GEAR_IDS.find((gear) => decorBlockId(gear) === typeId);
}
/** Action bar hints for players on foot near a vehicle (ADR 0086). */
export const hintKey = (name: string): string => `${NAMESPACE}.hint.${name}`;
