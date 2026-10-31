import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import type { EditRecord } from "../../../src/domain/build/edit/change";
import {
  EMPTY_HISTORY,
  takeLast,
  type UndoHistory,
  withRecord,
} from "../../../src/domain/build/history/history";
import {
  type BuildMode,
  MODE_OFF,
  type ModeInput,
  stepMode,
} from "../../../src/domain/build/mode";
import { BuildSession } from "../../../src/domain/build/session";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const dim = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone", {});

const recordAt = (x: number): EditRecord => ({
  dimensionId: dim,
  changes: [{ cell: { x, y: 0, z: 0 }, before: AIR, after: stone }],
});
const recordArb = fc.integer({ min: 1, max: 50 }).map(recordAt);
const run = (inputs: ModeInput[], from = MODE_OFF) =>
  inputs.reduce<BuildMode>(stepMode, from);

describe("undo history", () => {
  it("never exceeds depth and keeps the newest records in order", () => {
    fc.assert(
      fc.property(
        fc.array(recordArb, { maxLength: 40 }),
        fc.integer({ min: 1, max: 12 }),
        (records, depth) => {
          const h = records.reduce<UndoHistory>(
            (acc, r) => withRecord(acc, r, depth),
            EMPTY_HISTORY,
          );
          expect(h.records.length).toBeLessThanOrEqual(depth);
          expect(h.records).toEqual(records.slice(-depth));
        },
      ),
    );
  });

  it("takeLast returns the record just added", () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 5 }), recordArb, (rs, r) => {
        const h = rs.reduce<UndoHistory>(
          (acc, x) => withRecord(acc, x, 10),
          EMPTY_HISTORY,
        );
        const taken = takeLast(withRecord(h, r, 10));
        expect(taken.record).toBe(r);
        expect(taken.rest).toEqual(h);
      }),
    );
  });

  it("does not add an empty record", () => {
    const empty: EditRecord = { dimensionId: dim, changes: [] };
    expect(withRecord(EMPTY_HISTORY, empty, 10)).toBe(EMPTY_HISTORY);
  });
});

describe("build mode", () => {
  it("does not turn on before modeEnterTicks of holding", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: BUILD_SPEC.modeEnterTicks - 1 }),
        (n) => {
          const held = { holding: true };
          expect(run(Array(n).fill(held)).active).toBe(false);
          expect(run(Array(BUILD_SPEC.modeEnterTicks).fill(held)).active).toBe(
            true,
          );
        },
      ),
    );
  });

  it("stays on through a hotbar flick shorter than modeLeaveTicks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: BUILD_SPEC.modeLeaveTicks - 1 }),
        (flick) => {
          const on = run(
            Array(BUILD_SPEC.modeEnterTicks).fill({
              holding: true,
            }),
          );
          const after = run(
            [...Array(flick).fill({ holding: false }), { holding: true }],
            on,
          );
          expect(after.active).toBe(true);
        },
      ),
    );
  });

  it("turns off after modeLeaveTicks without holding", () => {
    const on = run(Array(BUILD_SPEC.modeEnterTicks).fill({ holding: true }));
    const off = run(
      Array(BUILD_SPEC.modeLeaveTicks).fill({ holding: false }),
      on,
    );
    expect(off.active).toBe(false);
  });
});

describe("BuildSession", () => {
  const session = () => new BuildSession(asPlayerId("p1"));

  it("refuses busy on a second beginEdit without finishEdit", () => {
    const s = session();
    expect(s.beginEdit()).toBeUndefined();
    expect(s.beginEdit()).toBe("busy");
    expect(s.takeUndo()).toBe("busy");
    s.finishEdit(recordAt(1), false);
    expect(s.beginEdit()).toBeUndefined();
  });

  it("leaves the history unchanged when finishing an undo", () => {
    const s = session();
    s.beginEdit();
    s.finishEdit(recordAt(1), false);
    s.beginEdit();
    s.finishEdit(recordAt(2), true);
    expect(s.takeUndo()).toEqual(recordAt(1));
    expect(s.takeUndo()).toBe("nothingToUndo");
  });

  it("reports when build mode turns on", () => {
    const s = session();
    const input = { holding: true };
    const flips = Array.from({ length: BUILD_SPEC.modeEnterTicks }, () =>
      s.tickMode(input),
    );
    expect(flips.filter(Boolean)).toHaveLength(1);
    expect(s.isInBuildMode).toBe(true);
  });
});
