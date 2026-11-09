// The invisible block that keeps rain off a beach parasol (ADR 0236). It
// takes option A: no collision box, so players and vehicles pass through it.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Json, jsonFileEntries } from "../support/packFiles";

const BLOCKS = join(
  fileURLToPath(new URL("../..", import.meta.url)),
  "packs/yasu_ride_bp/blocks",
);

const entry = jsonFileEntries(BLOCKS).find(
  ({ path }) => path === "yasu_ride/parasol_ceiling.block.json",
);
const block = (entry?.json["minecraft:block"] ?? {}) as Json;
const components = (block.components ?? {}) as Json;
const description = (block.description ?? {}) as Json;

describe("yasu_ride:parasol_ceiling", () => {
  it("exists and is hidden from the creative menu", () => {
    expect(description.identifier).toBe("yasu_ride:parasol_ceiling");
    expect(description.menu_category).toEqual({ category: "none" });
  });

  it("draws nothing, like the tent ceiling", () => {
    expect(components["minecraft:geometry"]).toEqual({
      identifier: "geometry.yasu_ride.deck_floor",
      bone_visibility: { root: false },
    });
  });

  it("cannot be selected, blocks no light, and glows not at all", () => {
    expect(components["minecraft:selection_box"]).toBe(false);
    expect(components["minecraft:light_dampening"]).toBe(0);
    expect(components).not.toHaveProperty("minecraft:light_emission");
  });

  it("survives mining and explosions, and keeps the laid tag", () => {
    expect(components["minecraft:destructible_by_mining"]).toBe(false);
    expect(components["minecraft:destructible_by_explosion"]).toBe(false);
    expect(components["tag:yasu_ride:laid"]).toEqual({});
  });

  it("has no collision box (option A)", () => {
    expect(components["minecraft:collision_box"]).toBe(false);
  });
});
