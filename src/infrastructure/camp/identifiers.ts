// Camping entity, item, and block ids (ADR 0047, 0122, 0130, 0131, 0132, 0133, 0134).
import type { PitchRefusal } from "../../domain/camp/tent";
import { id } from "../shared/identifiers";

export const LOW_CHAIR_TYPE = id("low_chair");
export const LOW_CHAIR_ITEM = id("low_chair_item");
/** Listed in low_chair.se.json's minecraft:type_family. */
export const CHAIR_FAMILY = "yasu_ride_low_chair";
/** Lets in-game tests hit a chair without a player: the message is the chair's entity id. */
export const TEST_CHAIR_HIT_EVENT = id("test_chair_hit");
/** Action bar hint after a hit that does not take the chair back yet. */
export const HITS_LEFT_HINT = "yasu_ride.hint.low_chair_hits";

export const CAMP_TABLE_TYPE = id("camp_table");
export const CAMP_TABLE_ITEM = id("camp_table_item");
export const TABLE_HITS_LEFT_HINT = "yasu_ride.hint.camp_table_hits";

export const FIRE_PIT_TYPE = id("fire_pit");
export const FIRE_PIT_ITEM = id("fire_pit_item");
export const FIRE_PIT_COVERED_PROPERTY = id("covered");
export const DUTCH_OVEN_ON_TOP_HINT = "yasu_ride.hint.dutch_oven_on_top";
export const TEST_FIRE_PIT_COVER_EVENT = id("test_fire_pit_cover");
export const TEST_FIRE_PIT_HIT_EVENT = id("test_fire_pit_hit");
export const FIRE_PIT_LIT_PROPERTY = id("lit");
export const FIRE_PIT_HITS_LEFT_HINT = "yasu_ride.hint.fire_pit_hits";
export const TEST_FIRE_PIT_EVENT = id("test_fire_pit");

export const TENT_TYPE = id("tent");
export const TENT_ITEM = id("tent_item");
/** Listed in tent.se.json's minecraft:type_family. */
export const TENT_FAMILY = "yasu_ride_tent";
/** The synced 0..1 roll of each flap, read by tent.anim.json. */
export const TENT_FLAP_PROPERTY = Object.freeze({
  front: id("flap_front"),
  left: id("flap_left"),
  right: id("flap_right"),
  bedroom: id("flap_bedroom"),
});
/** Whether the lantern glows, read by tent.rc.json. */
export const TENT_LANTERN_PROPERTY = id("lantern");

export const TENT_WALL_BLOCK = id("tent_wall");
export const TENT_CEILING_BLOCK = id("tent_ceiling");
export const TENT_FLAP_BLOCK = id("tent_flap");
export const TENT_FLAP_COMPONENT = id("tent_flap");
/** The same state name as the camper's ROOM_OPEN_STATE; declared again because camp cannot import vehicle. */
export const TENT_OPEN_STATE = id("open");
/** The invisible 9 px bed block laid in each mattress cell of a pitched tent (ADR 0092). */
export const TENT_MATTRESS_BLOCK = id("tent_mattress");
/** The custom component on tent_mattress.block.json that sleeps the player (ADR 0092). */
export const TENT_MATTRESS_COMPONENT = id("tent_mattress");
export const TENT_LANTERN_BLOCK = id("tent_lantern");
/** Block state of tent_lantern: whether it gives the lantern's full light. */
export const TENT_LIT_STATE = id("lit");
/** Block state of tent_wall: the TentFace its plate sits on. */
export const TENT_FACE_STATE = id("face");
/** Entity dynamic property: the tent's laid cells as JSON (LaidCell<TentBlock>[]). */
export const TENT_CELLS_PROPERTY = id("tent_cells");
/** World dynamic property: the tent registry as JSON (serializeTents). */
export const TENTS_PROPERTY = id("tents");
/** Lets in-game tests hit a tent: the message is the tent's entity id. */
export const TEST_TENT_HIT_EVENT = id("test_tent_hit");
/** Lets in-game tests pitch a tent: the message is "<x> <y> <z> <yaw>", the clicked block in the overworld and the player's yaw. */
export const TEST_TENT_PITCH_EVENT = id("test_tent_pitch");
/** Lets in-game tests tap a flap without a player: the message is "<tent entity id> <flap id>". */
export const TEST_TENT_FLAP_EVENT = id("test_tent_flap");
/** Action bar hint when a flap cannot close on someone. */
export const FLAP_BLOCKED_HINT = "yasu_ride.hint.tent_flap_blocked";
/** Lets in-game tests switch a tent's lantern without a player: the message is the tent's entity id. */
export const TEST_TENT_LANTERN_EVENT = id("test_tent_lantern");
/** The camper's switch click; camp cannot import the vehicle's constant (ADR 0046). */
export const SWITCH_CLICK_SOUND = "random.click";
export const TENT_HITS_LEFT_HINT = "yasu_ride.hint.tent_hits";
export const TENT_OCCUPIED_HINT = "yasu_ride.hint.tent_occupied";
export const PITCH_REFUSAL_MESSAGE: Readonly<Record<PitchRefusal, string>> = {
  limit: "yasu_ride.message.tent_limit",
  vehicle: "yasu_ride.message.tent_vehicle",
  crowded: "yasu_ride.message.tent_crowded",
  blocked: "yasu_ride.message.tent_blocked",
  ground: "yasu_ride.message.tent_ground",
};
