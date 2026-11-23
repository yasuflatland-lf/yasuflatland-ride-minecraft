import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type CellBox,
  cellBox,
  cellsOf,
  sizeOf,
} from "../../../src/domain/build/box";
import {
  maxRoofHeight,
  type RoofKind,
  type RoofSpec,
  roofCells,
  roofCount,
  roofSlopeAt,
  stairRoofHeight,
} from "../../../src/domain/build/roof/roof";
import type { Facing } from "../../../src/domain/build/rotation/facing";
import { placementOf } from "../../../src/domain/build/volume/geometry";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";

const coord = fc.integer({ min: -10, max: 10 });
const origin = fc.record({ x: coord, y: coord, z: coord });
const side = fc.integer({ min: 1, max: 9 });
const kind = fc.constantFrom<RoofKind>("gable", "hip");
const baseOf = (min: Cell, sx: number, sz: number): CellBox =>
  cellBox(min, { x: min.x + sx - 1, y: min.y, z: min.z + sz - 1 });
const base = fc
  .tuple(origin, side, side)
  .map(([min, sx, sz]) => baseOf(min, sx, sz));
const spec = fc.record({
  base,
  kind,
  height: fc.integer({ min: 1, max: 12 }),
  style: fc.constant("stepped" as const),
});
const stairSpec = fc.record({ base, kind }).map(
  ({ base, kind }): RoofSpec => ({
    base,
    kind,
    height: stairRoofHeight(base),
    style: "stair",
  }),
);
const directions: readonly Cell[] = [
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 0, z: 1 },
];

describe("roof", () => {
  it("nests every layer inside the layer below", () => {
    fc.assert(
      fc.property(spec, (roof) => {
        const solid = [...roofCells(roof, false)];
        const keys = new Set(solid.map(cellKey));
        expect(
          solid.every(
            (c) =>
              c.y === roof.base.min.y ||
              keys.has(cellKey({ ...c, y: c.y - 1 })),
          ),
        ).toBe(true);
      }),
    );
  });

  it("ends at the centered ridge with the long axis preserved for gables", () => {
    fc.assert(
      fc.property(spec, (roof) => {
        const sx = roof.base.max.x - roof.base.min.x + 1;
        const sz = roof.base.max.z - roof.base.min.z + 1;
        const inset =
          roof.height === 1 ? 0 : Math.floor((Math.min(sx, sz) - 1) / 2);
        const dx = roof.kind === "hip" || sx < sz ? inset : 0;
        const dz = roof.kind === "hip" || sx >= sz ? inset : 0;
        const y = roof.base.min.y + roof.height - 1;
        const expected = cellsOf({
          min: { x: roof.base.min.x + dx, y, z: roof.base.min.z + dz },
          max: { x: roof.base.max.x - dx, y, z: roof.base.max.z - dz },
        });
        expect([...roofCells(roof, false)].filter((c) => c.y === y)).toEqual([
          ...expected,
        ]);
      }),
    );
  });

  it.each([false, true])(
    "counts cells without duplicates and stays within the prism (hollow=%s)",
    (hollow) => {
      fc.assert(
        fc.property(spec, (roof) => {
          const cells = [...roofCells(roof, hollow)];
          expect(roofCount(roof, hollow)).toBe(cells.length);
          expect(new Set(cells.map(cellKey)).size).toBe(cells.length);
          expect(cells.length).toBeLessThanOrEqual(
            (roof.base.max.x - roof.base.min.x + 1) *
              (roof.base.max.z - roof.base.min.z + 1) *
              roof.height,
          );
          expect(cells).toEqual(
            [...cells].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x),
          );
        }),
      );
    },
  );

  it("keeps exactly the solid cells with an exposed face, including the bottom and top", () => {
    fc.assert(
      fc.property(spec, (roof) => {
        const solid = [...roofCells(roof, false)];
        const solidKeys = new Set(solid.map(cellKey));
        const shell = [...roofCells(roof, true)];
        expect(shell.every((c) => solidKeys.has(cellKey(c)))).toBe(true);
        const exposed = solid.filter((c) =>
          directions.some(
            (d) =>
              !solidKeys.has(
                cellKey({ x: c.x + d.x, y: c.y + d.y, z: c.z + d.z }),
              ),
          ),
        );
        expect(shell).toEqual(exposed);
      }),
    );
  });

  it("gives odd square hip roofs a single centered apex", () => {
    fc.assert(
      fc.property(
        origin,
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 2, max: 12 }),
        (min, radius, height) => {
          const roof: RoofSpec = {
            base: baseOf(min, 2 * radius + 1, 2 * radius + 1),
            kind: "hip",
            height,
            style: "stepped",
          };
          expect(
            [...roofCells(roof, false)].filter(
              (c) => c.y === min.y + height - 1,
            ),
          ).toEqual([
            { x: min.x + radius, y: min.y + height - 1, z: min.z + radius },
          ]);
        },
      ),
    );
  });

  it("gives even square hip roofs a centered 2x2 apex", () => {
    fc.assert(
      fc.property(
        origin,
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 2, max: 12 }),
        (min, half, height) => {
          const roof: RoofSpec = {
            base: baseOf(min, 2 * half, 2 * half),
            kind: "hip",
            height,
            style: "stepped",
          };
          const y = min.y + height - 1;
          const expected = [half - 1, half]
            .flatMap((x) =>
              [half - 1, half].map((z) =>
                cellKey({ x: min.x + x, y, z: min.z + z }),
              ),
            )
            .sort();
          for (const hollow of [false, true])
            expect(
              [...roofCells(roof, hollow)]
                .filter((c) => c.y === y)
                .map(cellKey)
                .sort(),
            ).toEqual(expected);
        },
      ),
    );
  });

  it("gives height one exactly the base plate in either mode", () => {
    fc.assert(
      fc.property(base, kind, (base, kind) => {
        const roof = { base, kind, height: 1, style: "stepped" as const };
        for (const hollow of [false, true])
          expect([...roofCells(roof, hollow)]).toEqual([...cellsOf(base)]);
      }),
    );
  });

  it("caps height at three times the long side and the inclusive world top, with a minimum of one", () => {
    fc.assert(
      fc.property(
        base,
        fc.integer({ min: -15, max: 50 }),
        (base, worldTopY) => {
          const limit =
            3 *
            Math.max(base.max.x - base.min.x + 1, base.max.z - base.min.z + 1);
          expect(maxRoofHeight(base)).toBe(limit);
          expect(maxRoofHeight(base, worldTopY)).toBe(
            Math.max(1, Math.min(limit, worldTopY - base.min.y + 1)),
          );
        },
      ),
    );
  });
  it("walks a 5x3 gable of height two", () => {
    const roof: RoofSpec = {
      base: baseOf({ x: 0, y: 0, z: 0 }, 5, 3),
      kind: "gable",
      height: 2,
      style: "stepped",
    };
    const expected = [
      "0,0,0",
      "1,0,0",
      "2,0,0",
      "3,0,0",
      "4,0,0",
      "0,0,1",
      "1,0,1",
      "2,0,1",
      "3,0,1",
      "4,0,1",
      "0,0,2",
      "1,0,2",
      "2,0,2",
      "3,0,2",
      "4,0,2",
      "0,1,1",
      "1,1,1",
      "2,1,1",
      "3,1,1",
      "4,1,1",
    ];
    expect([...roofCells(roof, false)].map(cellKey)).toEqual(expected);
    expect([...roofCells(roof, true)].map(cellKey)).toEqual(expected);
  });
  it("removes only the enclosed middle cell of a 5x5 hip of height three", () => {
    const roof: RoofSpec = {
      base: baseOf({ x: 0, y: 0, z: 0 }, 5, 5),
      kind: "hip",
      height: 3,
      style: "stepped",
    };
    const expected = [
      "0,0,0",
      "1,0,0",
      "2,0,0",
      "3,0,0",
      "4,0,0",
      "0,0,1",
      "1,0,1",
      "2,0,1",
      "3,0,1",
      "4,0,1",
      "0,0,2",
      "1,0,2",
      "2,0,2",
      "3,0,2",
      "4,0,2",
      "0,0,3",
      "1,0,3",
      "2,0,3",
      "3,0,3",
      "4,0,3",
      "0,0,4",
      "1,0,4",
      "2,0,4",
      "3,0,4",
      "4,0,4",
      "1,1,1",
      "2,1,1",
      "3,1,1",
      "1,1,2",
      "2,1,2",
      "3,1,2",
      "1,1,3",
      "2,1,3",
      "3,1,3",
      "2,2,2",
    ];
    expect([...roofCells(roof, false)].map(cellKey)).toEqual(expected);
    expect([...roofCells(roof, true)].map(cellKey)).toEqual(
      expected.filter((key) => key !== "2,1,2"),
    );
  });
});

describe("stair roof", () => {
  it("insets every layer by one cell per step on the sloped axes", () => {
    fc.assert(
      fc.property(stairSpec, (roof) => {
        const { min, max } = roof.base;
        const { x: sx, z: sz } = sizeOf(roof.base);
        expect(roof.height).toBe(Math.ceil(Math.min(sx, sz) / 2));

        const solid = [...roofCells(roof, false)];
        for (let layer = 0; layer < roof.height; layer++) {
          const y = min.y + layer;
          const dx = roof.kind === "gable" && sx >= sz ? 0 : layer;
          const dz = roof.kind === "gable" && sz > sx ? 0 : layer;
          const expected = cellsOf({
            min: { x: min.x + dx, y, z: min.z + dz },
            max: { x: max.x - dx, y, z: max.z - dz },
          });
          expect(solid.filter((cell) => cell.y === y)).toEqual([...expected]);
        }
      }),
    );
  });

  it("descends toward the nearest sloped edge and gives only odd spans a ridge", () => {
    fc.assert(
      fc.property(stairSpec, (roof) => {
        const { min, max } = roof.base;
        const { x: sx, z: sz } = sizeOf(roof.base);

        for (const cell of roofCells(roof, false)) {
          const layer = cell.y - min.y;
          const slope = roofSlopeAt(roof, cell);
          if (layer === roof.height - 1 && Math.min(sx, sz) % 2 === 1) {
            expect(slope).toEqual({ kind: "ridge" });
            continue;
          }

          const sides: [Facing, number][] = [];
          if (roof.kind === "hip" || sx < sz) {
            sides.push(["west", cell.x - min.x], ["east", max.x - cell.x]);
          }
          if (roof.kind === "hip" || sx >= sz) {
            sides.push(["north", cell.z - min.z], ["south", max.z - cell.z]);
          }
          const [nearest] = sides.sort((a, b) => a[1] - b[1]);
          expect(slope).toEqual({ kind: "slope", descends: nearest?.[0] });
        }
      }),
    );
  });

  it("opens the eaves of Hollow while retaining the perimeter and top layer", () => {
    fc.assert(
      fc.property(stairSpec, (roof) => {
        const { min, max } = roof.base;
        const solid = [...roofCells(roof, false)];
        const hollow = [...roofCells(roof, true)];
        const baseLayer = solid.filter((cell) => cell.y === min.y);
        expect(hollow.filter((cell) => cell.y === min.y)).toEqual(
          roof.height === 1
            ? baseLayer
            : baseLayer.filter(
                ({ x, z }) =>
                  x === min.x || x === max.x || z === min.z || z === max.z,
              ),
        );
        const topY = min.y + roof.height - 1;
        expect(hollow.filter((cell) => cell.y === topY)).toEqual(
          solid.filter((cell) => cell.y === topY),
        );
      }),
    );
  });

  it.each(["fill", "hollow"] as const)(
    "enumerates and counts the stair %s through heighted placement",
    (fill) => {
      fc.assert(
        fc.property(stairSpec, (roof) => {
          const spec = { ...roof, roofStyle: roof.style };
          const placement = placementOf(roof.kind);
          const hollow = fill === "hollow";
          const cells = [...roofCells(roof, hollow)];
          expect(roofCount(roof, hollow)).toBe(cells.length);
          expect([...placement.cells(spec, fill)]).toEqual(cells);
          expect(placement.count(spec, fill)).toBe(cells.length);
        }),
      );
    },
  );
});
