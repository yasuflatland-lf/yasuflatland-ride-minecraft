import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const runShape = <T>(expression: string, input: unknown): T => {
  const script = [
    "import json, sys",
    "from dataclasses import asdict",
    "sys.path.insert(0, 'tools')",
    "from camper_front.shape import SILL_LOW, FrontShape, lean_dz, ridge_dz",
    "args = json.loads(sys.stdin.read())",
    `print(json.dumps(${expression}))`,
  ].join("\n");
  return JSON.parse(
    execFileSync("python3", ["-I", "-c", script], {
      input: JSON.stringify(input),
      encoding: "utf8",
    }),
  );
};

const runs = { numRuns: 25 };
const shape = runShape<{
  hood_edge_y: number;
  lean_deg: number;
  grille_half_span: number;
  grille_ridge_px: number;
}>("asdict(FrontShape())", null);

describe("camper front shape", () => {
  it("leans forward at the configured angle about the shared sill height", () => {
    expect(shape.hood_edge_y).toBe(runShape<number>("SILL_LOW", null));
    fc.assert(
      fc.property(fc.double({ min: 0, max: 64, noNaN: true }), (y) => {
        const expected =
          -(y - shape.hood_edge_y) * Math.tan((shape.lean_deg * Math.PI) / 180);
        for (const value of runShape<number[]>(
          "[lean_dz(args), FrontShape().lean_dz(args)]",
          y,
        )) {
          expect(value).toBeCloseTo(expected, 12);
        }
      }),
      runs,
    );
  });

  it("keeps the glass and cap flat while giving the grille its configured ridge", () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 1, noNaN: true }), (fraction) => {
        const x = fraction * shape.grille_half_span;
        expect(
          runShape(
            "[ridge_dz(args, ridge, FrontShape().grille_half_span) for ridge in (FrontShape().windshield_ridge_px, FrontShape().cap_ridge_px, FrontShape().grille_ridge_px)]",
            x,
          ),
        ).toEqual([
          0,
          0,
          -shape.grille_ridge_px * (1 - Math.abs(x) / shape.grille_half_span),
        ]);
      }),
      runs,
    );
  });

  it("keeps ridge edges fixed and places the symmetric center ahead by its depth", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 48 }),
        fc.integer({ min: 1, max: 8 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (halfSpan, depth, fraction) => {
          const values = runShape<number[]>(
            "[ridge_dz(x, args[1], args[0]) for x in (0, -args[0], args[0], args[0] * args[2], -args[0] * args[2])]",
            [halfSpan, depth, fraction],
          );
          expect(values.slice(0, 3).map((value) => value + 0)).toEqual([
            -depth,
            0,
            0,
          ]);
          expect(values[3]).toBe(values[4]);
          expect(values[3]).toBeGreaterThanOrEqual(-depth);
          expect(values[3]).toBeLessThanOrEqual(0);
        },
      ),
      runs,
    );
  });
});
