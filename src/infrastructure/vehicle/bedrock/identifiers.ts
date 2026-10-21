import { asPlayerId, asVehicleId } from "../../../domain/shared/ids";
import {
  HEADLIGHTS_PROPERTY_NAME,
  paintEventName,
} from "../../../domain/vehicle/entityContract";
import type { FleetEntry } from "../../../domain/vehicle/fleet/fleet";
import { VEHICLE_KINDS, type VehicleKind } from "../../../domain/vehicle/kind";
import { CAMPING_GEAR_IDS } from "../../../domain/vehicle/kinds/index";
import { PAINTS, type Paint } from "../../../domain/vehicle/paint/paint";
import type { ChaseCamera } from "../../../domain/vehicle/profile";
import type { RamMount } from "../../../domain/vehicle/ram";
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
  },
);
export const ITEM_TYPE: Readonly<Record<VehicleKind, string>> = Object.freeze({
  suv: id("suv_item"),
  sportsboat: id("sportsboat_item"),
  camper: id("camper_item"),
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
/** Dynamic property on a player, set after they have been given their starter vehicle item (ADR 0023). */
export const STARTER_RECEIVED_PROPERTY = id("starter_received");
/** World dynamic property holding the fleet as JSON (ADR 0038). */
export const FLEET_PROPERTY = id("fleet");
/** Entity dynamic property on a vehicle placed from its item: the placing player's id (ADR 0066). */
export const OWNER_PROPERTY = id("owner");
/** Item a rider uses to switch the headlights (ADR 0020). */
export const HEADLIGHT_SWITCH_TYPE = id("headlight_switch");
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
/** Maps the type of the entity a ram target rides to the domain's mount (ADR 0006, 0063, 0068). */
export function ramMountOf(typeId: string | undefined): RamMount | undefined {
  if (isVehicleEntity(typeId)) return "vehicle";
  if (typeId === DECK_SEAT_TYPE) return "deckSeat";
  return undefined;
}
/** Dynamic property on a vehicle holding its deck seat entity ids as JSON. */
export const DECK_SEATS_PROPERTY = id("deck_seats");
/** Dynamic property on a deck seat holding the id of its vehicle. */
export const DECK_SEAT_OF_PROPERTY = id("deck_seat_of");
export const LIGHT_BLOCK = "minecraft:light_block_15";
/**
 * Test input messages have the form "<vehicleId>,<moveX>,<moveY>,<jump>"
 * (jump is 0 / 1). "<vehicleId>,clear" clears the input.
 */
export const TEST_INPUT_EVENT = id("test_input");
export const TEST_DECOR_EVENT = id("test_decor");
/**
 * Camera presets for each chase camera: the vanilla preset that views the player from
 * behind, as F5 does (ADR 0028), and the pack's preset pulled back from it (ADR 0071).
 */
export const CHASE_CAMERAS: Readonly<Record<ChaseCamera, string>> =
  Object.freeze({
    near: "minecraft:third_person",
    far: id("far_chase"),
  });

/**
 * The vanilla dye that repaints a vehicle with a paint (ADR 0031). Brown dye
 * turns it back to variant 0, which shows the kind's default paint (ADR 0076).
 */
export function dyeOf(paint: Paint): string {
  const color = paint === "khaki" ? "brown" : paint;
  return `minecraft:${color}_dye`;
}
export const PAINT_BY_DYE: Readonly<Record<string, Paint>> = Object.fromEntries(
  PAINTS.map((paint) => [dyeOf(paint), paint]),
);
/** minecraft:variant value for each paint. The render controller picks the texture by this index. */
export const PAINT_VARIANT: Readonly<Record<Paint, number>> =
  Object.fromEntries(PAINTS.map((paint, i) => [paint, i])) as Record<
    Paint,
    number
  >;
/**
 * Entity event declared in every vehicle entity file (suv, sportsboat and
 * camper .se.json) that sets the variant for a paint.
 */
export const paintEvent = (paint: Paint): string => id(paintEventName(paint));

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

export const AIR_BLOCK = "minecraft:air";
/** Invisible room blocks of a parked camper (ADR 0063, 0068). */
export const CAMPER_FLOOR_BLOCK = id("camper_floor");
export const CAMPER_CEILING_BLOCK = id("camper_ceiling");
export const CAMPER_WALL_BLOCK = id("camper_wall");
export const CAMPER_DOOR_BLOCK = id("camper_door");
export const CAMPER_BED_BLOCK = id("camper_bed");
/** Custom component handling taps on camper door blocks (ADR 0068). */
export const CAMPER_DOOR_COMPONENT = id("camper_door");
/** Custom component handling taps on camper bed blocks (ADR 0092). */
export const CAMPER_BED_COMPONENT = id("camper_bed");
/** A camper's decor, as JSON [{ slot, item }] (ADR 0093). */
export const DECOR_PROPERTY = id("decor");
/** Block states of the wall and the door: the cell side of the plate (Face), and whether the door is open. */
export const ROOM_FACE_STATE = id("face");
export const ROOM_OPEN_STATE = id("open");
/** Camping gear decor block states: the parked camper's yaw quarter and the slot height in px (ADR 0093). */
export const DECOR_FACE_STATE = id("face");
export const DECOR_HEIGHT_STATE = id("height");
/** The decor block that shows a camping gear item in a parked camper (ADR 0093). */
export function decorBlockId(item: string): string {
  return id(`${item}_decor`);
}

/** Custom component handling taps on camper decor blocks (ADR 0093). */
export const CAMPER_DECOR_COMPONENT = id("camper_decor");

const CAMPER_ROOM_BLOCKS: ReadonlySet<string> = new Set([
  CAMPER_FLOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_WALL_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_BED_BLOCK,
]);

/** A block the parked camper's room lays (ADR 0068, 0092); the door step is a shared deck floor and is left out. */
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
/** Action bar messages a drive shows its driver (ADR 0063, 0068). */
export const messageKey = (name: string): string =>
  `${NAMESPACE}.message.${name}`;
/** Action bar hints for players on foot near a vehicle (ADR 0086). */
export const hintKey = (name: string): string => `${NAMESPACE}.hint.${name}`;
