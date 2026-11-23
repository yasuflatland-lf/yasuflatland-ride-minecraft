import { BlockPermutation, type Dimension } from "@minecraft/server";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { type Cell, cellKey, parseCell } from "../../domain/shared/cells";
import { asDimensionId, type DimensionId } from "../../domain/shared/ids";
import { AIR_BLOCK, NAMESPACE } from "./identifiers";
import type { CellHolder } from "./laidCells";

interface DimensionRecord {
  dimension: Dimension;
  cells: Map<string, Cell>;
}

interface BlockRecord {
  // The saved property describes the holder's current dimension. Unavailable
  // cells in other dimensions stay here until a later lay or clear can reach them.
  dimensions: Map<string, DimensionRecord>;
  saveFailed: boolean;
}

export class SingleBlockLayer<Owner extends string> {
  private readonly records = new Map<Owner, BlockRecord>();

  constructor(
    private readonly blockId: string,
    private readonly property: string,
    private readonly isVehicleSpace: SpaceCheck,
    private readonly label: string,
  ) {}

  /** Feature pose reads can share the lay operation's warning budget. */
  warning(operation: "lay" | "clear"): (error: unknown) => void {
    let warned = false;
    return (error) => {
      if (!warned)
        console.warn(
          `[${NAMESPACE}] ${this.label} ${operation} failed: ${error}`,
        );
      warned = true;
    };
  }

  remember(owner: Owner, holder: CellHolder): void {
    this.record(owner, holder);
  }

  forget(owner: Owner): void {
    this.records.delete(owner);
  }

  heldCells(owner: Owner, holder: CellHolder): readonly Cell[] {
    const record = this.records.get(owner);
    return record
      ? [...(record.dimensions.get(holder.dimension.id)?.cells.values() ?? [])]
      : this.read(holder);
  }

  ownerOf(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): Owner | undefined {
    if (typeId !== this.blockId) return undefined;
    const key = cellKey(cell);
    for (const [owner, { dimensions }] of this.records)
      if (dimensions.get(dimensionId)?.cells.has(key)) return owner;
    return undefined;
  }

  lay(
    owner: Owner,
    holder: CellHolder,
    wanted: readonly Cell[],
    warn = this.warning("lay"),
  ): void {
    const record = this.record(owner, holder);
    const dimension = holder.dimension;
    const dimensionId = asDimensionId(dimension.id);
    const keys = new Set(wanted.map(cellKey));
    this.clearCells(record, warn, { dimensionId, keys });
    const cells =
      record.dimensions.get(dimensionId)?.cells ?? new Map<string, Cell>();
    for (const cell of wanted) {
      try {
        if (this.isVehicleSpace(dimensionId, cell)) continue;
        const block = dimension.getBlock(cell);
        if (!block?.isAir) continue;
        block.setPermutation(BlockPermutation.resolve(this.blockId));
        cells.set(cellKey(cell), cell);
      } catch (error) {
        warn(error);
      }
    }
    if (cells.size > 0)
      record.dimensions.set(dimensionId, { dimension, cells });
    this.save(record, holder, [...cells.values()], warn);
  }

  /** Returns cells that still need cleanup. */
  clear(owner: Owner, holder?: CellHolder): readonly Cell[] {
    const record = holder
      ? this.record(owner, holder)
      : this.records.get(owner);
    if (!record) return [];
    const warn = this.warning("clear");
    const needsSave = record.dimensions.size > 0 || record.saveFailed;
    this.clearCells(record, warn);
    if (holder?.isValid && needsSave)
      this.save(record, holder, this.heldCells(owner, holder), warn);
    if (
      record.dimensions.size === 0 &&
      (!holder?.isValid || !record.saveFailed)
    )
      this.forget(owner);
    return [...record.dimensions.values()].flatMap(({ cells }) => [
      ...cells.values(),
    ]);
  }

  private clearCells(
    { dimensions }: BlockRecord,
    warn: (error: unknown) => void,
    keep?: { dimensionId: DimensionId; keys: ReadonlySet<string> },
  ): void {
    for (const [id, { dimension, cells }] of dimensions) {
      for (const [key, cell] of cells) {
        if (keep?.dimensionId === id && keep.keys.has(key)) continue;
        try {
          const block = dimension.getBlock(cell);
          if (!block) continue;
          if (block.typeId === this.blockId)
            block.setPermutation(BlockPermutation.resolve(AIR_BLOCK));
          cells.delete(key);
        } catch (error) {
          warn(error);
        }
      }
      if (cells.size === 0) dimensions.delete(id);
    }
  }

  private record(owner: Owner, holder: CellHolder): BlockRecord {
    let record = this.records.get(owner);
    if (!record) {
      const dimension = holder.dimension;
      const cells = new Map(
        this.read(holder).map((cell) => [cellKey(cell), cell]),
      );
      record = { dimensions: new Map(), saveFailed: false };
      if (cells.size > 0)
        record.dimensions.set(dimension.id, { dimension, cells });
      this.records.set(owner, record);
    }
    return record;
  }

  private read(holder: CellHolder): Cell[] {
    return readSavedCells(holder.getDynamicProperty(this.property));
  }

  private save(
    record: BlockRecord,
    holder: CellHolder,
    cells: readonly Cell[],
    warn: (error: unknown) => void,
  ): void {
    try {
      holder.setDynamicProperty(this.property, writeSavedCells(cells));
      record.saveFailed = false;
    } catch (error) {
      record.saveFailed = true;
      warn(error);
    }
  }
}

function readSavedCells(saved: unknown): Cell[] {
  if (typeof saved !== "string") return [];
  try {
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) return [];
    return value.map(parseCell).filter((cell) => cell !== undefined);
  } catch {
    return [];
  }
}

function writeSavedCells(cells: readonly Cell[]): string | undefined {
  return cells.length > 0 ? JSON.stringify(cells) : undefined;
}
