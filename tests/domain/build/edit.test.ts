import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BlockState,
  blockStateOf,
  type StateValue,
} from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import {
  type AppliedChange,
  undoPlan,
} from "../../../src/domain/build/edit/change";
import {
  BUILD_KEPT_BLOCKS,
  isKeptState,
} from "../../../src/domain/build/edit/guard";
import { planHeighted, planShape } from "../../../src/domain/build/edit/plan";
import { roofCount } from "../../../src/domain/build/roof/roof";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { PLACE_KEPT_BLOCKS } from "../../../src/domain/shared/keptBlocks";

const smallCell = fc.record({
  x: fc.integer({ min: -5, max: 5 }),
  y: fc.integer({ min: -5, max: 5 }),
  z: fc.integer({ min: -5, max: 5 }),
});
const smallBox = fc.tuple(smallCell, smallCell).map(([a, b]) => boxOf(a, b));
const stateArb: fc.Arbitrary<BlockState> = fc
  .tuple(
    fc.constantFrom("minecraft:stone", "minecraft:dirt", "minecraft:air"),
    fc.constantFrom<Record<string, StateValue>>(
      {},
      { facing: "north" },
      { facing: "south", lit: true },
    ),
  )
  .map(([id, states]) => blockStateOf(id, states));
const keys = (cells: Iterable<Cell>) => [...cells].map(cellKey).sort();

describe("edit planning", () => {
  it("fill yields exactly the box cells with the pattern", () => {
    fc.assert(
      fc.property(smallBox, stateArb, (box, state) => {
        const plan = [...planShape({ kind: "box", box }, "fill", { state })];
        expect(keys(plan.map((c) => c.cell))).toEqual(keys(cellsOf(box)));
        expect(plan.every((c) => c.after === state)).toBe(true);
      }),
    );
  });

  it("undo gives back the before states and invert twice is identity", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(smallCell, { selector: cellKey, maxLength: 20 }),
        fc.array(fc.tuple(stateArb, stateArb), {
          minLength: 20,
          maxLength: 20,
        }),
        (cells, pairs) => {
          const changes: AppliedChange[] = cells.map((cell, i) => ({
            cell,
            before: (pairs[i] as [BlockState, BlockState])[0],
            after: (pairs[i] as [BlockState, BlockState])[1],
          }));
          const world = new Map(changes.map((c) => [cellKey(c.cell), c.after]));
          const record = { dimensionId: asDimensionId("overworld"), changes };
          expect(undoPlan(record)).toEqual(
            [...changes].reverse().map((c) => ({
              cell: c.cell,
              after: c.before,
              expected: c.after,
            })),
          );
          for (const p of undoPlan(record)) world.set(cellKey(p.cell), p.after);
          for (const c of changes)
            expect(world.get(cellKey(c.cell))).toBe(c.before);
          expect(undoPlan(record).map((p) => cellKey(p.cell))).toEqual(
            changes.map((c) => cellKey(c.cell)).reverse(),
          );
        },
      ),
    );
  });
});

describe("guard", () => {
  const open = [
    "minecraft:air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
  ];
  it("keeps every listed block except air and fluids", () => {
    for (const id of [...PLACE_KEPT_BLOCKS, ...BUILD_KEPT_BLOCKS])
      expect(isKeptState(blockStateOf(id)), id).toBe(true);
    for (const id of open)
      expect(isKeptState(blockStateOf(id)), id).toBe(false);
  });
  it("keeps data blocks regardless of their states", () => {
    expect(
      isKeptState(
        blockStateOf("minecraft:standing_sign", { ground_sign_direction: 3 }),
      ),
    ).toBe(true);
    expect(isKeptState(blockStateOf("minecraft:stone"))).toBe(false);
  });
});

it("roof plans have exactly the roof count and selected material", () => {
  fc.assert(
    fc.property(
      smallBox,
      fc.integer({ min: 1, max: 12 }),
      fc.constantFrom("gable" as const, "hip" as const),
      fc.boolean(),
      stateArb,
      (box, height, kind, hollow, state) => {
        const spec = {
          base: boxOf(box.min, { ...box.max, y: box.min.y }),
          height,
          kind,
        };
        const plan = [
          ...planHeighted(spec, hollow ? "hollow" : "fill", { state }),
        ];
        expect(plan).toHaveLength(roofCount(spec, hollow));
        expect(plan.every((change) => change.after === state)).toBe(true);
      },
    ),
  );
});
