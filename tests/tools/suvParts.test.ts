import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PARTS = [
  "chassis",
  "hood",
  "grille",
  "fenders",
  "bumpers",
  "steps",
  "doors",
  "greenhouse",
  "rear",
].map((part) => `suv_${part}`);

const loads = (name: string): string[] =>
  [
    ...readFileSync(`tools/${name}.py`, "utf8").matchAll(
      /load_tool\(\s*["']([a-z_0-9]+)["']\s*\)/g,
    ),
  ].map((match) => match[1] as string);

describe("SUV body part modules", () => {
  for (const part of PARTS) {
    it(`${part} loads no other part module`, () => {
      const others = loads(part).filter((name) => PARTS.includes(name));
      expect(others).toEqual([]);
    });
  }

  it("keeps the shared shell free of part modules", () => {
    expect(loads("suv_shell").filter((name) => PARTS.includes(name))).toEqual(
      [],
    );
  });

  it("keeps the grille at eight slots", () => {
    expect(readFileSync("tools/suv_grille.py", "utf8")).toMatch(
      /^SLOTS, SLOT_W, BAR_W = 8,/m,
    );
  });
});
