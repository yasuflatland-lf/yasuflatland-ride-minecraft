// Each vehicle kind's footprint must cover its whole model at any heading, so things
// placed beside vehicles keep out of the body (ADR 0122).
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VEHICLE_KINDS, type VehicleKind } from "../../src/domain/vehicle/kind";
import { profileOf } from "../../src/domain/vehicle/kinds/index";

import { type Bone, turnedCorners } from "../support/geometry";

const PIXELS_PER_BLOCK = 16;

function bones(kind: VehicleKind): Bone[] {
  return JSON.parse(
    readFileSync(
      `packs/yasu_ride_rp/models/entity/yasu_ride/${kind}.geo.json`,
      "utf8",
    ),
  )["minecraft:geometry"][0].bones;
}

function modelCorners(kind: VehicleKind): [number, number, number][] {
  return bones(kind).flatMap((bone) =>
    (bone.cubes ?? []).flatMap((cube) => turnedCorners(bone, cube)),
  );
}

function modelReach(kind: VehicleKind): number {
  return (
    Math.max(...modelCorners(kind).map(([x, , z]) => Math.hypot(x, z))) /
    PIXELS_PER_BLOCK
  );
}

it.each(VEHICLE_KINDS)(
  "gives the %s a footprint that covers its model at any heading",
  (kind) => {
    const turned = new Set(
      bones(kind)
        .filter((bone) => bone.rotation?.some((a) => a !== 0))
        .map((bone) => bone.name),
    );
    expect(
      bones(kind).filter((bone) => bone.parent && turned.has(bone.parent)),
    ).toEqual([]);
    expect(modelReach(kind)).toBeLessThanOrEqual(profileOf(kind).footprint);
  },
);

it("keeps the SUV bumper and fog lamps inside its forward collision probe", () => {
  const front =
    Math.max(...modelCorners("suv").map(([, , z]) => -z)) / PIXELS_PER_BLOCK;
  expect(front).toBeLessThanOrEqual(profileOf("suv").body.front);
});
