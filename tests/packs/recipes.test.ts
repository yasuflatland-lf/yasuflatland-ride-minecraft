import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { expect, it } from "vitest";

const directory = "packs/yasu_ride_bp/recipes/yasu_ride";
const suffix = ".recipe.json";
const files = readdirSync(directory).filter((file) => file.endsWith(suffix));

it.each(files)("%s is always unlocked and crafts its namesake", (file) => {
  const data = JSON.parse(readFileSync(`${directory}/${file}`, "utf8"));
  const recipe =
    data["minecraft:recipe_shaped"] ?? data["minecraft:recipe_shapeless"];
  const identifier = `yasu_ride:${basename(file, suffix)}`;
  expect(recipe).toMatchObject({
    description: { identifier },
    unlock: { context: "AlwaysUnlocked" },
    result: { item: identifier },
  });
});
