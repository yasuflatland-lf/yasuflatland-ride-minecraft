import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blockStateOf } from "../../../../src/domain/build/blockState";
import {
  decideWrite,
  tallyWrite,
} from "../../../../src/domain/build/edit/decideWrite";
import { cellOf } from "../../../../src/domain/shared/cells";

describe.each([
  { kind: "undoable", skippedOnFailure: 0, recordsWrite: true },
  { kind: "undo", skippedOnFailure: 1, recordsWrite: false },
  { kind: "irreversible", skippedOnFailure: 0, recordsWrite: false },
] as const)("$kind cell edit", ({ kind, skippedOnFailure, recordsWrite }) => {
  it("decides writes before querying world protection", () => {
    fc.assert(
      fc.property(fc.integer(), fc.boolean(), (direction, allowed) => {
        const cell = cellOf({ x: direction, y: 64, z: 0 });
        const before = blockStateOf("minecraft:oak_stairs", {
          direction,
          "minecraft:corner": "straight",
        });
        const differentCorner = blockStateOf(before.typeId, {
          direction,
          "minecraft:corner": "inner_left",
        });
        const differentDirection = blockStateOf(before.typeId, {
          ...before.states,
          direction: direction + 1,
        });
        const differentType = blockStateOf(
          "minecraft:brick_stairs",
          before.states,
        );
        const kept = blockStateOf("minecraft:standing_sign");
        const guardedDecision = allowed ? "write" : "skip";

        const cases = [
          {
            current: undefined,
            after: before,
            expected: undefined,
            decision: "skip",
            checks: 0,
          },
          {
            current: undefined,
            after: before,
            expected: before,
            decision: "skip",
            checks: 0,
          },
          {
            current: before,
            after: before,
            expected: undefined,
            decision: "unchanged",
            checks: 0,
          },
          {
            current: before,
            after: before,
            expected: differentDirection,
            decision: "unchanged",
            checks: 0,
          },
          {
            current: before,
            after: differentCorner,
            expected: differentDirection,
            decision: "conflict",
            checks: 0,
          },
          {
            current: before,
            after: differentDirection,
            expected: differentType,
            decision: "conflict",
            checks: 0,
          },
          {
            current: kept,
            after: before,
            expected: differentType,
            decision: "conflict",
            checks: 0,
          },
          {
            current: kept,
            after: kept,
            expected: kept,
            decision: "unchanged",
            checks: 0,
          },
          {
            current: kept,
            after: before,
            expected: kept,
            decision: "skip",
            checks: 0,
          },
          {
            current: before,
            after: kept,
            expected: undefined,
            decision: guardedDecision,
            checks: 1,
          },
          {
            current: before,
            after: differentCorner,
            expected: differentCorner,
            decision: guardedDecision,
            checks: 1,
          },
          {
            current: before,
            after: differentDirection,
            expected: before,
            decision: guardedDecision,
            checks: 1,
          },
        ];

        for (const { current, after, expected, decision, checks } of cases) {
          let protectionChecks = 0;
          const result = decideWrite(
            current,
            { cell, after, expected },
            kind,
            () => {
              protectionChecks++;
              return allowed;
            },
          );
          expect(result).toBe(decision);
          expect(protectionChecks).toBe(checks);
        }
      }),
    );
  });

  it("counts each outcome and records successful undoable writes", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (x, z) => {
        const before = blockStateOf("minecraft:stone");
        const after = blockStateOf("minecraft:dirt");
        const change = { cell: cellOf({ x, y: 64, z }), after };
        expect(tallyWrite(kind, "skip", change, undefined)).toEqual({
          changed: 0,
          skipped: skippedOnFailure,
        });
        expect(tallyWrite(kind, "conflict", change, before)).toEqual({
          changed: 0,
          skipped: 1,
        });
        expect(tallyWrite(kind, "unchanged", change, before)).toEqual({
          changed: 0,
          skipped: 0,
        });
        expect(tallyWrite(kind, "written", change, before)).toEqual({
          changed: 1,
          skipped: 0,
          applied: recordsWrite ? { ...change, before } : undefined,
        });
      }),
    );
  });
});
