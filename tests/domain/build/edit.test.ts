import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AIR,
  type BlockState,
  blockStateOf,
  type StateValue,
} from "../../../src/domain/build/blockState";
import { boxOf, cellsOf, contains } from "../../../src/domain/build/box";
import {
  clipboardOf,
  pasteBox,
} from "../../../src/domain/build/clipboard/clipboard";
import {
  type AppliedChange,
  invertChange,
  undoPlan,
} from "../../../src/domain/build/edit/change";
import {
  BUILD_KEPT_BLOCKS,
  isKeptState,
} from "../../../src/domain/build/edit/guard";
import { type Mask, matches } from "../../../src/domain/build/edit/pattern";
import {
  planFill,
  planPaste,
  planReplace,
} from "../../../src/domain/build/edit/plan";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { KEPT_BLOCKS } from "../../../src/domain/shared/keptBlocks";

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

// A deterministic world: the state at a cell comes from a hash of its key.
const worldRead = (states: readonly BlockState[]) => (c: Cell) =>
  states[Math.abs(c.x * 31 + c.y * 17 + c.z * 7) % states.length];

describe("Mask", () => {
  it("matches on type and only the listed states", () => {
    fc.assert(
      fc.property(stateArb, (state) => {
        expect(matches({ typeId: state.typeId }, state)).toBe(true);
        expect(
          matches({ typeId: state.typeId, states: state.states }, state),
        ).toBe(true);
        expect(matches({ typeId: `${state.typeId}_x` }, state)).toBe(false);
        const other: Mask = { typeId: state.typeId, states: { nope: 1 } };
        expect(matches(other, state)).toBe(false);
      }),
    );
  });
});

describe("edit planning", () => {
  it("fill yields exactly the box cells with the pattern", () => {
    fc.assert(
      fc.property(smallBox, stateArb, (box, state) => {
        const plan = [...planFill(box, { state })];
        expect(keys(plan.map((c) => c.cell))).toEqual(keys(cellsOf(box)));
        expect(plan.every((c) => c.after === state)).toBe(true);
      }),
    );
  });

  it("replace yields exactly the cells whose read matches the mask", () => {
    fc.assert(
      fc.property(
        smallBox,
        fc.array(stateArb, { minLength: 1, maxLength: 4 }),
        stateArb,
        (box, states, state) => {
          const read = worldRead(states);
          const mask: Mask = { typeId: "minecraft:stone" };
          const plan = [...planReplace(box, mask, { state }, read)];
          const expected = [...cellsOf(box)].filter((c) => {
            const s = read(c);
            return s !== undefined && matches(mask, s);
          });
          expect(keys(plan.map((c) => c.cell))).toEqual(keys(expected));
        },
      ),
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
          for (const c of changes)
            expect(invertChange(invertChange(c))).toEqual(c);
          const world = new Map(changes.map((c) => [cellKey(c.cell), c.after]));
          const record = { dimensionId: asDimensionId("overworld"), changes };
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

describe("clipboard", () => {
  const states = [
    blockStateOf("minecraft:stone"),
    blockStateOf("minecraft:chest"),
    AIR,
    blockStateOf("minecraft:oak_stairs", { facing: "north" }),
  ];
  const read = worldRead(states);

  it("pastes one change per clipboard cell inside the paste box, and skipAir drops air", () => {
    fc.assert(
      fc.property(smallBox, smallCell, smallCell, (box, feet, target) => {
        const clip = clipboardOf(box, feet, read);
        const all = [...planPaste(clip, target, false)];
        expect(all).toHaveLength(clip.cells.length);
        const into = pasteBox(clip, target);
        expect(all.every((c) => contains(into, c.cell))).toBe(true);
        const noAir = [...planPaste(clip, target, true)];
        expect(noAir.some((c) => c.after.typeId === AIR.typeId)).toBe(false);
        expect(noAir).toHaveLength(
          all.filter((c) => c.after.typeId !== AIR.typeId).length,
        );
      }),
    );
  });

  it("copy then paste at the same feet reproduces every non-kept cell", () => {
    fc.assert(
      fc.property(smallBox, smallCell, (box, feet) => {
        const clip = clipboardOf(box, feet, read);
        const plan = new Map(
          [...planPaste(clip, feet, false)].map((c) => [
            cellKey(c.cell),
            c.after,
          ]),
        );
        for (const cell of cellsOf(box)) {
          const state = read(cell) as BlockState;
          if (isKeptState(state)) expect(plan.has(cellKey(cell))).toBe(false);
          else expect(plan.get(cellKey(cell))).toBe(state);
        }
      }),
    );
  });

  it("leaves out cells that read undefined", () => {
    const clip = clipboardOf(
      boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
      {
        x: 0,
        y: 0,
        z: 0,
      },
      () => undefined,
    );
    expect(clip.cells).toEqual([]);
    expect(clip.size).toEqual({ x: 2, y: 1, z: 1 });
  });
});

describe("guard", () => {
  const editable = [
    "minecraft:air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
  ];
  it("keeps every listed block except air and fluids", () => {
    for (const id of [...KEPT_BLOCKS, ...BUILD_KEPT_BLOCKS])
      expect(isKeptState(blockStateOf(id)), id).toBe(!editable.includes(id));
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
