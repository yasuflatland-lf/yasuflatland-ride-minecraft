import type { Cell } from "../../shared/cells";
import { type Box, boxOf, cellsOf, contains, volume } from "../box";

export type Shape =
  | { kind: "line"; from: Cell; to: Cell }
  | { kind: "rect"; box: Box; flat: "x" | "y" | "z" }
  | { kind: "box"; box: Box };

export type ShapeStyle = "fill" | "frame" | "faces" | "walls";

const axes = ["x", "y", "z"] as const;

export function shapeOf(a: Cell, b: Cell): Shape {
  const differing = axes.filter((axis) => a[axis] !== b[axis]);
  if (differing.length === 1) return { kind: "line", from: a, to: b };
  const box = boxOf(a, b);
  if (differing.length === 2) {
    const flat = a.x === b.x ? "x" : a.y === b.y ? "y" : "z";
    return { kind: "rect", box, flat };
  }
  return { kind: "box", box };
}

export function stylesFor(shape: Shape): ShapeStyle[] {
  switch (shape.kind) {
    case "line":
      return ["fill"];
    case "rect":
      return ["fill", "frame"];
    case "box":
      return ["fill", "faces", "walls"];
  }
}

function boundsOf(shape: Shape): Box {
  return shape.kind === "line" ? boxOf(shape.from, shape.to) : shape.box;
}

function interiorOf(shape: Shape, style: ShapeStyle): Box | undefined {
  if (style === "fill" || !stylesFor(shape).includes(style)) return undefined;
  const box = boundsOf(shape);
  const inset = axes.filter((axis) =>
    shape.kind === "rect"
      ? axis !== shape.flat
      : style === "faces" || axis !== "y",
  );
  const min = { ...box.min };
  const max = { ...box.max };
  for (const axis of inset) {
    min[axis]++;
    max[axis]--;
    if (min[axis] > max[axis]) return undefined;
  }
  return { min, max };
}

export function* cellsOfShape(shape: Shape, style: ShapeStyle): Iterable<Cell> {
  const interior = interiorOf(shape, style);
  for (const cell of cellsOf(boundsOf(shape))) {
    if (!interior || !contains(interior, cell)) yield cell;
  }
}

export function shapeCount(shape: Shape, style: ShapeStyle): number {
  const interior = interiorOf(shape, style);
  return volume(boundsOf(shape)) - (interior ? volume(interior) : 0);
}
