// Camping entity, item, and block ids (ADR 0047, 0122, 0130, 0131, 0132, 0133, 0134).
import type { TableTopRefusal } from "../../application/camp/placeOnTableTop";
import type { ChairKindId } from "../../domain/camp/chair";
import type { PitchRefusal } from "../../domain/camp/tent";
import { id } from "../shared/identifiers";

/** The ids that tell one chair kind from another; the rules are shared (ADR 0122). */
export interface ChairProfile {
  readonly typeId: string;
  readonly itemId: string;
  /** Listed in the chair's minecraft:type_family. */
  readonly family: string;
  /** Action bar hint after a hit that does not take the chair back yet. */
  readonly hitsHint: string;
  /** Lets in-game tests hit a chair without a player: the message is the chair's entity id. */
  readonly testHitEvent: string;
}

export const CHAIR_KINDS: Readonly<Record<ChairKindId, ChairProfile>> = {
  noga_chair: {
    typeId: id("noga_chair"),
    itemId: id("noga_chair_item"),
    family: "yasu_ride_noga_chair",
    hitsHint: "yasu_ride.hint.noga_chair_hits",
    testHitEvent: "yasu_ride_test:test_noga_chair_hit",
  },
  low_chair: {
    typeId: id("low_chair"),
    itemId: id("low_chair_item"),
    family: "yasu_ride_low_chair",
    hitsHint: "yasu_ride.hint.low_chair_hits",
    testHitEvent: id("test_chair_hit"),
  },
};

function chairKindsBy(
  field: "typeId" | "itemId" | "testHitEvent",
): ReadonlyMap<string, ChairKindId> {
  return new Map(
    (Object.keys(CHAIR_KINDS) as ChairKindId[]).map((kind) => [
      CHAIR_KINDS[kind][field],
      kind,
    ]),
  );
}

export const CHAIR_KIND_BY_TYPE = chairKindsBy("typeId");
export const CHAIR_KIND_BY_ITEM = chairKindsBy("itemId");
export const CHAIR_KIND_BY_TEST_EVENT = chairKindsBy("testHitEvent");

export const LOW_CHAIR_TYPE = CHAIR_KINDS.low_chair.typeId;
export const LOW_CHAIR_ITEM = CHAIR_KINDS.low_chair.itemId;
export const CHAIR_FAMILY = CHAIR_KINDS.low_chair.family;
export const TEST_CHAIR_HIT_EVENT = CHAIR_KINDS.low_chair.testHitEvent;
export const HITS_LEFT_HINT = CHAIR_KINDS.low_chair.hitsHint;

export const CAMP_TABLE_TYPE = id("camp_table");
export const CAMP_TABLE_ITEM = id("camp_table_item");
export const TEST_TABLE_HIT_EVENT = "yasu_ride_test:test_table_hit";
/**
 * Server test hook: the message is the table entity id followed by an old spot
 * index 0 or 1, or by a local point `<x> <z>` in model pixels.
 */
export const TEST_DUTCH_OVEN_ON_TABLE_EVENT =
  "yasu_ride_test:test_dutch_oven_on_table";
export const TABLE_HITS_LEFT_HINT = "yasu_ride.hint.camp_table_hits";
/** Action bar hint for each refusal of the table top rule (ADR 0185). */
export const TABLE_TOP_REFUSAL_HINTS: Readonly<
  Record<TableTopRefusal, string>
> = {
  full: "yasu_ride.hint.camp_table_full",
  overlap: "yasu_ride.hint.camp_table_overlap",
  tooBig: "yasu_ride.hint.camp_table_too_big",
};

export const DUTCH_OVEN_HOST_PROPERTY = id("host");
export const DUTCH_OVEN_HOSTED_EVENT = id("oven_hosted");
export const DUTCH_OVEN_GROUND_EVENT = id("oven_ground");
/** Server test hook: the message is the pit entity id; no player or item is needed. */
export const TEST_DUTCH_OVEN_ON_PIT_EVENT =
  "yasu_ride_test:test_dutch_oven_on_pit";
/**
 * Server test hook: the message is an oven entity id and a host marker. Dynamic
 * properties belong to the pack that wrote them, so the test pack cannot write
 * the marker itself.
 */
export const TEST_DUTCH_OVEN_HOST_EVENT = "yasu_ride_test:test_dutch_oven_host";
export const DUTCH_OVEN_TYPE = id("dutch_oven");
export const DUTCH_OVEN_ITEM = id("dutch_oven_item");
export const DUTCH_OVEN_SIMMERING_PROPERTY = id("simmering");
export const DUTCH_OVEN_HITS_LEFT_HINT = "yasu_ride.hint.dutch_oven_hits";
export const TEST_DUTCH_OVEN_SIMMER_EVENT = id("test_dutch_oven_simmer");
export const TEST_DUTCH_OVEN_HIT_EVENT = id("test_dutch_oven_hit");

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

export const GAS_LANTERN_TYPE = id("gas_lantern");
export const GAS_LANTERN_ITEM = id("gas_lantern_item");
export const GAS_LANTERN_CELLS_PROPERTY = id("gas_lantern_cells");
export const TEST_GAS_LANTERN_EVENT = id("test_gas_lantern");
export const GAS_LANTERN_LIT_PROPERTY = id("lit");
export const GAS_LANTERN_HITS_LEFT_HINT = "yasu_ride.hint.gas_lantern_hits";
export const TEST_GAS_LANTERN_HIT_EVENT = id("test_gas_lantern_hit");
