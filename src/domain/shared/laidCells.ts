import { type Cell, cellKey } from "./cells";

/** A cell a feature lays, with the feature's own block description. */
export interface LaidCell<B> extends Cell {
  readonly block: B;
}

/**
 * Cells to clear and cells to place or replace to go from laid to wanted. A laid
 * cell that `lost` says the world no longer holds is placed again (ADR 0063, 0096).
 */
export function relayCells<B>(
  laid: readonly LaidCell<B>[],
  wanted: readonly LaidCell<B>[],
  same: (a: B, b: B) => boolean,
  lost: (cell: LaidCell<B>) => boolean = () => false,
): { clear: LaidCell<B>[]; place: LaidCell<B>[] } {
  const laidByKey = new Map(laid.map((c) => [cellKey(c), c]));
  const wantedKeys = new Set(wanted.map(cellKey));
  return {
    clear: laid.filter((c) => !wantedKeys.has(cellKey(c))),
    place: wanted.filter((c) => {
      const before = laidByKey.get(cellKey(c));
      return (
        before === undefined || !same(before.block, c.block) || lost(before)
      );
    }),
  };
}
