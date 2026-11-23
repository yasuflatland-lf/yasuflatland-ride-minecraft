import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const camperEntity = JSON.parse(
  readFileSync("packs/yasu_ride_bp/entities/yasu_ride/camper.se.json", "utf8"),
)["minecraft:entity"];
it("keeps the camper's undocked collision box", () => {
  expect(
    camperEntity.component_groups["yasu_ride:undocked"][
      "minecraft:collision_box"
    ],
  ).toEqual({
    width: 3,
    height: 4,
  });
});

it("keeps seat_0 and seat_1 bones attached to the body at floor height", () => {
  const geometry = JSON.parse(
    readFileSync(
      "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
      "utf8",
    ),
  )["minecraft:geometry"][0];
  for (const name of ["seat_0", "seat_1"]) {
    const seat = geometry.bones.find((b: { name: string }) => b.name === name);
    expect(seat, name).toBeDefined();
    expect(seat.parent).toBe("body");
    expect(seat.pivot).toEqual([0, 16, 0]);
    expect(seat.cubes.length).toBeGreaterThan(0);
  }
});
