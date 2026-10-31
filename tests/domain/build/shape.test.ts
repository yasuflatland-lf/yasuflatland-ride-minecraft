import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf, contains } from "../../../src/domain/build/box";
import { planShape } from "../../../src/domain/build/edit/plan";
import {
  cellsOfShape,
  type Shape,
  type ShapeStyle,
  shapeCount,
  shapeOf,
  stylesFor,
} from "../../../src/domain/build/shape/shape";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";

const axes = ["x", "y", "z"] as const;
const axisArb = fc.constantFrom(...axes);
const coord = fc.integer({ min: -4, max: 4 });
const cell = fc.record({ x: coord, y: coord, z: coord });
const anyCell = fc.record({
  x: fc.integer(),
  y: fc.integer(),
  z: fc.integer(),
});
const styles: ShapeStyle[] = ["fill", "frame", "faces", "walls"];
const keys = (cells: Iterable<Cell>) => [...cells].map(cellKey).sort();
const smallShape = fc.tuple(cell, cell).map(([a, b]) => shapeOf(a, b));
const pattern = {
  state: blockStateOf("minecraft:stone", { variant: "granite" }),
};

describe("Shape", () => {
  it("derives its kind and available styles from the differing axes", () => {
    fc.assert(
      fc.property(
        anyCell,
        anyCell,
        fc.subarray([...axes]),
        (a, other, differing) => {
          const b = { ...a };
          for (const axis of differing) {
            b[axis] = other[axis] === a[axis] ? a[axis] + 1 : other[axis];
          }
          const shape = shapeOf(a, b);
          const kind =
            differing.length === 1
              ? "line"
              : differing.length === 2
                ? "rect"
                : "box";
          expect(shape.kind).toBe(kind);
          expect(stylesFor(shape)).toEqual(
            kind === "line"
              ? ["fill"]
              : kind === "rect"
                ? ["fill", "frame"]
                : ["fill", "faces", "walls"],
          );
          if (shape.kind === "rect") {
            expect(a[shape.flat]).toBe(b[shape.flat]);
            expect(shape.box).toEqual(boxOf(a, b));
          }
          if (shape.kind === "box") expect(shape.box).toEqual(boxOf(a, b));
          if (shape.kind === "line")
            expect(shape).toEqual({ kind: "line", from: a, to: b });
        },
      ),
    );
  });

  it("counts distinct cells inside the bounds, with hollow styles contained in fill", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const shape = shapeOf(a, b);
        const box = boxOf(a, b);
        const fill = new Set(keys(cellsOfShape(shape, "fill")));
        expect([...cellsOfShape(shape, "fill")]).toEqual([...cellsOf(box)]);
        for (const style of stylesFor(shape)) {
          const cells = [...cellsOfShape(shape, style)];
          expect(shapeCount(shape, style)).toBe(cells.length);
          expect(new Set(cells.map(cellKey)).size).toBe(cells.length);
          expect(
            cells.every((c) => contains(box, c) && fill.has(cellKey(c))),
          ).toBe(true);
          expect(keys(cells)).toEqual(keys(cellsOfShape(shapeOf(b, a), style)));
        }
      }),
    );
  });

  it("selects exactly the boundary cells for each hollow style", () => {
    fc.assert(
      fc.property(cell, cell, axisArb, (a, b, flat) => {
        const box = boxOf(a, b);
        const plate = boxOf(a, { ...b, [flat]: a[flat] });
        const shapes: Exclude<Shape, { kind: "line" }>[] = [
          { kind: "box", box },
          { kind: "rect", box: plate, flat },
        ];
        for (const shape of shapes) {
          for (const style of stylesFor(shape)) {
            const expected = [...cellsOf(shape.box)].filter(
              (c) =>
                style === "fill" ||
                axes.some((axis) => {
                  if (style === "frame" && axis === flat) return false;
                  if (style === "walls" && axis === "y") return false;
                  return (
                    c[axis] === shape.box.min[axis] ||
                    c[axis] === shape.box.max[axis]
                  );
                }),
            );
            expect([...cellsOfShape(shape, style)]).toEqual(expected);
            expect(shapeCount(shape, style)).toBe(expected.length);
          }
        }
      }),
    );
  });

  it("falls back to fill for unsupported styles", () => {
    fc.assert(
      fc.property(smallShape, (shape) => {
        for (const style of styles.filter(
          (s) => !stylesFor(shape).includes(s),
        )) {
          expect([...cellsOfShape(shape, style)]).toEqual([
            ...cellsOfShape(shape, "fill"),
          ]);
          expect(shapeCount(shape, style)).toBe(shapeCount(shape, "fill"));
        }
      }),
    );
  });

  it("makes lines axis-aligned and contiguous in either endpoint order", () => {
    fc.assert(
      fc.property(
        cell,
        axisArb,
        fc.integer({ min: 1, max: 8 }),
        fc.boolean(),
        (a, axis, length, reverse) => {
          const b = { ...a, [axis]: a[axis] + (reverse ? -length : length) };
          const shape = shapeOf(a, b);
          expect(shape.kind).toBe("line");
          const cells = [...cellsOfShape(shape, "fill")];
          expect(cells).toHaveLength(length + 1);
          cells.forEach((c, i) => {
            expect(c[axis]).toBe(Math.min(a[axis], b[axis]) + i);
            for (const fixed of axes.filter((v) => v !== axis))
              expect(c[fixed]).toBe(a[fixed]);
          });
        },
      ),
    );
  });

  it("fills hollow shapes when a relevant dimension leaves no interior", () => {
    fc.assert(
      fc.property(
        cell,
        axisArb,
        fc.integer({ min: 1, max: 2 }),
        fc.integer({ min: 3, max: 7 }),
        (a, thin, width, size) => {
          const b = {
            x: a.x + size - 1,
            y: a.y + size - 1,
            z: a.z + size - 1,
            [thin]: a[thin] + width - 1,
          };
          const box: Shape = { kind: "box", box: boxOf(a, b) };
          expect(keys(cellsOfShape(box, "faces"))).toEqual(
            keys(cellsOfShape(box, "fill")),
          );
          if (thin !== "y")
            expect(keys(cellsOfShape(box, "walls"))).toEqual(
              keys(cellsOfShape(box, "fill")),
            );
          for (const flat of axes.filter((axis) => axis !== thin)) {
            const rect: Shape = {
              kind: "rect",
              flat,
              box: boxOf(a, { ...b, [flat]: a[flat] }),
            };
            expect(keys(cellsOfShape(rect, "frame"))).toEqual(
              keys(cellsOfShape(rect, "fill")),
            );
          }
        },
      ),
    );
  });

  it("counts a 3x3x3 box and excludes floor and ceiling interiors from walls", () => {
    const shape = shapeOf({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
    expect(shapeCount(shape, "fill")).toBe(27);
    expect(shapeCount(shape, "faces")).toBe(26);
    expect(shapeCount(shape, "walls")).toBe(24);
    expect([...cellsOfShape(shape, "walls")]).not.toContainEqual({
      x: 1,
      y: 0,
      z: 1,
    });
    expect([...cellsOfShape(shape, "walls")]).not.toContainEqual({
      x: 1,
      y: 2,
      z: 1,
    });
  });

  it("frames a 4x1x5 horizontal plate with 14 cells", () => {
    const shape = shapeOf({ x: 0, y: 7, z: 0 }, { x: 3, y: 7, z: 4 });
    expect(shape.kind === "rect" && shape.flat).toBe("y");
    expect(shapeCount(shape, "fill")).toBe(20);
    expect(shapeCount(shape, "frame")).toBe(14);
    expect([...cellsOfShape(shape, "frame")]).toHaveLength(14);
  });
});

describe("shape planning", () => {
  it("preserves shape order and applies the pattern to every planned cell", () => {
    fc.assert(
      fc.property(smallShape, (shape) => {
        for (const style of styles) {
          const plan = [...planShape(shape, style, pattern)];
          expect(plan.map((change) => change.cell)).toEqual([
            ...cellsOfShape(shape, style),
          ]);
          expect(plan.every((change) => change.after === pattern.state)).toBe(
            true,
          );
        }
      }),
    );
  });

  it("counts a huge shape and consumes only the requested prefix of its cells and plan", () => {
    const shape = shapeOf({ x: 0, y: 0, z: 0 }, { x: 999_999_999, y: 9, z: 9 });
    expect(shapeCount(shape, "fill")).toBe(100_000_000_000);
    expect(shapeCount(shape, "faces")).toBe(36_000_000_128);
    const cells = cellsOfShape(shape, "fill")[Symbol.iterator]();
    const plan = planShape(shape, "fill", pattern)[Symbol.iterator]();
    for (let x = 0; x < 3; x++) {
      expect(cells.next().value).toEqual({ x, y: 0, z: 0 });
      expect(plan.next().value).toEqual({
        cell: { x, y: 0, z: 0 },
        after: pattern.state,
      });
    }
  });
});
