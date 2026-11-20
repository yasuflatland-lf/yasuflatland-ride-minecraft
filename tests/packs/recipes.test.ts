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
      unlock: { context: "AlwaysUnlocked" },
      result: { item: identifier, count: 1 },
    });
  },
);

function signatures({ pattern, key }: ShapedRecipe): string[] {
  const width = Math.max(...pattern.map((row) => row.length));
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
