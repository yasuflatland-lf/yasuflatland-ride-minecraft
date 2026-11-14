import {
  type DecorItemId,
  isDecorItem,
} from "../../../../domain/vehicle/dock/decor";
import type { DockBlock } from "../../../../domain/vehicle/dock/floor";
import {
  CAMPING_GEAR_IDS,
  pairHeights,
  STANDING_GEAR_IDS,
} from "../../../../domain/vehicle/kinds/index";
import { id } from "../../../shared/identifiers";
import { campingGearItem } from "../../bedrock/identifiers";

/** Invisible room blocks of a parked camper (ADR 0063, 0068). */
export const CAMPER_FLOOR_BLOCK = id("camper_floor");
export const CAMPER_CEILING_BLOCK = id("camper_ceiling");
export const CAMPER_WALL_BLOCK = id("camper_wall");
export const CAMPER_DOOR_BLOCK = id("camper_door");
export const CAMPER_BED_BLOCK = id("camper_bed");
/** The upper bunk's block: no collision, reuses the bed component (ADR 0182). */
export const CAMPER_BUNK_BLOCK = id("camper_bunk");
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
 * and an end takes 17 (empty or one of 16 standing items), so the end's code, 0 for empty
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

const PAIR_KINDS = ["shelf", "table", "cabinet", "fridge", "drawers"] as const;

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
  CAMPER_BUNK_BLOCK,
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

/** The camping gear id of an item type, if it is camping gear. */
export function campingGearOfItem(
  typeId: string | undefined,
): DecorItemId | undefined {
  const item = CAMPING_GEAR_IDS.find(
    (gear) => campingGearItem(gear) === typeId,
  );
  return item !== undefined && isDecorItem(item) ? item : undefined;
}

/** The camping gear id of a decor block type, if it is one. */
export function campingGearOfDecorBlock(typeId: string): string | undefined {
  return CAMPING_GEAR_IDS.find((gear) => decorBlockId(gear) === typeId);
}

/** Drawer contents render on the entity; the block carries only counter decor (ADR 0121). */
export function drawerBlockStates(
  block: Extract<DockBlock, { type: "drawers" }>,
): Record<string, number | boolean> {
  const counter =
    block.counter === undefined
      ? 0
      : STANDING_GEAR_IDS.indexOf(block.counter) + 1;
  return {
    [DECOR_FACE_STATE]: block.face,
    [id("counter_page")]: Math.floor(counter / PAIR_PAGE_SIZE),
    [id("counter_item")]: counter % PAIR_PAGE_SIZE,
  };
}
