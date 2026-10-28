import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
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
  stepMode,
} from "../../../src/domain/build/mode";
import { BuildSession, isEditRefusal } from "../../../src/domain/build/session";
import type { BuildSessionRepository } from "../../../src/domain/build/sessionRepository";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const dim = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone", {});

const recordArb: fc.Arbitrary<EditRecord> = fc
  .integer({ min: 1, max: 50 })
  .map((n) => ({
    dimensionId: dim,
    changes: [{ cell: { x: n, y: 0, z: 0 }, before: AIR, after: stone }],
  }));
const inputArb = fc.record({ riding: fc.boolean(), holding: fc.boolean() });
const run = (
  inputs: { riding: boolean; holding: boolean }[],
  from = MODE_OFF,
) => inputs.reduce<BuildMode>(stepMode, from);

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
  it("does not turn on before modeEnterTicks of riding and holding", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: BUILD_SPEC.modeEnterTicks - 1 }),
        (n) => {
          const held = { riding: true, holding: true };
          expect(run(Array(n).fill(held)).active).toBe(false);
          expect(run(Array(BUILD_SPEC.modeEnterTicks).fill(held)).active).toBe(
            true,
          );
        },
      ),
    );
  });

  it("turns off at once when not riding", () => {
    fc.assert(
      fc.property(
        fc.array(inputArb, { maxLength: 30 }),
        fc.boolean(),
        (inputs, holding) => {
          const mode = run(inputs);
          expect(stepMode(mode, { riding: false, holding })).toEqual(MODE_OFF);
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
              riding: true,
              holding: true,
            }),
          );
          const after = run(
            [
              ...Array(flick).fill({ riding: true, holding: false }),
              { riding: true, holding: true },
            ],
            on,
          );
          expect(after.active).toBe(true);
        },
      ),
    );
  });

  it("turns off after modeLeaveTicks without holding", () => {
    const on = run(
      Array(BUILD_SPEC.modeEnterTicks).fill({ riding: true, holding: true }),
    );
    const off = run(
      Array(BUILD_SPEC.modeLeaveTicks).fill({ riding: true, holding: false }),
      on,
    );
    expect(off.active).toBe(false);
  });
});

describe("BuildSession", () => {
  const session = () => new BuildSession(asPlayerId("p1"));
  const record = (n: number): EditRecord => ({
    dimensionId: dim,
    changes: [{ cell: { x: n, y: 0, z: 0 }, before: AIR, after: stone }],
  });

  it("refuses busy on a second beginEdit without finishEdit", () => {
    const s = session();
    expect(s.beginEdit()).toBeUndefined();
    expect(s.beginEdit()).toBe("busy");
    expect(s.takeUndo()).toBe("busy");
    s.finishEdit(record(1), false);
    expect(s.beginEdit()).toBeUndefined();
  });

  it("leaves the history unchanged when finishing an undo", () => {
    const s = session();
    s.beginEdit();
    s.finishEdit(record(1), false);
    s.beginEdit();
    s.finishEdit(record(2), true);
    expect(s.takeUndo()).toEqual(record(1));
    expect(s.takeUndo()).toBe("nothingToUndo");
  });

  it("refuses tooLarge exactly when the volume exceeds the limit", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 300 }),
        (x, y, z, limit) => {
          const s = session();
          expect(s.editableBox(limit)).toBe("noSelection");
          s.setCorner("pos1", dim, { x: 0, y: 0, z: 0 });
          s.setCorner("pos2", dim, { x: x - 1, y: y - 1, z: z - 1 });
          const result = s.editableBox(limit);
          if (x * y * z > limit) expect(result).toBe("tooLarge");
          else {
            expect(isEditRefusal(result)).toBe(false);
            expect(result).toEqual(
              boxOf({ x: 0, y: 0, z: 0 }, { x: x - 1, y: y - 1, z: z - 1 }),
            );
          }
        },
      ),
    );
  });

  it("reports when build mode turns on", () => {
    const s = session();
    const input = { riding: true, holding: true };
    const flips = Array.from({ length: BUILD_SPEC.modeEnterTicks }, () =>
      s.tickMode(input),
    );
    expect(flips.filter(Boolean)).toHaveLength(1);
    expect(s.isInBuildMode).toBe(true);
  });
});

describe("BuildSessionRepository", () => {
  const inMemory = (): BuildSessionRepository => {
    const map = new Map<string, BuildSession>();
    return {
      get: (id) => map.get(id),
      getOrCreate: (id) => {
        const found = map.get(id);
        if (found) return found;
        const created = new BuildSession(id);
        map.set(id, created);
        return created;
      },
      remove: (id) => void map.delete(id),
      ids: () => [...map.keys()].map(asPlayerId),
    };
  };

  it("creates a session on first use and keeps it until removed", () => {
    const repo = inMemory();
    const id = asPlayerId("p1");
    expect(repo.get(id)).toBeUndefined();
    const first = repo.getOrCreate(id);
    expect(repo.getOrCreate(id)).toBe(first);
    expect(repo.ids()).toEqual([id]);
    repo.remove(id);
    expect(repo.get(id)).toBeUndefined();
  });
});
