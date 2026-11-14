import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import { SEAT_FILLER_FAMILY } from "../../support/packIdentifiers";

const camperEntity = JSON.parse(
  readFileSync("packs/yasu_ride_bp/entities/yasu_ride/camper.se.json", "utf8"),
)["minecraft:entity"];
it("matches the camper's four seat positions and collision box to its profile", () => {
  const components = camperEntity.components;
  const seats = components["minecraft:rideable"].seats;

  expect(components["minecraft:rideable"].family_types).toEqual([
    "player",
    SEAT_FILLER_FAMILY,
  ]);
  expect(seats).toHaveLength(4);
  expect(
    seats.map((seat: { position: number[] }) => ({
      x: seat.position[0],
      z: seat.position[2],
    })),
  ).toEqual(CAMPER_PROFILE.seats.positions);
  expect(
    camperEntity.component_groups["yasu_ride:undocked"][
      "minecraft:collision_box"
    ],
  ).toEqual({
    width: 3,
    height: 4,
  });
});

it("keeps seat_0 and seat_1 bones present with 501 light rounded seat cubes each", () => {
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
    expect(seat.cubes).toHaveLength(501);
  }
});
