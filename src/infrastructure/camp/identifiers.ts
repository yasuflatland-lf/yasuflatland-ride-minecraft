// The low chair's ids (ADR 0047, 0121).
import { id } from "../shared/identifiers";

export const LOW_CHAIR_TYPE = id("low_chair");
export const LOW_CHAIR_ITEM = id("low_chair_item");
/** Listed in low_chair.se.json's minecraft:type_family. */
export const CHAIR_FAMILY = "yasu_ride_low_chair";
/** Lets in-game tests hit a chair without a player: the message is the chair's entity id. */
export const TEST_CHAIR_HIT_EVENT = id("test_chair_hit");
/** Action bar hint after a hit that does not take the chair back yet. */
export const HITS_LEFT_HINT = "yasu_ride.hint.low_chair_hits";
