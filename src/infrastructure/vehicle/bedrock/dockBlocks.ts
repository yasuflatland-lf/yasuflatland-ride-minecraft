// Persistent blocks that held vehicles lay: decks, and a parked camper's room (ADR 0063, 0068).
import {
  BlockPermutation,
  type Dimension,
  type Entity,
} from "@minecraft/server";
import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import {
  type DockBlock,
  type DockCell,
  type Face,
  refloor,
} from "../../../domain/vehicle/dock/floor";
import { cellKey } from "../../../domain/vehicle/lighting/headlights";
import { isLightBlock } from "./headlightBlocks";
import {
  AIR_BLOCK,
  CAMPER_BED_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_WALL_BLOCK,
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
  ROOM_FACE_STATE,
  ROOM_OPEN_STATE,
} from "./identifiers";

// The block defines one collision permutation per pixel height (ADR 0063).
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 16;

interface Laid {
  dimension: Dimension;
  cells: DockCell[];
}

function isHeight(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MIN_HEIGHT &&
    v <= MAX_HEIGHT
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
    case "wall":
      return isFace(b.face);
    case "door":
      return isFace(b.face) && typeof b.open === "boolean";
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

// The cells a vehicle laid are saved on the entity, so a /reload or a restart
// can still clear them.
function savedCells(vehicle: Entity): DockCell[] {
  const raw = vehicle.getDynamicProperty(DECK_CELLS_PROPERTY);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(upgradeHeightOnlyCell).filter(isDockCell);
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
    const key = cellKey(cell);
    for (const [vehicleId, entry] of this.laid)
      if (
        entry.dimension.id === dimensionId &&
        entry.cells.some((c) => c.block.type === "door" && cellKey(c) === key)
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
      entry = { dimension: vehicle.dimension, cells: savedCells(vehicle) };
    }
    const before = JSON.stringify(entry.cells);
    if (vehicle && vehicle.dimension.id !== entry.dimension.id) {
      this.update(entry, []);
      if (entry.cells.length > 0) this.stranded.push(entry);
      entry = { dimension: vehicle.dimension, cells: [] };
    }
    this.update(entry, vehicle ? wanted : []);
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

  private update(entry: Laid, wanted: readonly DockCell[]): void {
    const { clear, place } = refloor(entry.cells, wanted);
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
