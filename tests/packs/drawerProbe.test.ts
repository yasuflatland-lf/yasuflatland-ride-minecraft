import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { id, NAMESPACE } from "../../src/infrastructure/shared/identifiers";

const entity = (path: string) =>
  JSON.parse(readFileSync(path, "utf8"))["minecraft:entity"];

it("uses the camper drawer property declarations on an inert persistent BDS test carrier", () => {
  const probe = entity(
    "packs/yasu_ride_test_bp/entities/yasu_ride_test/drawer_probe.se.json",
  );
  const camper = entity("packs/yasu_ride_bp/entities/yasu_ride/camper.se.json");
  expect(probe.description.identifier).toBe(`${NAMESPACE}_test:drawer_probe`);
  expect(probe.description.is_summonable).toBe(true);
  expect(probe.description.properties).toEqual(
    Object.fromEntries(
      [
        "drawer_top",
        "drawer_bottom",
        "drawer_top_item",
        "drawer_bottom_item",
      ].map((name) => [id(name), camper.description.properties[id(name)]]),
    ),
  );
  expect(probe.components).toEqual({
    "minecraft:collision_box": { width: 0, height: 0 },
    "minecraft:persistent": {},
  });
});
