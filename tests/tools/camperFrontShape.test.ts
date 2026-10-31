import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const runShape = <T>(expression: string, input: unknown): T => {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'tools')",
    "from camper_front.shape import FrontShape, lean_dz, ridge_dz",
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

describe("camper front shape", () => {
  it("preserves the legacy taper below and above the upper grille", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 64, noNaN: true }), (y) => {
        const expected = y >= 18 ? -2 : -2 + ((2 + 0.5) * (18 - y)) / (18 - 8);
        expect(
          runShape("[lean_dz(args), FrontShape().lean_dz(args)]", y),
        ).toEqual([expected, expected]);
      }),
      runs,
    );
  });

  it("leaves the front flat across its width with all ridges disabled", () => {
    fc.assert(
      fc.property(fc.double({ min: -24, max: 24, noNaN: true }), (x) => {
        expect(
          runShape(
            "[ridge_dz(args, ridge, 24) for ridge in (lambda f: (f.windshield_ridge_px, f.cap_ridge_px, f.grille_ridge_px))(FrontShape(windshield_ridge_px=0, cap_ridge_px=0, grille_ridge_px=0))]",
            x,
          ),
        ).toEqual([0, 0, 0]);
      }),
      runs,
    );
  });

  it("defaults the cap ridge to 4 px", () => {
    expect(runShape("FrontShape().cap_ridge_px", 0)).toBe(4);
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
