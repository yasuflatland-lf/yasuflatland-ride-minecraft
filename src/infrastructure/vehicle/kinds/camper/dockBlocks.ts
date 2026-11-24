import type { Entity } from "@minecraft/server";
import {
  type DecorItemId,
  isDecorItem,
} from "../../../../domain/vehicle/dock/decor";
import type { DockBlock, Face } from "../../../../domain/vehicle/dock/floor";
import { STANDING_GEAR_IDS } from "../../../../domain/vehicle/kinds/index";
import { type CellCodec, savedLaidCells } from "../../../shared/laidCells";
import { type DockBlockCodecs, dockBlock } from "../../bedrock/dockLayer";
import {
  CAMPER_BED_BLOCK,
  CAMPER_BUNK_BLOCK,
  CAMPER_CABINET_DOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FRIDGE_DOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_DOOR_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_WALL_BLOCK,
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  DECOR_SPOT_STATE,
  decorBlockId,
  drawerBlockStates,
  pairDecorBlockId,
  pairEndStates,
  pairHeightStates,
  ROOM_FACE_STATE,
  ROOM_LIT_STATE,
  ROOM_OPEN_STATE,
} from "./identifiers";

// The decor and furniture blocks define one yasu_ride:height state per pixel (ADR 0093, 0097).
const MIN_DECOR_HEIGHT = 0;
const MAX_DECOR_HEIGHT = 15;
// Decor blocks use spots 0 to 4 and 9 to 10; legacy spots 5 to 8 must also be read
// so a lay clears blocks saved by an early build of ADR 0108.
const MAX_DECOR_SPOT = 10;

function isDecorHeight(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MIN_DECOR_HEIGHT &&
    v <= MAX_DECOR_HEIGHT
  );
}

function isDecorSpot(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= 0 &&
    v <= MAX_DECOR_SPOT
  );
}

function isPairEnd(v: unknown): v is DecorItemId | undefined {
  return (
    v === undefined ||
    (typeof v === "string" && isDecorItem(v) && STANDING_GEAR_IDS.includes(v))
  );
}

function isFace(v: unknown): v is Face {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3;
}

// Decor cells saved before the spot state stood in the cell middle, spot 0 (ADR 0107).
function upgradeSpotlessDecor(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("block" in value))
    return value;
  const { block } = value;
  if (
    typeof block !== "object" ||
    block === null ||
    !("type" in block) ||
    block.type !== "decor" ||
    "spot" in block
  )
    return value;
  return { ...value, block: { ...block, spot: 0 } };
}

export const CAMPER_ROOM_CODEC = {
  floor: dockBlock({ id: CAMPER_FLOOR_BLOCK }),
  ceiling: dockBlock({ id: CAMPER_CEILING_BLOCK }),
  bed: dockBlock({ id: CAMPER_BED_BLOCK }),
  bunk: dockBlock({ id: CAMPER_BUNK_BLOCK }),
  wall: facePlate(CAMPER_WALL_BLOCK),
  showerToilet: facePlate(CAMPER_SHOWER_TOILET_BLOCK),
  cabinetDoor: facePlate(CAMPER_CABINET_DOOR_BLOCK),
  showerDoor: facePlate(CAMPER_SHOWER_DOOR_BLOCK),
  door: dockBlock({
    id: CAMPER_DOOR_BLOCK,
    isBlock: (b) => isFace(b.face) && typeof b.open === "boolean",
    states: (b) => ({ [ROOM_FACE_STATE]: b.face, [ROOM_OPEN_STATE]: b.open }),
  }),
  fridgeDoor: dockBlock({
    id: CAMPER_FRIDGE_DOOR_BLOCK,
    isBlock: (b) => isFace(b.face) && typeof b.lit === "boolean",
    states: (b) => ({ [ROOM_FACE_STATE]: b.face, [ROOM_LIT_STATE]: b.lit }),
  }),
  furniture: dockBlock({
    id: CAMPER_FURNITURE_BLOCK,
    isBlock: (b) => isDecorHeight(b.height),
    states: (b) => ({ [DECOR_HEIGHT_STATE]: b.height }),
  }),
  drawers: dockBlock({
    id: pairDecorBlockId("drawers"),
    isBlock: (b) =>
      isFace(b.face) &&
      typeof b.height === "number" &&
      Number.isFinite(b.height) &&
      b.height >= 0 &&
      b.height <= MAX_DECOR_HEIGHT &&
      isPairEnd(b.counter),
    states: drawerBlockStates,
  }),
  fridge: dockBlock({
    id: pairDecorBlockId("fridge"),
    isBlock: (b) =>
      isFace(b.face) &&
      isDecorHeight(b.height) &&
      typeof b.open === "boolean" &&
      isPairEnd(b.end0) &&
      isPairEnd(b.end1),
    states: (b) => ({
      [DECOR_FACE_STATE]: b.face,
      ...pairHeightStates("fridge", b.height),
      [ROOM_OPEN_STATE]: b.open,
      ...pairEndStates(0, b.end0),
      ...pairEndStates(1, b.end1),
    }),
  }),
  cabinet: dockBlock({
    id: pairDecorBlockId("cabinet"),
    isBlock: (b) =>
      isFace(b.face) &&
      typeof b.open === "boolean" &&
      isPairEnd(b.end0) &&
      isPairEnd(b.end1),
    states: (b) => ({
      [DECOR_FACE_STATE]: b.face,
      [ROOM_OPEN_STATE]: b.open,
      ...pairEndStates(0, b.end0),
      ...pairEndStates(1, b.end1),
    }),
  }),
  decor: dockBlock({
    id: (b) => decorBlockId(b.item),
    isBlock: (b) =>
      typeof b.item === "string" &&
      isDecorItem(b.item) &&
      isFace(b.face) &&
      isDecorHeight(b.height) &&
      isDecorSpot(b.spot),
    states: (b) => ({
      [DECOR_FACE_STATE]: b.face,
      [DECOR_HEIGHT_STATE]: b.height,
      [DECOR_SPOT_STATE]: b.spot,
    }),
    upgrade: upgradeSpotlessDecor,
  }),
  decorPair: dockBlock({
    id: (b) => pairDecorBlockId(b.pair),
    isBlock: (b) =>
      (b.pair === "shelf" || b.pair === "table") &&
      isFace(b.face) &&
      isDecorHeight(b.height) &&
      isPairEnd(b.end0) &&
      isPairEnd(b.end1) &&
      (b.end0 !== undefined || b.end1 !== undefined),
    states: (b) => ({
      [DECOR_FACE_STATE]: b.face,
      ...pairHeightStates(b.pair, b.height),
      ...pairEndStates(0, b.end0),
      ...pairEndStates(1, b.end1),
    }),
  }),
} satisfies Partial<DockBlockCodecs>;

function facePlate(id: string) {
  return dockBlock<Extract<DockBlock, { face: Face }>>({
    id,
    isBlock: (b) => isFace(b.face),
    states: (b) => ({ [ROOM_FACE_STATE]: b.face }),
  });
}

/** State derived from the cells actually laid, with one saved-property read per rebuild. */
export function savedDock(
  vehicle: Entity,
  codec: CellCodec<DockBlock>,
): {
  laid: boolean;
  doorOpen: boolean | undefined;
} {
  const cells = savedLaidCells(vehicle, codec);
  const door = cells.find((c) => c.block.type === "door");
  return {
    laid: cells.length > 0,
    doorOpen: door?.block.type === "door" ? door.block.open : undefined,
  };
}
