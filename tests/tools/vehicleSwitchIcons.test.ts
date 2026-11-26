import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

type Pixel = [number, number, number, number];

const pixels = (name: string): Pixel[][] =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `import json, sys; sys.path.insert(0, 'tools'); import suv_export as s; print(json.dumps([[s.${name}(x, y) for x in range(16)] for y in range(16)]))`,
      ],
      { encoding: "utf8" },
    ),
  );

const box = (grid: Pixel[][], keep: (p: Pixel) => boolean) => {
  const xs: number[] = [];
  const ys: number[] = [];
  grid.forEach((row, y) => {
    row.forEach((p, x) => {
      if (keep(p)) {
        xs.push(x);
        ys.push(y);
      }
    });
  });
  const [left, right] = [Math.min(...xs), Math.max(...xs) + 1];
  const [top, bottom] = [Math.min(...ys), Math.max(...ys) + 1];
  return {
    width: right - left,
    height: bottom - top,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  };
};

it("draws the headlight switch symbol at about 0.85 scale, centered on an opaque black tile", () => {
  const grid = pixels("switch_icon");
  expect(grid.flat().every((p) => p[3] === 255)).toBe(true);
  const symbol = box(grid, (p) => p[0] + p[1] + p[2] > 0);
  expect(symbol.width).toBeGreaterThanOrEqual(13);
  expect(symbol.width).toBeLessThanOrEqual(14);
  expect(symbol.height).toBeLessThanOrEqual(10);
  expect(Math.abs(symbol.cx - 8)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(symbol.cy - 8)).toBeLessThanOrEqual(0.5);
});

it("centers the booster rocket body, flame excluded, on the tile", () => {
  const flame = new Set(["255,248,215", "255,214,55", "255,130,30"]);
  const rocket = box(
    pixels("booster_icon"),
    (p) => p[3] > 0 && !flame.has(p.slice(0, 3).join(",")),
  );
  expect(Math.abs(rocket.cx - 8)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(rocket.cy - 8)).toBeLessThanOrEqual(0.5);
});
