// Persistent blocks that held vehicles lay: decks, and a parked camper's room (ADR 0063, 0068).
import {
  BlockPermutation,
  type Dimension,
  type Entity,
} from "@minecraft/server";
import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { isDecorItem } from "../../../domain/vehicle/dock/decor";
import {
  type DockBlock,
  type DockCell,
  type Face,
  refloor,
} from "../../../domain/vehicle/dock/floor";
import { STANDING_GEAR_IDS } from "../../../domain/vehicle/kinds/index";
import { cellKey } from "../../../domain/vehicle/lighting/headlights";
import { isLightBlock } from "./headlightBlocks";
import {
  AIR_BLOCK,
  CAMPER_BED_BLOCK,
  CAMPER_CABINET_DOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
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
// to 119 cells, so the cells are read once a second per vehicle, not every tick (ADR 0096).
export const DOCK_RECHECK_TICKS = 20;
const NONE_LOST: ReadonlySet<string> = new Set();

interface Laid {
  dimension: Dimension;
  cells: DockCell[];
  /** Lays left until the laid cells are read again for blocks the world lost (ADR 0096). */
  recheckIn: number;
}

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
      return true;
    case "furniture":
      return isDecorHeight(b.height);
    case "wall":
      return isFace(b.face);
    case "door":
      return isFace(b.face) && typeof b.open === "boolean";
    case "showerToilet":
    case "cabinetDoor":
      return isFace(b.face);
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
    case "showerToilet":
      return CAMPER_SHOWER_TOILET_BLOCK;
    case "cabinetDoor":
      return CAMPER_CABINET_DOOR_BLOCK;
    case "cabinet":
      return pairDecorBlockId("cabinet");
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

// The cells a vehicle laid are saved on the entity, so a /reload or a restart
// can still clear them.
function savedCells(vehicle: Entity): DockCell[] {
  const raw = vehicle.getDynamicProperty(DECK_CELLS_PROPERTY);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(upgradeHeightOnlyCell)
      .map(upgradeSpotlessDecor)
      .filter(isDockCell);
  } catch {
    return [];
  }
}

/** State derived from the cells actually laid, with one saved-property read per rebuild. */
export function savedDock(vehicle: Entity): {
  laid: boolean;
  doorOpen: boolean | undefined;
} {
  const cells = savedCells(vehicle);
  const door = cells.find((c) => c.block.type === "door");
  return {
    laid: cells.length > 0,
    doorOpen: door?.block.type === "door" ? door.block.open : undefined,
  };
}

export class DockBlocks {
  private readonly laid = new Map<VehicleId, Laid>();

  /** The vehicle whose laid door is at this cell, if any. */
  doorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.ownerOf(dimensionId, cell, (block) => block.type === "door");
  }

  /** The vehicle that laid any dock block at this cell, if any (ADR 0093). */
  cellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.ownerOf(dimensionId, cell, () => true);
  }

  /** The vehicle that laid this cell, while the world still holds the block it laid there (ADR 0096). */
  laidBlockOwner(
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ): VehicleId | undefined {
    return this.ownerOf(
      dimensionId,
      cell,
      (block) => blockIdOf(block) === typeId,
    );
  }

  private ownerOf(
    dimensionId: DimensionId,
    cell: Vec3,
    accepts: (block: DockBlock) => boolean,
  ): VehicleId | undefined {
    const key = cellKey(cell);
    for (const [vehicleId, entry] of this.laid)
      if (
        entry.dimension.id === dimensionId &&
        entry.cells.some((c) => accepts(c.block) && cellKey(c) === key)
      )
        return vehicleId;
    return undefined;
  }

  // Cells left in a dimension the vehicle has left because their chunk was
  // unloaded at the time; the saved property only describes the current
  // dimension, so they are kept here until a later tick clears them.
  private stranded: Laid[] = [];

  /** `vehicle` is undefined when the entity is gone; its cells are then only cleared. */
  lay(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    wanted: readonly DockCell[],
  ) {
    let entry = this.laid.get(vehicleId);
    if (!entry) {
      if (!vehicle) return;
      entry = {
        dimension: vehicle.dimension,
        cells: savedCells(vehicle),
        recheckIn: 0,
      };
    }
    const before = JSON.stringify(entry.cells);
    if (vehicle && vehicle.dimension.id !== entry.dimension.id) {
      this.update(entry, []);
      if (entry.cells.length > 0) this.stranded.push(entry);
      entry = { dimension: vehicle.dimension, cells: [], recheckIn: 0 };
    }
    const lost =
      vehicle && wanted.length > 0 ? this.lostCells(entry) : NONE_LOST;
    this.update(entry, vehicle ? wanted : [], lost);
    if (entry.cells.length > 0) this.laid.set(vehicleId, entry);
    else this.laid.delete(vehicleId);
    if (vehicle?.isValid && JSON.stringify(entry.cells) !== before) {
      vehicle.setDynamicProperty(
        DECK_CELLS_PROPERTY,
        entry.cells.length > 0 ? JSON.stringify(entry.cells) : undefined,
      );
    }
  }

  /**
   * Clears the cells of vehicles that are gone, and retries the cells left in
   * a dimension a vehicle has left. A vehicle removed as its chunk
   * loads may have floor cells in chunks that are not loaded yet, and nothing
   * else asks for its id again (ADR 0038).
   */
  clearGone(live: ReadonlySet<VehicleId>): void {
    for (const [id, entry] of this.laid) {
      if (live.has(id)) continue;
      this.update(entry, []);
      if (entry.cells.length === 0) this.laid.delete(id);
    }
    for (const entry of this.stranded) this.update(entry, []);
    this.stranded = this.stranded.filter((entry) => entry.cells.length > 0);
  }

  /** Keys of the laid cells whose block the world lost, read once every DOCK_RECHECK_TICKS lays (ADR 0096). */
  private lostCells(entry: Laid): ReadonlySet<string> {
    if (entry.recheckIn > 0) {
      entry.recheckIn--;
      return NONE_LOST;
    }
    entry.recheckIn = DOCK_RECHECK_TICKS - 1;
    const lost = new Set<string>();
    for (const c of entry.cells) {
      try {
        const b = entry.dimension.getBlock(c);
        if (b && (b.isAir || isLightBlock(b))) lost.add(cellKey(c));
      } catch {
        // Unloaded chunk or outside the world: read it again on a later check.
      }
    }
    return lost;
  }

  private update(
    entry: Laid,
    wanted: readonly DockCell[],
    lost: ReadonlySet<string> = NONE_LOST,
  ): void {
    const { clear, place } = refloor(entry.cells, wanted, (c) =>
      lost.has(cellKey(c)),
    );
    const cleared = new Set<string>();
    for (const c of clear) {
      try {
        const b = entry.dimension.getBlock(c);
        // getBlock may also return undefined for an unloaded chunk; keep the
        // cell then too.
        if (!b) continue;
        // A replacement block belongs to the player, not the vehicle.
        if (b.typeId === blockIdOf(c.block)) b.setType(AIR_BLOCK);
        cleared.add(cellKey(c));
      } catch {
        // Unloaded chunk: keep the cell and clear it on a later tick.
      }
    }
    const cells = new Map(
      entry.cells
        .filter((c) => !cleared.has(cellKey(c)))
        .map((c) => [cellKey(c), c]),
    );
    for (const c of place) {
      try {
        const b = entry.dimension.getBlock(c);
        if (!b) continue;
        const before = cells.get(cellKey(c));
        const ownBlock =
          before !== undefined && b.typeId === blockIdOf(before.block);
        if (!b.isAir && !isLightBlock(b) && !ownBlock) continue;
        b.setPermutation(permutationOf(c.block));
        cells.set(cellKey(c), c);
      } catch {
        // Unloaded chunk or outside the world: retry placement on a later tick.
      }
    }
    entry.cells = [...cells.values()];
  }
}
