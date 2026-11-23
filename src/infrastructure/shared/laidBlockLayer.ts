import { BlockPermutation, type Dimension } from "@minecraft/server";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { type Cell, cellKey, parseCell } from "../../domain/shared/cells";
import { asDimensionId } from "../../domain/shared/ids";
import { NAMESPACE } from "./identifiers";

export class LaidBlockLayer {
  constructor(
    private readonly blockId: string,
    private readonly isVehicleSpace: SpaceCheck,
    private readonly label: string,
  ) {}

  /** Share a warning budget with the caller's persistence step. */
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

  lay(
    dimension: Dimension,
    wanted: readonly Cell[],
    recorded: readonly Cell[],
    warn = this.warning("lay"),
  ): Cell[] {
    const cells = new Map(recorded.map((cell) => [cellKey(cell), cell]));
    for (const cell of wanted) {
      try {
        if (this.isVehicleSpace(asDimensionId(dimension.id), cell)) continue;
        const block = dimension.getBlock(cell);
        if (!block) continue;
        if (block.typeId === this.blockId && cells.has(cellKey(cell))) continue;
        if (!block.isAir) continue;
        block.setPermutation(BlockPermutation.resolve(this.blockId));
        cells.set(cellKey(cell), cell);
      } catch (error) {
        warn(error);
      }
    }
    return [...cells.values()];
  }

  /** Returns cells that still need cleanup. */
  clear(
    dimension: Dimension,
    recorded: readonly Cell[],
    warn = this.warning("clear"),
  ): Cell[] {
    const remaining: Cell[] = [];
    for (const cell of recorded) {
      try {
        const block = dimension.getBlock(cell);
        if (!block) remaining.push(cell);
        else if (block.typeId === this.blockId)
          block.setPermutation(BlockPermutation.resolve("minecraft:air"));
      } catch (error) {
        remaining.push(cell);
        warn(error);
      }
    }
    return remaining;
  }
}

export function readSavedCells(saved: unknown): Cell[] {
  if (typeof saved !== "string") return [];
  try {
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) return [];
    return value.map(parseCell).filter((cell) => cell !== undefined);
  } catch {
    return [];
  }
}

export function writeSavedCells(cells: readonly Cell[]): string | undefined {
  return cells.length > 0 ? JSON.stringify(cells) : undefined;
}
