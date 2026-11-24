import type { Dimension } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { cellKey, cellOf } from "../../../../src/domain/shared/cells";
import { PLACE_KEPT_BLOCKS } from "../../../../src/domain/shared/keptBlocks";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import type { DropSweep } from "../../../../src/infrastructure/vehicle/bedrock/dropSweep";
import { RoadPaver } from "../../../../src/infrastructure/vehicle/bedrock/roadPaver";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: {
    resolve: (typeId: string) => {
      if (typeId === "bad:block") throw new Error("unknown block");
      return { typeId };
    },
  },
}));

const ROAD = "minecraft:stone";
const LAID = "yasu_ride:camper_floor";
const KINDS = [
  "minecraft:air",
  "minecraft:water",
  "minecraft:dirt",
  ROAD,
  LAID,
  ...PLACE_KEPT_BLOCKS,
];

function fixture(
  types: Readonly<Record<string, string>> = {},
  options: { unloaded?: string; throws?: string; protect?: string } = {},
) {
  const world = new Map(Object.entries(types));
  const typeAt = (c: Vec3) => world.get(cellKey(cellOf(c))) ?? "minecraft:air";
  const dimension = {
    id: "overworld",
    getBlock: (c: Vec3) => {
      if (cellKey(cellOf(c)) === options.unloaded) return undefined;
      return {
        typeId: typeAt(c),
        hasTag: (tag: string) => tag === "yasu_ride:laid" && typeAt(c) === LAID,
        setPermutation: (p: { typeId: string }) => {
          if (cellKey(cellOf(c)) === options.throws) throw new Error("boom");
          world.set(cellKey(cellOf(c)), p.typeId);
        },
      };
    },
  } as unknown as Dimension;
  const record = vi.fn();
  const drops = { record } as unknown as DropSweep;
  const paver = new RoadPaver(
    drops,
    (_dimensionId, c) => cellKey(c) === options.protect,
  );
  return { typeAt, dimension, record, paver };
}

const cellAt = (i: number): Vec3 => ({ x: i, y: 64, z: 0 });

it("lays a cell if and only if no guard applies", () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...KINDS), { minLength: 1, maxLength: 8 }),
      fc.option(fc.nat({ max: 7 }), { nil: undefined }),
      (kinds, protectedIndex) => {
        const types = Object.fromEntries(
          kinds.map((k, i) => [cellKey(cellOf(cellAt(i))), k]),
        );
        const { typeAt, dimension, paver } = fixture(types, {
          protect:
            protectedIndex === undefined
              ? undefined
              : cellKey(cellOf(cellAt(protectedIndex))),
        });
        paver.pave(dimension, {
          block: ROAD,
          cells: kinds.map((_, i) => cellAt(i)),
        });
        kinds.forEach((kind, i) => {
          const guarded =
            kind === ROAD ||
            kind === LAID ||
            PLACE_KEPT_BLOCKS.includes(kind) ||
            i === protectedIndex;
          expect(typeAt(cellAt(i))).toBe(guarded ? kind : ROAD);
        });
      },
    ),
  );
});

it("skips an unloaded cell and a throwing cell without stopping the rest", () => {
  const { typeAt, dimension, paver } = fixture(
    {},
    {
      unloaded: cellKey(cellOf(cellAt(0))),
      throws: cellKey(cellOf(cellAt(1))),
    },
  );
  paver.pave(dimension, {
    block: ROAD,
    cells: [cellAt(0), cellAt(1), cellAt(2)],
  });
  expect(typeAt(cellAt(1))).toBe("minecraft:air");
  expect(typeAt(cellAt(2))).toBe(ROAD);
});

it("lays nothing for a block that does not resolve", () => {
  const { typeAt, dimension, paver, record } = fixture();
  paver.pave(dimension, { block: "bad:block", cells: [cellAt(0)] });
  expect(typeAt(cellAt(0))).toBe("minecraft:air");
  expect(record).not.toHaveBeenCalled();
});

it("records one box from each placed cell to the cell plus one", () => {
  const { dimension, paver, record } = fixture({
    [cellKey(cellOf(cellAt(1)))]: "minecraft:chest",
  });
  paver.pave(dimension, { block: ROAD, cells: [cellAt(0), cellAt(1)] });
  expect(record.mock.calls).toEqual([
    ["overworld", cellAt(0), { x: 1, y: 65, z: 1 }],
  ]);
});
