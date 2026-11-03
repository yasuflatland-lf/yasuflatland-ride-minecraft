import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { SUV_PROFILE } from "../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../src/domain/vehicle/kinds/suv/spec";
import { type Bone as GeometryBone, turnedCorners } from "../support/geometry";
import { constant, dimension } from "../support/suvDimensions";

type Vec = [number, number, number];
type Bone = { name: string; pivot: Vec; locators?: Record<string, Vec> };
type Position = Vec | Record<string, Vec>;

const model = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json",
    "utf8",
  ),
) as { "minecraft:geometry": [{ bones: Bone[] }] };
const roundUp = (value: number): number => Math.ceil(value * 100) / 100;
const cornersOf = (accept: (name: string) => boolean): Vec[] =>
  (model["minecraft:geometry"][0].bones as GeometryBone[])
    .filter((bone) => accept(bone.name))
    .flatMap((bone) =>
      (bone.cubes ?? []).flatMap((cube) =>
        turnedCorners(bone, cube).map(
          ([x, y, z]): Vec => [x / 16, y / 16, z / 16],
        ),
      ),
    );
const bone = (name: string): Bone => {
  const found = model["minecraft:geometry"][0].bones.find(
    (b) => b.name === name,
  );
  if (!found) throw new Error(`Missing bone ${name}`);
  return found;
};
const { animations } = JSON.parse(
  readFileSync("packs/yasu_ride_rp/animations/yasu_ride/suv.anim.json", "utf8"),
) as {
  animations: Record<
    string,
    { bones?: Record<string, { position?: Position }> }
  >;
};
const position = (animation: string, name: string): Position => {
  const value =
    animations[`animation.yasu_ride.suv.${animation}`]?.bones?.[name]?.position;
  if (!value) throw new Error(`Missing position for ${animation}/${name}`);
  return value;
};

it("orders the SUV body heights and longitudinal landmarks consistently", () => {
  for (const names of [
    ["SILL_Y", "FLOOR_Y", "BELT_Y", "WINDOW_TOP_Y", "ROOF_Y"],
    ["REAR", "REAR_AXLE_Z", "FRONT_AXLE_Z", "FRONT_BUMPER_TIP_Z"],
    ["REAR", "CARGO_FRONT", "WINDSHIELD_FOOT_Z"],
  ]) {
    const ordered = names.map(dimension);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i - 1]).toBeLessThan(ordered[i] as number);
    }
  }
});

it("joins the leaning A-pillars to the roof without protruding above it", () => {
  const body = bone("body") as GeometryBone;
  // Each pillar is a long bar leaning back at 34.6 degrees, a little less than the windshield's own lean.
  const pillars = (body.cubes ?? []).filter(
    (c) =>
      c.rotation?.[1] === 0 &&
      c.rotation[2] === 0 &&
      Math.abs((c.rotation[0] ?? 0) + 34.6) < 0.05 &&
      c.size[1] > dimension("D") / 2,
  );
  expect(pillars).toHaveLength(2);
  for (const pillar of pillars) {
    const top = Math.max(...turnedCorners(body, pillar).map((p) => p[1]));
    expect(top).toBeLessThanOrEqual(dimension("ROOF_TOP"));
    expect(top).toBeGreaterThan(dimension("ROOF_Y"));
  }
});

it("keeps the steering center ahead of the front riders under the rearward cowl", () => {
  for (const seat of SUV_PROFILE.seats.positions.slice(0, 2)) {
    expect(dimension("WHEEL_Z")).toBeGreaterThan(seat.z * 16);
  }
  expect(dimension("WHEEL_Z")).toBeLessThan(dimension("DASH_FACE_Z"));
  expect(dimension("DASH_FACE_Z")).toBeLessThan(dimension("WINDSHIELD_FOOT_Z"));
});

it("anchors wheel assemblies and hover locators to the exported axles", () => {
  for (const corner of ["fl", "fr", "rl", "rr"]) {
    // Export turns the generator's x and z axes through 180 degrees (ADR 0009).
    const side = corner.endsWith("l") ? 1 : -1;
    const z = -dimension(
      corner.startsWith("f") ? "FRONT_AXLE_Z" : "REAR_AXLE_Z",
    );
    const hub: Vec = [side * dimension("HUB_X"), dimension("HUB_Y"), z];
    expect(bone(`wheel_${corner}`).pivot).toEqual(hub);
    expect(bone(`arm_${corner}`).pivot).toEqual([
      side * dimension("ARM_ROOT_X"),
      dimension("ARM_ROOT_Y"),
      z,
    ]);
    const glow = bone(`glow_${corner}`);
    expect(glow.pivot).toEqual([
      Number((side * (dimension("HUB_X") + dimension("FOLD_OUT"))).toFixed(12)),
      0,
      z,
    ]);
    expect(glow.locators?.[`hover_${corner}`]).toEqual([
      glow.pivot[0],
      -0.5 * constant("SIZE_SCALE"),
      z,
    ]);
    if (corner.startsWith("r")) {
      expect(bone(`prop_${corner}`).pivot).toEqual(hub);
      expect(bone(`sub_arm_${corner}`).pivot).toEqual([
        side * dimension("BODY_HALF_WIDTH"),
        dimension("HUB_Y"),
        z,
      ]);
    }
  }
});

it("keeps hover and submarine animation offsets aligned with their assemblies", () => {
  for (const corner of ["fl", "fr", "rl", "rr"]) {
    const name = `wheel_${corner}`;
    const side = corner.endsWith("l") ? 1 : -1;
    const folded: Vec = [
      side * dimension("FOLD_OUT"),
      -dimension("FOLD_DROP"),
      0,
    ];
    expect(position("wheels_folded", name)).toEqual(folded);
    expect(position("wheels_deploy", name)).toEqual({
      "0.0": [0, 0, 0],
      "1.0": folded,
    });
    expect(position("wheels_retract", name)).toEqual({
      "0.0": folded,
      "1.0": [0, 0, 0],
    });
    const hub = bone(name).pivot;
    const glow = bone(`glow_${corner}`).pivot;
    expect(hub[0] + folded[0]).toBeCloseTo(glow[0], 10);
    expect(hub[1] + folded[1] + dimension("TIRE_HALF_WIDTH")).toBeCloseTo(
      dimension("FOLDED_WHEEL_TOP_Y"),
    );
    if (corner.startsWith("r")) {
      const submerged: Vec = [side * dimension("SUB_OUT"), 0, 0];
      for (const member of [name, `prop_${corner}`]) {
        expect(position("submerged", member)).toEqual(submerged);
        expect(position("dive", member)).toEqual({
          "0.0": [0, 0, 0],
          "0.5": submerged,
          "1.0": submerged,
        });
        expect(position("surface", member)).toEqual({
          "0.0": submerged,
          "0.5": submerged,
          "1.0": [0, 0, 0],
        });
      }
    }
  }
  // These bones use scale-only animation: translations would detach their axle pivots.
  for (const animation of Object.values(animations)) {
    for (const [name, channels] of Object.entries(animation.bones ?? {})) {
      if (/^(arm_|sub_arm_|glow_)/.test(name)) {
        expect(channels.position).toBeUndefined();
      }
    }
  }
});

it("keeps scaled SUV dimensions with cabin-derived seat positions (ADR 0215)", () => {
  const scale = constant("SIZE_SCALE");
  expect(scale).toBe(1.45);
  const entity = JSON.parse(
    readFileSync("packs/yasu_ride_bp/entities/yasu_ride/suv.se.json", "utf8"),
  )["minecraft:entity"].components;
  const box = entity["minecraft:collision_box"];
  expect(box.width).toBe(2 * roundUp(dimension("SHELL_OUTER_HALF_WIDTH") / 16));
  const shell = cornersOf(
    (name) => name === "body" || name.startsWith("door_"),
  );
  expect(box.width).toBe(
    2 * roundUp(Math.max(...shell.map(([x]) => Math.abs(x)))),
  );
  expect(box.height).toBe(
    Math.floor((dimension("HARDTOP_TOP_Y") / 16) * 100) / 100,
  );
  expect(SUV_SPEC.carHeight).toBe(box.height);
  expect(SUV_SPEC.hitboxFront).toBe(box.width / 2);
  expect(SUV_SPEC.floatDraft).toBeCloseTo(box.height * 0.75, 12);
  expect(SUV_SPEC.gearProbeOffset).toBeCloseTo(
    (box.width / 2) * (0.8 / 0.9),
    12,
  );
  for (const [index, { position }] of entity[
    "minecraft:rideable"
  ].seats.entries()) {
    expect(Math.abs(position[0])).toBe(
      Number(((constant("RIDER_X") * scale) / 16).toFixed(3)),
    );
    expect(position[1]).toBe(constant("SEAT_Y"));
    const riderZ = constant(index < 2 ? "FRONT_RIDER_Z" : "REAR_RIDER_Z");
    expect(position[2]).toBe(Number(((riderZ * scale) / 16).toFixed(3)));
  }
  const clearance = SUV_PROFILE.placement.clearance;
  expect(clearance).toEqual({ halfX: 1, halfZ: 1, height: 3 });
  const depth = Math.ceil(SUV_SPEC.carHeight);
  expect(depth).toBe(3);
  expect(-60 - depth - 1).toBeGreaterThanOrEqual(-64);
});

it("keeps the SUV spec values that mirror the model above the generator constants", () => {
  const blocks = (name: string): number => dimension(name) / 16;
  // The winch plate is the farthest-forward part.
  expect(SUV_SPEC.bodyFront).toBeGreaterThanOrEqual(
    blocks("FRONT_BUMPER_TIP_Z"),
  );
  // The body probe also covers the bumper end pieces.
  expect(SUV_SPEC.bodyHalfWidth).toBeGreaterThanOrEqual(
    blocks("BUMPER_HALF_WIDTH"),
  );
  expect(SUV_SPEC.bodyHalfWidth).toBeGreaterThanOrEqual(blocks("HUB_X"));
  // Keep the conservative glow reach bound even though the spare now sets the footprint.
  const glowReach =
    Math.hypot(
      constant("HUB_X") + constant("FOLD_OUT"),
      constant("REAR_AXLE_Z"),
    ) + constant("GLOW_RADIUS");
  expect(SUV_SPEC.footprint).toBeGreaterThanOrEqual(
    (glowReach * constant("SIZE_SCALE")) / 16,
  );
  // The roof ribs sit up to 0.3 blocks above the collision box (ADR 0170).
  expect(SUV_SPEC.roofTentRoofHeight).toBeCloseTo(blocks("ROOF_TOP"), 12);
  expect(blocks("ROOF_TOP") - SUV_SPEC.carHeight).toBeGreaterThanOrEqual(0);
  expect(blocks("ROOF_TOP") - SUV_SPEC.carHeight).toBeLessThanOrEqual(0.3);
});

it("rounds enclosing probes upward from every rotated model corner (ADR 0217)", () => {
  const shellAndLamps = cornersOf(
    (name) =>
      name === "body" || name.startsWith("door_") || name === "headlights",
  );
  const wheels = cornersOf((name) => name.startsWith("wheel_"));
  expect(SUV_SPEC.bodyFront).toBe(
    roundUp(Math.max(...shellAndLamps.map(([, , z]) => -z))),
  );
  expect(SUV_SPEC.bodyHalfWidth).toBe(
    roundUp(
      Math.max(...[...shellAndLamps, ...wheels].map(([x]) => Math.abs(x))),
    ),
  );
  expect(SUV_SPEC.bodyHalfWidth).toBe(roundUp(dimension("WHEEL_OUTER_X") / 16));
  expect(SUV_SPEC.footprint).toBe(
    roundUp(
      Math.max(...cornersOf(() => true).map(([x, , z]) => Math.hypot(x, z))),
    ),
  );
});
