import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { SUV_PROFILE } from "../../src/domain/vehicle/kinds/suv/profile";
import { SUV_SPEC } from "../../src/domain/vehicle/kinds/suv/spec";
import { type Bone as GeometryBone, turnedCorners } from "../support/geometry";

type Vec = [number, number, number];
type Bone = { name: string; pivot: Vec; locators?: Record<string, Vec> };
type Position = Vec | Record<string, Vec>;

const script = [
  "import contextlib, io, json, sys, tempfile",
  "sys.path.insert(0, 'tools')",
  "from tool_loader import load_tool",
  // Loading the generator writes assets; keep them out of the repository.
  "with tempfile.TemporaryDirectory() as output:",
  "    sys.argv = ['gen_model.py', output]",
  "    with contextlib.redirect_stdout(io.StringIO()):",
  "        g = load_tool('gen_model')",
  "    print(json.dumps({k: v for k, v in vars(g).items() if k.isupper() and isinstance(v, (int, float))}))",
].join("\n");
const d = JSON.parse(
  execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }),
) as Record<string, number>;
const constant = (name: string): number => {
  const value = d[name];
  if (value === undefined) throw new Error(`Missing dimension ${name}`);
  return value;
};
// Construction lengths reach the exported model scaled by SIZE_SCALE (ADR 0170).
const dimension = (name: string): number =>
  Number((constant(name) * constant("SIZE_SCALE")).toFixed(12));
const model = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json",
    "utf8",
  ),
) as { "minecraft:geometry": [{ bones: Bone[] }] };
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

it("joins the shortened A-pillars to the roof without protruding above it", () => {
  const body = bone("body") as GeometryBone;
  const pillars = (body.cubes ?? []).filter(
    (c) =>
      c.rotation?.[0] === -constant("WINDSHIELD_LEAN") &&
      Math.abs(c.size[0] - constant("SIZE_SCALE")) < 1e-10,
  );
  expect(pillars).toHaveLength(2);
  for (const pillar of pillars) {
    const top = Math.max(...turnedCorners(body, pillar).map((p) => p[1]));
    expect(top).toBeCloseTo(dimension("ROOF_TOP"), 10);
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

it("derives the seated-player size anchor and collision dimensions from one scale (ADR 0194)", () => {
  const scale = constant("SIZE_SCALE");
  expect(scale).toBe(1.45);
  const entity = JSON.parse(
    readFileSync("packs/yasu_ride_bp/entities/yasu_ride/suv.se.json", "utf8"),
  )["minecraft:entity"].components;
  const box = entity["minecraft:collision_box"];
  expect(box.width).toBeCloseTo(1.8 * scale, 12);
  expect(box.height).toBeCloseTo(1.6 * scale, 12);
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
    expect(Math.abs(position[0])).toBeCloseTo(0.38 * scale, 12);
    expect(position[1]).toBeCloseTo(0.4 * scale, 12);
    const seatZ = constant(index < 2 ? "FRONT_SEAT_Z" : "REAR_SEAT_Z");
    expect(position[2]).toBeCloseTo(((seatZ + 5.2) * scale) / 16, 12);
  }
  const clearance = SUV_PROFILE.placement.clearance;
  expect(clearance).toEqual({ halfX: 1, halfZ: 1, height: 3 });
  const depth = Math.ceil(SUV_SPEC.carHeight);
  expect(depth).toBe(3);
  expect(-60 - depth - 1).toBeGreaterThanOrEqual(-64);
});
