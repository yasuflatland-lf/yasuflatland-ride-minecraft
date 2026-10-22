// The engine reports PlayerInteractWithBlockBeforeEvent.faceLocation.y as 1 minus the real
// height within the block, while x and z are right (measured on the dev BDS, ADR 0111).
// Every correction of that report lives here, so it can be removed if the engine changes.
import { pairHeights } from "../../../domain/vehicle/kinds/index";
import {
  CAMPER_BED_BLOCK,
  CAMPER_CABINET_DOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_DOOR_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  campingGearOfDecorBlock,
  pairKindOfBlock,
} from "./identifiers";

const PX_PER_BLOCK = 16;

/**
 * What the corrected height can rely on about a pressed block: a room block's selection
 * box bottom and top within its cell, or a decor block's lift, the slot height its
 * transformation raises the item by. Undefined for any other block.
 */
export type PressedShape =
  | { readonly kind: "room"; readonly bottom: number; readonly top: number }
  | { readonly kind: "decor"; readonly lift: number }
  | undefined;

const FULL = { kind: "room", bottom: 0, top: 1 } as const;
// A wall cabinet compartment's box rises this far above the lift its transformation adds:
// from the compartment floor to the top of the door (ADR 0114).
const CABINET_BOX_PX = 10;

// Selection boxes of the room blocks in packs/yasu_ride_bp/blocks/yasu_ride; the wall
// has none, so it is never pressed. tests/infrastructure/vehicle/bedrock/faceHeight.test.ts
// checks these against the block files.
const ROOM_BOXES: Readonly<Record<string, PressedShape>> = {
  [CAMPER_FLOOR_BLOCK]: FULL,
  [CAMPER_DOOR_BLOCK]: FULL,
  [CAMPER_SHOWER_TOILET_BLOCK]: FULL,
  [CAMPER_SHOWER_DOOR_BLOCK]: FULL,
  [CAMPER_BED_BLOCK]: { kind: "room", bottom: 0, top: 9 / PX_PER_BLOCK },
  [CAMPER_CEILING_BLOCK]: { kind: "room", bottom: 13 / PX_PER_BLOCK, top: 1 },
  [CAMPER_CABINET_DOOR_BLOCK]: {
    kind: "room",
    bottom: 2 / PX_PER_BLOCK,
    top: 13 / PX_PER_BLOCK,
  },
};

/**
 * The shape of a pressed block of type `typeId` whose height state is `height` (px).
 * The furniture block fills its cell up to the furniture top, except at height 0, the
 * box hanging under the ceiling hook from 6 px up (ADR 0097, 0102).
 */
export function pressedShape(
  typeId: string,
  height: number | undefined,
): PressedShape {
  if (typeId === CAMPER_FURNITURE_BLOCK) {
    if (height === undefined) return undefined;
    if (height === 0) return { kind: "room", bottom: 6 / PX_PER_BLOCK, top: 1 };
    return { kind: "room", bottom: 0, top: height / PX_PER_BLOCK };
  }
  if (campingGearOfDecorBlock(typeId) !== undefined)
    return { kind: "decor", lift: (height ?? 0) / PX_PER_BLOCK };
  // A pair block is lifted like a decor block. The table's has no height state, since its
  // one height cannot be a state, and its permutations lift it by that height (ADR 0108).
  const pair = pairKindOfBlock(typeId);
  // A cabinet compartment's box is a room box lifted with its one height (ADR 0114).
  if (pair === "cabinet") {
    const lift = Math.min(...pairHeights(pair));
    return {
      kind: "room",
      bottom: lift / PX_PER_BLOCK,
      top: (lift + CABINET_BOX_PX) / PX_PER_BLOCK,
    };
  }
  if (pair !== undefined)
    return {
      kind: "decor",
      lift: (height ?? Math.min(...pairHeights(pair))) / PX_PER_BLOCK,
    };
  return ROOM_BOXES[typeId];
}

/**
 * The real height within the block of a press reported at `reportedY` on face `face`
 * (a Direction name). An Up or Down face of a room block is its box's top or bottom,
 * whatever was reported. The Up face of a decor block reports 1 minus its untransformed
 * box top, so the lift is added back. Every other press is 1 minus the reported y (ADR 0111).
 */
export function pressedHeight(
  face: string,
  reportedY: number,
  shape: PressedShape,
): number {
  const flipped = 1 - reportedY;
  if (face === "Up") {
    if (shape?.kind === "room") return shape.top;
    if (shape?.kind === "decor") return shape.lift + flipped;
  }
  if (face === "Down" && shape?.kind === "room") return shape.bottom;
  return flipped;
}
