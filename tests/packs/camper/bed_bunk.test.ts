import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defined } from "../../support/defined";
import { bone } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("fits the upper bunk in its mirrored cells with only slim posts below the deck (ADR 0182)", () => {
    const bunk = bone("bunk");
    expect(bunk.parent).toBe("body");
    expect(bunk.pivot).toEqual([0, 0, 0]);
    expect(bunk.rotation).toBeUndefined();
    const cubes = (bunk.cubes ?? []).map((cube) => {
      expect(cube.rotation).toBeUndefined();
      const [x, y, z] = [0, 1, 2].map((axis) =>
        defined(cube.origin[axis], "bunk origin"),
      ) as [number, number, number];
      const [width, height, depth] = [0, 1, 2].map((axis) =>
        defined(cube.size[axis], "bunk size"),
      ) as [number, number, number];
      return { x, y, z, width, height, depth, top: y + height };
    });
    const panels = cubes.filter((cube) => cube.y >= 32);
    const posts = cubes.filter((cube) => cube.y < 32);
    expect(panels.length).toBeGreaterThanOrEqual(4);
    expect(posts).toHaveLength(2);
    const deck = defined(
      panels.find((cube) => cube.y === 32),
      "bunk deck",
    );
    expect([deck.x, deck.y, deck.z]).toEqual([8, 32, 24]);
    expect(deck.width).toBe(15);
    expect(deck.depth).toBe(31);
    for (const post of posts) {
      expect(post.y).toBe(16);
      expect(post.x).toBe(8);
      expect(post.width).toBeLessThanOrEqual(1.5);
      expect(post.depth).toBeLessThanOrEqual(1.5);
      expect(post.top).toBeLessThanOrEqual(deck.top);
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
    // BUNK_TOP in tools/gen_camper.py, which camper_bunk.block.json sizes its box from.
    expect(top).toBe(37.5);
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
