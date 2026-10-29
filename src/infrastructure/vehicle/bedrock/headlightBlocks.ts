// Light blocks in front of vehicles with their headlights on (ADR 0020).
import type { Dimension, Entity } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { cellKey } from "../../../domain/shared/cells";
import { asDimensionId, type VehicleId } from "../../../domain/shared/ids";
import {
  FULL_LIGHT_LEVEL,
  type LitCell,
  litCellKey,
  relight,
} from "../../../domain/vehicle/lighting/headlights";
import { isLightBlock, lightBlockId } from "../../shared/lightBlocks";
import { LIT_CELLS_PROPERTY } from "./identifiers";

interface Lit {
  dimension: Dimension;
  cells: LitCell[];
}

function isInteger(v: unknown): v is number {
  return Number.isInteger(v);
}

function litCellFrom(v: unknown): LitCell | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const { x, y, z, level = FULL_LIGHT_LEVEL } = v as Record<string, unknown>;
  if (!isInteger(x) || !isInteger(y) || !isInteger(z)) return undefined;
  if (!isInteger(level) || level < 0 || level > FULL_LIGHT_LEVEL) {
    return undefined;
  }
  return { x, y, z, level };
}

function litKeysOf(cells: readonly LitCell[]): string {
  return cells.map(litCellKey).join(";");
}

// The cells a vehicle lit are saved on the entity, so a /reload or a restart
// can still clear them.
function savedCells(vehicle: Entity): LitCell[] {
  const raw = vehicle.getDynamicProperty(LIT_CELLS_PROPERTY);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.flatMap((v) => litCellFrom(v) ?? [])
      : [];
  } catch {
    return [];
  }
}

export class HeadlightBlocks {
  private readonly lit = new Map<VehicleId, Lit>();

  constructor(private readonly campSpace: SpaceCheck) {}

  /** `vehicle` is undefined when the entity is gone; its cells are then only cleared. */
  shine(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    wanted: readonly LitCell[],
  ) {
    let entry = this.lit.get(vehicleId);
    if (!entry) {
      if (!vehicle) return;
      entry = { dimension: vehicle.dimension, cells: savedCells(vehicle) };
    }
    if (vehicle && vehicle.dimension.id !== entry.dimension.id) {
      this.update(entry, []);
      entry = { dimension: vehicle.dimension, cells: [] };
    }
    const before = litKeysOf(entry.cells);
    this.update(entry, vehicle ? wanted : []);
    if (entry.cells.length > 0) this.lit.set(vehicleId, entry);
    else this.lit.delete(vehicleId);
    if (vehicle?.isValid && litKeysOf(entry.cells) !== before) {
      vehicle.setDynamicProperty(
        LIT_CELLS_PROPERTY,
        entry.cells.length > 0 ? JSON.stringify(entry.cells) : undefined,
      );
    }
  }

  /**
   * Clears the cells of vehicles that are gone. A vehicle removed as its chunk
   * loads may have lit cells in chunks that are not loaded yet, and nothing
   * else asks for its id again (ADR 0038).
   */
  clearGone(live: ReadonlySet<VehicleId>): void {
    for (const [id, entry] of this.lit) {
      if (live.has(id)) continue;
      this.update(entry, []);
      if (entry.cells.length === 0) this.lit.delete(id);
    }
  }

  private update(entry: Lit, wanted: readonly LitCell[]): void {
    const { clear, light } = relight(entry.cells, wanted);
    const cleared = new Set<string>();
    for (const c of clear) {
      try {
        const b = entry.dimension.getBlock(c);
        // getBlock may also return undefined for an unloaded chunk; keep the
        // cell then too.
        if (!b) continue;
        // A player may have built over the light since; leave that block alone.
        if (isLightBlock(b)) b.setType("minecraft:air");
        cleared.add(cellKey(c));
      } catch {
        // Unloaded chunk: keep the cell and clear it on a later tick.
      }
    }
    const cells = entry.cells.filter((c) => !cleared.has(cellKey(c)));
    const dimensionId = asDimensionId(entry.dimension.id);
    for (const c of light) {
      if (this.campSpace(dimensionId, c)) continue;
      // Resolved outside the try so a bad profile level throws here instead of
      // being swallowed as an engine error.
      const type = lightBlockId(c.level);
      try {
        const b = entry.dimension.getBlock(c);
        if (!b?.isAir) continue;
        b.setType(type);
        cells.push(c);
      } catch {
        // Unloaded chunk or outside the world: no light there this tick.
      }
    }
    entry.cells = cells;
  }
}
