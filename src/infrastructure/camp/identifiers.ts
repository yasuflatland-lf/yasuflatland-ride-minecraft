// Camping entity and item ids (ADR 0047, 0122, 0130).
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
