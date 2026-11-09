import { BlockPermutation, type Dimension } from "@minecraft/server";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { type Cell, cellKey } from "../../domain/shared/cells";
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

  clear(
    dimension: Dimension,
    recorded: readonly Cell[],
    warn = this.warning("clear"),
  ): void {
    for (const cell of recorded) {
      try {
        const block = dimension.getBlock(cell);
        if (block?.typeId === this.blockId)
          block.setPermutation(BlockPermutation.resolve("minecraft:air"));
      } catch (error) {
        warn(error);
      }
    }
  }
}

export function readLaidCells(saved: unknown): Cell[] {
  if (typeof saved !== "string") return [];
  try {
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (cell): cell is Cell =>
        cell !== null &&
        typeof cell === "object" &&
        [cell.x, cell.y, cell.z].every(Number.isSafeInteger),
    );
  } catch {
    return [];
  }
}

export function writeLaidCells(cells: readonly Cell[]): string | undefined {
  return cells.length > 0 ? JSON.stringify(cells) : undefined;
}
