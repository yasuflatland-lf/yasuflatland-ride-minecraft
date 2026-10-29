// Each vehicle kind's footprint must cover its whole model at any heading, so things
// placed beside vehicles keep out of the body (ADR 0122).
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VEHICLE_KINDS, type VehicleKind } from "../../src/domain/vehicle/kind";
import { profileOf } from "../../src/domain/vehicle/kinds/index";

import { type Bone, turnedCorners } from "../support/geometry";

const PIXELS_PER_BLOCK = 16;

// The wide blade is a model-only bone: the footprint stays the normal blade's until the cut
// widens (ADR 0180).
const MODEL_ONLY_BONES = ["blade_wide"];

function bones(kind: VehicleKind): Bone[] {
  return JSON.parse(
    readFileSync(
      `packs/yasu_ride_rp/models/entity/yasu_ride/${kind}.geo.json`,
      "utf8",
    ),
  )["minecraft:geometry"][0].bones;
}

function modelReach(kind: VehicleKind): number {
  let reach = 0;
  for (const bone of bones(kind).filter(
    (b) => !MODEL_ONLY_BONES.includes(b.name),
  ))
    for (const cube of bone.cubes ?? [])
      for (const [x, , z] of turnedCorners(bone, cube))
        reach = Math.max(reach, Math.hypot(x, z));
  return reach / PIXELS_PER_BLOCK;
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
