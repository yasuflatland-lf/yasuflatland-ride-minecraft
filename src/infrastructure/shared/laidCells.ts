import type { BlockPermutation, Dimension, Entity } from "@minecraft/server";
import { type Cell, cellKey } from "../../domain/shared/cells";
import type { DimensionId } from "../../domain/shared/ids";
import { type LaidCell, relayCells } from "../../domain/shared/laidCells";
import { AIR_BLOCK } from "./identifiers";
import { isLightBlock } from "./lightBlocks";

/** How one feature's blocks are named, placed, compared, and saved. */
export interface CellCodec<B> {
  /** Dynamic property on the holder entity that saves the laid cells as a JSON array. */
  readonly property: string;
  /** Rewrites one saved entry from an older build's shape; returns anything else unchanged. */
  upgrade(saved: unknown): unknown;
  isCell(value: unknown): value is LaidCell<B>;
  same(a: B, b: B): boolean;
  /** The exact block id laid for `block`, light level included (ADR 0115). */
  blockIdOf(block: B): string;
  permutationOf(block: B): BlockPermutation;
}

/** The entity that owns laid cells and saves them. */
export type CellHolder = Pick<
  Entity,
  "dimension" | "isValid" | "getDynamicProperty" | "setDynamicProperty"
>;

const NONE_LOST: ReadonlySet<string> = new Set();

interface Laid<B> {
  dimension: Dimension;
  cells: LaidCell<B>[];
  /** Lays left until the laid cells are read again for blocks the world lost (ADR 0096). */
  recheckIn: number;
}

// The cells a holder laid are saved on the entity, so a /reload or a restart
// can still clear them.
export function savedLaidCells<B>(
  holder: Pick<Entity, "getDynamicProperty">,
  codec: CellCodec<B>,
): LaidCell<B>[] {
  const raw = holder.getDynamicProperty(codec.property);
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => codec.upgrade(v)).filter((v) => codec.isCell(v));
  } catch {
    return [];
  }
}

export class CellLayer<Owner extends string, B> {
  private readonly laid = new Map<Owner, Laid<B>>();
  // Cells left in a dimension the holder has left because their chunk was
  // unloaded at the time; the saved property only describes the current
  // dimension, so they are kept here until a later tick clears them.
  private stranded: Laid<B>[] = [];

  constructor(
    private readonly codec: CellCodec<B>,
    private readonly recheckTicks: number,
  ) {}

  /** The owner that laid this cell, while the world still holds the block it laid there (ADR 0096). */
  laidBlockOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): Owner | undefined {
    return this.ownerOf(
      dimensionId,
      cell,
      (block) => this.codec.blockIdOf(block) === typeId,
    );
  }

  /** The owner that laid a cell at `cell` whose block `accepts` takes (any block when omitted). */
  ownerOf(
    dimensionId: DimensionId,
    cell: Cell,
    accepts: (block: B) => boolean = () => true,
  ): Owner | undefined {
    const key = cellKey(cell);
    for (const [owner, entry] of this.laid)
      if (
        entry.dimension.id === dimensionId &&
        entry.cells.some((c) => accepts(c.block) && cellKey(c) === key)
      )
        return owner;
    return undefined;
  }

  /**
   * Keys of the cells `owner` holds in `holder`'s dimension. Before the first
   * lay after a /reload they come from the saved property, which is what
   * `lay` would load.
   */
  heldKeys(owner: Owner, holder: CellHolder): ReadonlySet<string> {
    const entry = this.laid.get(owner);
    const cells = entry
      ? entry.dimension.id === holder.dimension.id
        ? entry.cells
        : []
      : savedLaidCells(holder, this.codec);
    return new Set(cells.map(cellKey));
  }

  /** `holder` is undefined when the entity is gone; its cells are then only cleared. */
  lay(
    owner: Owner,
    holder: CellHolder | undefined,
    wanted: readonly LaidCell<B>[],
  ): void {
    let entry = this.laid.get(owner);
    if (!entry) {
      if (!holder) return;
      entry = {
        dimension: holder.dimension,
        cells: savedLaidCells(holder, this.codec),
        recheckIn: 0,
      };
    }
    const before = JSON.stringify(entry.cells);
    if (holder && holder.dimension.id !== entry.dimension.id) {
      this.update(entry, []);
      if (entry.cells.length > 0) this.stranded.push(entry);
      entry = { dimension: holder.dimension, cells: [], recheckIn: 0 };
    }
    const lost =
      holder && wanted.length > 0 ? this.lostCells(entry) : NONE_LOST;
    this.update(entry, holder ? wanted : [], lost);
    if (entry.cells.length > 0) this.laid.set(owner, entry);
    else this.laid.delete(owner);
    if (holder?.isValid && JSON.stringify(entry.cells) !== before) {
      holder.setDynamicProperty(
        this.codec.property,
        entry.cells.length > 0 ? JSON.stringify(entry.cells) : undefined,
      );
    }
  }

  /**
   * Clears the cells of holders that are gone, and retries the cells left in
   * a dimension a holder has left. A holder removed as its chunk loads may
   * have laid cells in chunks that are not loaded yet, and nothing else asks
   * for its id again (ADR 0038).
   */
  clearGone(live: ReadonlySet<Owner>): void {
    for (const [id, entry] of this.laid) {
      if (live.has(id)) continue;
      this.update(entry, []);
      if (entry.cells.length === 0) this.laid.delete(id);
    }
    for (const entry of this.stranded) this.update(entry, []);
    this.stranded = this.stranded.filter((entry) => entry.cells.length > 0);
  }

  /** Keys of the laid cells whose block the world lost, read once at the configured cadence (ADR 0096). */
  private lostCells(entry: Laid<B>): ReadonlySet<string> {
    if (entry.recheckIn > 0) {
      entry.recheckIn--;
      return NONE_LOST;
    }
    entry.recheckIn = this.recheckTicks - 1;
    const lost = new Set<string>();
    for (const c of entry.cells) {
      try {
        const b = entry.dimension.getBlock(c);
        // A light block counts as air, except in a cell where the layer laid that light (ADR 0115).
        if (
          b &&
          (b.isAir ||
            (isLightBlock(b) && b.typeId !== this.codec.blockIdOf(c.block)))
        )
          lost.add(cellKey(c));
      } catch {
        // Unloaded chunk or outside the world: read it again on a later check.
      }
    }
    return lost;
  }

  private update(
    entry: Laid<B>,
    wanted: readonly LaidCell<B>[],
    lost: ReadonlySet<string> = NONE_LOST,
  ): void {
    const { clear, place } = relayCells(
      entry.cells,
      wanted,
      this.codec.same,
      (c) => lost.has(cellKey(c)),
    );
    const cleared = new Set<string>();
    for (const c of clear) {
      try {
        const b = entry.dimension.getBlock(c);
        // getBlock may also return undefined for an unloaded chunk; keep the
        // cell then too.
        if (!b) continue;
        // A replacement block belongs to the player, not the holder.
        if (b.typeId === this.codec.blockIdOf(c.block)) b.setType(AIR_BLOCK);
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
          before !== undefined &&
          b.typeId === this.codec.blockIdOf(before.block);
        if (!b.isAir && !isLightBlock(b) && !ownBlock) continue;
        b.setPermutation(this.codec.permutationOf(c.block));
        cells.set(cellKey(c), c);
      } catch {
        // Unloaded chunk or outside the world: retry placement on a later tick.
      }
    }
    entry.cells = [...cells.values()];
  }
}
