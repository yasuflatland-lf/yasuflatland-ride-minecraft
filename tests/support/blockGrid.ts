import type { BlockFillOptions } from "@minecraft/server";
import { type Cell, cellKey } from "../../src/domain/shared/cells";

const AIR = "minecraft:air";

interface GridOptions {
  unloaded?: (c: Cell) => boolean;
  tags?: Readonly<Record<string, readonly string[]>>;
  heightRange?: { min: number; max: number };
}
/**
 * A dimension stand-in that remembers the type of every block set in it, so a
 * test can read back what the scripts left in the world. Unset cells are air.
 * `fillBlocks` records each call in `fills` and overwrites every cell in the
 * box except those whose type is in `blockFilter.excludeTypes` or whose
 * `tags[type]` meets `excludeTags`, as the engine does. `getBlock` returns
 * undefined where `unloaded` is true (an unloaded chunk, ADR 0125).
 */
export function blockGrid(
  options: GridOptions & { unloaded: (c: Cell) => boolean },
): Grid;
export function blockGrid(options?: Omit<GridOptions, "unloaded">): LoadedGrid;
export function blockGrid(options: GridOptions = {}) {
  return makeGrid(options);
}
type Grid = ReturnType<typeof makeGrid>;
type LoadedGrid = Omit<Grid, "getBlock"> & {
  getBlock(c: Cell): NonNullable<ReturnType<Grid["getBlock"]>>;
};
function makeGrid(options: GridOptions = {}) {
  const types = new Map<string, string>();
  const typeAt = (c: Cell): string => types.get(cellKey(c)) ?? AIR;
  const isExcluded = (type: string, fillOptions?: BlockFillOptions) => {
    const filter = fillOptions?.blockFilter;
    return (
      filter?.excludeTypes?.includes(type) === true ||
      options.tags?.[type]?.some((tag) =>
        filter?.excludeTags?.includes(tag),
      ) === true
    );
  };
  const fills: {
    from: Cell;
    to: Cell;
    block: string;
    options?: BlockFillOptions;
  }[] = [];
  return {
    heightRange: options.heightRange ?? { min: -64, max: 320 },
    fills,
    fillBlocks(
      volume: { from: Cell; to: Cell },
      block: string,
      fillOptions?: BlockFillOptions,
    ) {
      fills.push({ ...volume, block, options: fillOptions });
      for (let x = volume.from.x; x <= volume.to.x; x++)
        for (let y = volume.from.y; y <= volume.to.y; y++)
          for (let z = volume.from.z; z <= volume.to.z; z++) {
            const c = { x, y, z };
            if (!isExcluded(typeAt(c), fillOptions))
              types.set(cellKey(c), block);
          }
    },
    typeAt,
    getBlock: (c: Cell) =>
      options.unloaded?.(c)
        ? undefined
        : {
            get typeId() {
              return typeAt(c);
            },
            get isAir() {
              return typeAt(c) === AIR;
            },
            setType: (typeId: string) => {
              types.set(cellKey(c), typeId);
            },
            setPermutation: (permutation: { typeId: string }) => {
              types.set(cellKey(c), permutation.typeId);
            },
          },
  };
}
