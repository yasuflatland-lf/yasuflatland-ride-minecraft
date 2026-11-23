import { basename, dirname } from "node:path";
import { expect, it } from "vitest";
import { defined } from "../support/defined";
import { jsonFileEntries } from "../support/packFiles";

interface ShapedRecipe {
  pattern: string[];
  key: Record<string, Record<string, unknown>>;
}

const recipes = jsonFileEntries("packs/yasu_ride_bp/recipes").map(
  ({ path, json }) => {
    const shaped = json["minecraft:recipe_shaped"] as ShapedRecipe | undefined;
    return {
      path,
      shaped,
      recipe: shaped ?? json["minecraft:recipe_shapeless"],
      identifier: `${dirname(path)}:${basename(path, ".recipe.json")}`,
    };
  },
);

it("ships the shaped recipes for the vehicles and furniture checked by the pack suites", () => {
  const shapedItems = recipes
    .filter(({ shaped }) => shaped)
    .map(({ identifier }) => identifier);
  expect(shapedItems).toEqual(
    expect.arrayContaining([
      "yasu_ride:beach_chair_item",
      "yasu_ride:beach_parasol_item",
      "yasu_ride:dining_chair_item",
      "yasu_ride:dutch_oven_item",
      "yasu_ride:noga_chair_item",
      "yasu_ride:scooter_item",
      "yasu_ride:sofa_double_item",
      "yasu_ride:sofa_single_item",
      "yasu_ride:sportsboat_item",
      "yasu_ride:toilet_item",
      "yasu_ride:washstand_item",
    ]),
  );
});

it("covers at least 31 recipes across both namespaces", () => {
  expect(recipes.length).toBeGreaterThanOrEqual(31);
  expect(
    recipes.filter(({ identifier }) => identifier.startsWith("yasu_build:"))
      .length,
  ).toBeGreaterThanOrEqual(6);
});

it.each(recipes)(
  "$path is always unlocked and crafts its namesake",
  ({ recipe, identifier }) => {
    expect(recipe).toMatchObject({
      description: { identifier },
      tags: ["crafting_table"],
      unlock: { context: "AlwaysUnlocked" },
      result: { item: identifier, count: 1 },
    });
  },
);

function signatures({ pattern, key }: ShapedRecipe): string[] {
  const width = Math.max(...pattern.map((row) => row.length));
  expect(pattern.length).toBeGreaterThanOrEqual(1);
  expect(pattern.length).toBeLessThanOrEqual(3);
  expect(width).toBeGreaterThanOrEqual(1);
  expect(width).toBeLessThanOrEqual(3);
  const symbols = new Set(pattern.join("").replaceAll(" ", ""));
  expect(symbols.size).toBeGreaterThan(0);
  expect(Object.keys(key).sort()).toEqual([...symbols].sort());
  for (const ingredient of Object.values(key)) {
    expect(Object.hasOwn(ingredient, "item")).not.toBe(
      Object.hasOwn(ingredient, "tag"),
    );
    expect(ingredient.item ?? ingredient.tag).toMatch(/^\w+:[a-z0-9_]+$/);
  }
  const grid = pattern.map((row) =>
    [...row.padEnd(width)].map((symbol) =>
      symbol === " "
        ? null
        : Object.entries(defined(key[symbol], `recipe key ${symbol}`)).sort(
            ([a], [b]) => a.localeCompare(b),
          ),
    ),
  );
  while (grid[0]?.every((cell) => cell === null)) grid.shift();
  while (grid.at(-1)?.every((cell) => cell === null)) grid.pop();
  while (grid.length && grid.every((row) => row[0] === null))
    for (const row of grid) row.shift();
  while (grid.length && grid.every((row) => row.at(-1) === null))
    for (const row of grid) row.pop();
  return [
    JSON.stringify(grid),
    JSON.stringify(grid.map((row) => [...row].reverse())),
  ];
}

it("every shaped recipe has a unique signature, mirror images included", () => {
  const owners = new Map<string, string>();
  const shapedRecipes = recipes.flatMap(({ path, shaped }) =>
    shaped ? [{ path, shaped }] : [],
  );
  expect(shapedRecipes.length).toBeGreaterThanOrEqual(18);
  for (const { path, shaped } of shapedRecipes) {
    for (const signature of new Set(signatures(shaped))) {
      expect(
        owners.get(signature),
        `${path} conflicts with ${owners.get(signature)}`,
      ).toBeUndefined();
      owners.set(signature, path);
    }
  }
});
