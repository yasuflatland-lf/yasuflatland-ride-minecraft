// Camping entity, item, and block ids (ADR 0047, 0122, 0130, 0131).
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
export const TENT_HITS_LEFT_HINT = "yasu_ride.hint.tent_hits";
export const TENT_OCCUPIED_HINT = "yasu_ride.hint.tent_occupied";
export const PITCH_REFUSAL_MESSAGE: Readonly<Record<PitchRefusal, string>> = {
  limit: "yasu_ride.message.tent_limit",
  vehicle: "yasu_ride.message.tent_vehicle",
  crowded: "yasu_ride.message.tent_crowded",
  blocked: "yasu_ride.message.tent_blocked",
  ground: "yasu_ride.message.tent_ground",
};
