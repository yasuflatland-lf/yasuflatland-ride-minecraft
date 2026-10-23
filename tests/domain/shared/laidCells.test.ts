import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellKey } from "../../../src/domain/shared/cells";
import {
  type LaidCell,
  relayCells,
} from "../../../src/domain/shared/laidCells";
import { defined } from "../../support/defined";

const block = fc.record({
  kind: fc.constantFrom("a", "b", "c"),
  n: fc.integer({ min: 0, max: 3 }),
});
type Block = { kind: "a" | "b" | "c"; n: number };
const same = (a: Block, b: Block) => a.kind === b.kind && a.n === b.n;
const cell = fc.record({
  x: fc.integer({ min: -3, max: 3 }),
  y: fc.integer({ min: -3, max: 3 }),
  z: fc.integer({ min: -3, max: 3 }),
  block,
});
const cells = fc.uniqueArray(cell, { selector: cellKey });
describe("relayCells (ADR 0063)", () => {
  it("clears only unwanted cells and places exactly new or changed cells", () => {
    fc.assert(
      fc.property(cells, cells, (laid, wanted) => {
        const { clear, place } = relayCells(laid, wanted, same);
        expect(clear).toEqual(
          laid.filter((c) => !wanted.some((w) => cellKey(w) === cellKey(c))),
        );
        expect(place).toEqual(
          wanted.filter(
            (c) =>
              !laid.some(
                (l) => cellKey(l) === cellKey(c) && same(l.block, c.block),
              ),
          ),
        );
        const after = new Map(laid.map((c) => [cellKey(c), c.block]));
        for (const c of clear) after.delete(cellKey(c));
        for (const c of place) after.set(cellKey(c), c.block);
        expect(after).toEqual(
          new Map(wanted.map((c) => [cellKey(c), c.block])),
        );
      }),
    );
  });

  it("places a laid cell again exactly when the lost predicate reports it, and clears the same cells (ADR 0096)", () => {
    fc.assert(
      fc.property(
        cells,
        cells,
        fc.func(fc.boolean()),
        (laid, wanted, isLost) => {
          const { clear, place } = relayCells(laid, wanted, same, isLost);
          expect(clear).toEqual(relayCells(laid, wanted, same).clear);
          expect(place).toEqual(
            wanted.filter((c) => {
              const l = laid.find((x) => cellKey(x) === cellKey(c));
              return l === undefined || !same(l.block, c.block) || isLost(l);
            }),
          );
        },
      ),
    );
  });

  it("asks the lost predicate only about laid cells (ADR 0096)", () => {
    fc.assert(
      fc.property(cells, cells, (laid, wanted) => {
        const asked: LaidCell<Block>[] = [];
        relayCells(laid, wanted, same, (c) => {
          asked.push(c);
          return true;
        });
        for (const arg of asked) expect(laid.includes(arg)).toBe(true);
      }),
    );
  });

  it("places again every laid cell that is lost, and nothing else, for an unchanged dock (ADR 0096)", () => {
    fc.assert(
      fc.property(cells, fc.array(fc.boolean()), (laid, flags) => {
        const lostKeys = new Set(
          laid.filter((_, i) => flags[i] === true).map(cellKey),
        );
        expect(
          relayCells(laid, laid, same, (c) => lostKeys.has(cellKey(c))),
        ).toEqual({
          clear: [],
          place: laid.filter((c) => lostKeys.has(cellKey(c))),
        });
      }),
    );
  });

  it("does no work for an unchanged dock, regardless of cell order", () => {
    fc.assert(
      fc.property(cells, (laid) => {
        expect(relayCells(laid, [...laid].reverse(), same)).toEqual({
          clear: [],
          place: [],
        });
      }),
    );
  });

  it("replaces cells whose blocks differ without clearing them", () => {
    fc.assert(
      fc.property(cells, block, (laid, replacement) => {
        const wanted = laid.map((c) => ({ ...c, block: replacement }));
        expect(relayCells(laid, wanted, same)).toEqual({
          clear: [],
          place: wanted.filter(
            (c, i) => !same(c.block, defined(laid[i], "laid cell").block),
          ),
        });
      }),
    );
  });

  it("compares only laid and wanted blocks at the same key", () => {
    fc.assert(
      fc.property(cells, cells, (laid, wanted) => {
        relayCells(laid, wanted, (a, b) => {
          expect(
            laid.some(
              (l) =>
                l.block === a &&
                wanted.some((w) => w.block === b && cellKey(l) === cellKey(w)),
            ),
          ).toBe(true);
          return same(a, b);
        });
      }),
    );
  });
});
