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
 */
export function blockGrid(
  options: GridOptions & { unloaded: (c: Cell) => boolean },
): ReturnType<typeof makeGrid>;
export function blockGrid(options?: Omit<GridOptions, "unloaded">): Omit<
  ReturnType<typeof makeGrid>,
  "getBlock"
> & {
  getBlock(
    c: Cell,
  ): NonNullable<ReturnType<ReturnType<typeof makeGrid>["getBlock"]>>;
};
export function blockGrid(options: GridOptions = {}) {
  return makeGrid(options);
}
function makeGrid(options: GridOptions = {}) {
  const types = new Map<string, string>();
  const typeAt = (c: Cell): string => types.get(cellKey(c)) ?? AIR;
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
            const type = typeAt(c);
            if (fillOptions?.blockFilter?.excludeTypes?.includes(type))
              continue;
            if (
              options.tags?.[type]?.some((tag) =>
                fillOptions?.blockFilter?.excludeTags?.includes(tag),
              )
            )
              continue;
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
