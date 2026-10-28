import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const entity = (name: string) =>
  JSON.parse(
    readFileSync(
      `packs/yasu_ride_bp/entities/yasu_ride/${name}.se.json`,
      "utf8",
    ),
  )["minecraft:entity"];

it.each(["suv", "camper", "sportsboat"])(
  "shows Drive on the interact button of the %s",
  (name) => {
    expect(entity(name).components["minecraft:rideable"].interact_text).toBe(
      "action.interact.yasu_ride.drive",
    );
  },
);
