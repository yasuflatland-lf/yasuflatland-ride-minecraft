import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { areaCubes, bone } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("fits the upper bunk in its mirrored cells with only slim posts below the deck (ADR 0182)", () => {
    const bunk = bone("bunk");
    expect(bunk.parent).toBe("body");
    expect(bunk.pivot).toEqual([0, 0, 0]);
    expect(bunk.rotation).toBeUndefined();
    const cubes = (bunk.cubes ?? []).map((cube) => {
      expect(cube.rotation).toBeUndefined();
      const [x, y, z] = cube.origin;
      const [width, height, depth] = cube.size;
      return { x, y, z, width, height, depth, top: y + height };
    });
    const lowerBed = areaCubes("bed_bunk").filter(
      ({ owner }) => owner.name === "body",
    );
    const panels = cubes.filter((cube) => cube.y >= 32);
    const posts = cubes.filter((cube) => cube.y < 32);
    const deck = panels.filter((cube) => cube.y === 32);
    expect(deck.length).toBeGreaterThan(0);
    const deckTop = Math.max(...deck.map((cube) => cube.top));
    expect(deckTop).toBeLessThan(36); // The side window starts here.
    for (const { cube } of lowerBed) {
      const [x, , z] = cube.origin;
      expect(Math.min(...deck.map((part) => part.x))).toBeLessThanOrEqual(x);
      expect(Math.min(...deck.map((part) => part.z))).toBeLessThanOrEqual(z);
      expect(
        Math.max(...deck.map((part) => part.x + part.width)),
      ).toBeGreaterThanOrEqual(x + cube.size[0]);
      expect(
        Math.max(...deck.map((part) => part.z + part.depth)),
      ).toBeGreaterThanOrEqual(z + cube.size[2]);
    }
    expect(posts).toHaveLength(2);
    const [front, rear] = [...posts].sort((a, b) => a.z - b.z);
    expect((front?.z ?? Infinity) + (front?.depth ?? 0)).toBeLessThan(
      rear?.z ?? -Infinity,
    );
    for (const post of posts) {
      expect(post.y).toBe(16);
      expect(post.x).toBeCloseTo(Math.min(...deck.map((cube) => cube.x)));
      expect(post.width).toBeLessThanOrEqual(1.5);
      expect(post.depth).toBeLessThanOrEqual(1.5);
      expect(post.top).toBeGreaterThanOrEqual(32);
      expect(post.top).toBeLessThanOrEqual(deckTop);
    }
    for (const { x, z, width, depth, top } of cubes) {
      expect(x).toBeGreaterThanOrEqual(8);
      expect(x + width).toBeLessThanOrEqual(24);
      expect(z).toBeGreaterThanOrEqual(24);
      expect(z + depth).toBeLessThanOrEqual(56);
      expect(top).toBeLessThan(48);
      // Horizontal separation also keeps the view of the cabinet and aisle lights clear.
      for (const [left, right] of [
        [-22.8, -10],
        [-4, 4],
      ] as const) {
        expect(x >= right || x + width <= left).toBe(true);
      }
    }
    const top = Math.max(...cubes.map((cube) => cube.top));
    expect(top - 32).toBeLessThanOrEqual(9);
    expect(top).toBeLessThan(38);
    // The bunk block's selection box is as high as the bunk above its cell bottom (ADR 0182).
    const block = JSON.parse(
      readFileSync(
        "packs/yasu_ride_bp/blocks/yasu_ride/camper_bunk.block.json",
        "utf8",
      ),
    );
    expect(
      block["minecraft:block"].components["minecraft:selection_box"].size[1],
    ).toBe(top - 32);
  });
});
