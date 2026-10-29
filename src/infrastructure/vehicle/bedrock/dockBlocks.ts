// Persistent blocks that held vehicles lay: decks, and a parked camper's room (ADR 0063, 0068).
import { BlockPermutation, type Entity } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { cellKey } from "../../../domain/shared/cells";
import {
  asDimensionId,
  type DimensionId,
  type VehicleId,
} from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { isDecorItem } from "../../../domain/vehicle/dock/decor";
import {
  type DockBlock,
  type DockCell,
  type Face,
  sameBlock,
} from "../../../domain/vehicle/dock/floor";
import { STANDING_GEAR_IDS } from "../../../domain/vehicle/kinds/index";
import {
  type CellCodec,
  CellLayer,
  savedLaidCells,
} from "../../shared/laidCells";
import { LIGHT_BLOCK } from "../../shared/lightBlocks";
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
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  DECOR_SPOT_STATE,
  decorBlockId,
  pairDecorBlockId,
  pairEndStates,
  pairHeightStates,
  ROOM_FACE_STATE,
  ROOM_LIT_STATE,
  ROOM_OPEN_STATE,
} from "./identifiers";

// The block defines one collision permutation per pixel height (ADR 0063).
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 16;
// The decor and furniture blocks define one yasu_ride:height state per pixel (ADR 0093, 0097).
const MIN_DECOR_HEIGHT = 0;
const MAX_DECOR_HEIGHT = 15;
// The decor blocks define yasu_ride:spot 0 to 4 (ADR 0107, 0112). An early build of ADR 0108 laid
// spots up to 8; those saved cells are still read, so a lay clears their blocks.
const MAX_DECOR_SPOT = 8;
// Reading a laid cell costs one getBlock call, and a parked camper lays about 107
// to 121 cells, so the cells are read once a second per vehicle, not every tick (ADR 0096).
export const DOCK_RECHECK_TICKS = 20;

function isHeight(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MIN_HEIGHT &&
    v <= MAX_HEIGHT
  );
}

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

function isPairEnd(v: unknown): boolean {
  return (
    v === undefined || (typeof v === "string" && STANDING_GEAR_IDS.includes(v))
  );
}

function isFace(v: unknown): v is Face {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3;
}

function isDockCell(v: unknown): v is DockCell {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  if (
    ![c.x, c.y, c.z].every(Number.isInteger) ||
    typeof c.block !== "object" ||
    c.block === null
  )
    return false;
  const b = c.block as Record<string, unknown>;
  switch (b.type) {
    case "deck":
      return isHeight(b.height);
    case "floor":
    case "ceiling":
    case "bed":
    case "bunk":
    case "light":
      return true;
    case "furniture":
      return isDecorHeight(b.height);
    case "wall":
      return isFace(b.face);
    case "door":
      return isFace(b.face) && typeof b.open === "boolean";
    case "showerToilet":
    case "cabinetDoor":
    case "showerDoor":
      return isFace(b.face);
    case "fridgeDoor":
      return isFace(b.face) && typeof b.lit === "boolean";
    case "fridge":
      return (
        isFace(b.face) &&
        isDecorHeight(b.height) &&
        typeof b.open === "boolean" &&
        isPairEnd(b.end0) &&
        isPairEnd(b.end1)
      );
    case "cabinet":
      return (
        isFace(b.face) &&
        typeof b.open === "boolean" &&
        isPairEnd(b.end0) &&
        isPairEnd(b.end1)
      );
    case "decor":
      return (
        typeof b.item === "string" &&
        isDecorItem(b.item) &&
        isFace(b.face) &&
        isDecorHeight(b.height) &&
        isDecorSpot(b.spot)
      );
    case "decorPair":
      return (
        (b.pair === "shelf" || b.pair === "table") &&
        isFace(b.face) &&
        isDecorHeight(b.height) &&
        isPairEnd(b.end0) &&
        isPairEnd(b.end1) &&
        (b.end0 !== undefined || b.end1 !== undefined)
      );
    default:
      return false;
  }
}

function blockIdOf(block: DockBlock): string {
  switch (block.type) {
    case "deck":
      return DECK_FLOOR_BLOCK;
    case "floor":
      return CAMPER_FLOOR_BLOCK;
    case "ceiling":
      return CAMPER_CEILING_BLOCK;
    case "wall":
      return CAMPER_WALL_BLOCK;
    case "door":
      return CAMPER_DOOR_BLOCK;
    case "bed":
      return CAMPER_BED_BLOCK;
    case "bunk":
      return CAMPER_BUNK_BLOCK;
    case "light":
      return LIGHT_BLOCK;
    case "showerToilet":
      return CAMPER_SHOWER_TOILET_BLOCK;
    case "cabinetDoor":
      return CAMPER_CABINET_DOOR_BLOCK;
    case "showerDoor":
      return CAMPER_SHOWER_DOOR_BLOCK;
    case "fridgeDoor":
      return CAMPER_FRIDGE_DOOR_BLOCK;
    case "cabinet":
      return pairDecorBlockId("cabinet");
    case "fridge":
      return pairDecorBlockId("fridge");
    case "furniture":
      return CAMPER_FURNITURE_BLOCK;
    case "decor":
      return decorBlockId(block.item);
    case "decorPair":
      return pairDecorBlockId(block.pair);
  }
}

function permutationOf(block: DockBlock): BlockPermutation {
  switch (block.type) {
    case "deck":
      return BlockPermutation.resolve(DECK_FLOOR_BLOCK, {
        [DECK_FLOOR_HEIGHT_STATE]: block.height,
      });
    case "wall":
      return BlockPermutation.resolve(CAMPER_WALL_BLOCK, {
        [ROOM_FACE_STATE]: block.face,
      });
    case "door":
      return BlockPermutation.resolve(CAMPER_DOOR_BLOCK, {
        [ROOM_FACE_STATE]: block.face,
        [ROOM_OPEN_STATE]: block.open,
      });
    case "showerToilet":
      return BlockPermutation.resolve(CAMPER_SHOWER_TOILET_BLOCK, {
        [ROOM_FACE_STATE]: block.face,
      });
    case "cabinetDoor":
      return BlockPermutation.resolve(CAMPER_CABINET_DOOR_BLOCK, {
        [ROOM_FACE_STATE]: block.face,
      });
    case "showerDoor":
      return BlockPermutation.resolve(CAMPER_SHOWER_DOOR_BLOCK, {
        [ROOM_FACE_STATE]: block.face,
      });
    case "fridgeDoor":
      return BlockPermutation.resolve(CAMPER_FRIDGE_DOOR_BLOCK, {
        [ROOM_FACE_STATE]: block.face,
        [ROOM_LIT_STATE]: block.lit,
      });
    case "fridge":
      return BlockPermutation.resolve(pairDecorBlockId("fridge"), {
        [DECOR_FACE_STATE]: block.face,
        ...pairHeightStates("fridge", block.height),
        [ROOM_OPEN_STATE]: block.open,
        ...pairEndStates(0, block.end0),
        ...pairEndStates(1, block.end1),
      });
    case "cabinet":
      return BlockPermutation.resolve(pairDecorBlockId("cabinet"), {
        [DECOR_FACE_STATE]: block.face,
        [ROOM_OPEN_STATE]: block.open,
        ...pairEndStates(0, block.end0),
        ...pairEndStates(1, block.end1),
      });
    case "furniture":
      return BlockPermutation.resolve(CAMPER_FURNITURE_BLOCK, {
        [DECOR_HEIGHT_STATE]: block.height,
      });
    case "decor":
      return BlockPermutation.resolve(decorBlockId(block.item), {
        [DECOR_FACE_STATE]: block.face,
        [DECOR_HEIGHT_STATE]: block.height,
        [DECOR_SPOT_STATE]: block.spot,
      });
    case "decorPair":
      return BlockPermutation.resolve(pairDecorBlockId(block.pair), {
        [DECOR_FACE_STATE]: block.face,
        ...pairHeightStates(block.pair, block.height),
        ...pairEndStates(0, block.end0),
        ...pairEndStates(1, block.end1),
      });
    default:
      return BlockPermutation.resolve(blockIdOf(block));
  }
}

// Boats saved height-only cells before typed docks; restore them as decks
// so a reload or restart can still clear their blocks (ADR 0063).
function upgradeHeightOnlyCell(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    !("block" in value) &&
    "height" in value &&
    isHeight(value.height)
  ) {
    const { height, ...cell } = value;
    return { ...cell, block: { type: "deck", height } };
  }
  return value;
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

const DOCK_CODEC: CellCodec<DockBlock> = {
  property: DECK_CELLS_PROPERTY,
  // Order matters: a height-only boat cell becomes a deck first (ADR 0063), then a spotless decor gets spot 0 (ADR 0107).
  upgrade: (saved) => upgradeSpotlessDecor(upgradeHeightOnlyCell(saved)),
  isCell: isDockCell,
  same: sameBlock,
  blockIdOf,
  permutationOf,
};

/** State derived from the cells actually laid, with one saved-property read per rebuild. */
export function savedDock(vehicle: Entity): {
  laid: boolean;
  doorOpen: boolean | undefined;
} {
  const cells = savedLaidCells(vehicle, DOCK_CODEC);
  const door = cells.find((c) => c.block.type === "door");
  return {
    laid: cells.length > 0,
    doorOpen: door?.block.type === "door" ? door.block.open : undefined,
  };
}

export class DockBlocks {
  private readonly layer = new CellLayer<VehicleId, DockBlock>(
    DOCK_CODEC,
    DOCK_RECHECK_TICKS,
  );

  constructor(private readonly campSpace: SpaceCheck) {}

  /** The vehicle whose laid door is at this cell, if any. */
  doorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.layer.ownerOf(
      dimensionId,
      cell,
      (block) => block.type === "door",
    );
  }

  /** The vehicle that laid any dock block at this cell, if any (ADR 0093). */
  cellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.layer.ownerOf(dimensionId, cell);
  }

  /** The vehicle that laid this cell, while the world still holds the block it laid there (ADR 0096). */
  laidBlockOwner(
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ): VehicleId | undefined {
    return this.layer.laidBlockOwner(dimensionId, cell, typeId);
  }

  lay(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    wanted: readonly DockCell[],
  ): void {
    const cells = vehicle
      ? this.outsideCamp(vehicleId, vehicle, wanted)
      : wanted;
    this.layer.lay(vehicleId, vehicle, cells);
  }

  /**
   * A camp cell belongs to the other feature; a light there is its spawn guard,
   * not air. Cells this vehicle already holds, saved ones included, stay laid
   * (ADR 0115, 0129). Camp is asked first because it is a map lookup; the held
   * cells are read only once camp claims a wanted cell.
   */
  private outsideCamp(
    vehicleId: VehicleId,
    vehicle: Entity,
    wanted: readonly DockCell[],
  ): DockCell[] {
    const dimensionId = asDimensionId(vehicle.dimension.id);
    let held: ReadonlySet<string> | undefined;
    return wanted.filter((c) => {
      if (!this.campSpace(dimensionId, c)) return true;
      held ??= this.layer.heldKeys(vehicleId, vehicle);
      return held.has(cellKey(c));
    });
  }

  clearGone(live: ReadonlySet<VehicleId>): void {
    this.layer.clearGone(live);
  }
}
