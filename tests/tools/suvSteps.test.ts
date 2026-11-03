import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Bone, turnedCorners } from "../support/geometry";

const model = JSON.parse(
  readFileSync(
    "packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json",
    "utf8",
  ),
) as { "minecraft:geometry": [{ bones: Bone[] }] };
const bones = model["minecraft:geometry"][0].bones;
const bone = (name: string) => {
  const found = bones.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing bone ${name}`);
  return found;
};
const points = (member: Bone) =>
  (member.cubes ?? []).flatMap((cube) => turnedCorners(member, cube));
const extent = (corners: ReturnType<typeof points>, axis: 0 | 1 | 2) => {
  if (!corners.length) throw new Error("Missing geometry for clearance check");
  return {
    min: Math.min(...corners.map((point) => point[axis])),
    max: Math.max(...corners.map((point) => point[axis])),
  };
};
const diameter =
  ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"].reduce((sum, name) => {
    const bounds = extent(points(bone(name)), 1);
    return sum + bounds.max - bounds.min;
  }, 0) / 4;
const body = bone("body");
const rails = (body.cubes ?? []).filter((cube) => {
  const [x, y, z] = cube.rotation ?? [0, 0, 0];
  return (
    x === 0 &&
    y === 0 &&
    z !== 0 &&
    cube.size[2] > diameter &&
    extent(turnedCorners(body, cube), 1).max <
      extent(points(bone("wheel_fl")), 1).max
  );
});

describe("SUV rock-rail clearance", () => {
  it("keeps the rail below every opening door's bottom edge", () => {
    const top = extent(
      rails.flatMap((cube) => turnedCorners(body, cube)),
      1,
    ).max;
    const doors = bones.filter((member) => member.name.startsWith("door_"));
    expect(doors).toHaveLength(4);
    for (const door of doors) {
      expect(top, door.name).toBeLessThan(extent(points(door), 1).min);
    }
  });

  for (const side of ["l", "r"]) {
    const front = bone(`wheel_f${side}`);
    const rear = bone(`wheel_r${side}`);
    const sideSign = Math.sign(front.pivot?.[0] ?? 0);
    const rail = rails.filter((cube) =>
      turnedCorners(body, cube).every(
        (point) => Math.sign(point[0]) === sideSign,
      ),
    );

    it(`keeps the ${side} rail's z range clear of every hover and submarine arm cube`, () => {
      const bounds = extent(
        rail.flatMap((cube) => turnedCorners(body, cube)),
        2,
      );
      const arms = bones.filter((member) =>
        /^(arm_|sub_arm_)/.test(member.name),
      );
      expect(arms.some((member) => member.name.startsWith("arm_"))).toBe(true);
      expect(arms.some((member) => member.name.startsWith("sub_arm_"))).toBe(
        true,
      );
      for (const arm of arms) {
        expect(arm.cubes?.length, arm.name).toBeGreaterThan(0);
        for (const cube of arm.cubes ?? []) {
          const armBounds = extent(turnedCorners(arm, cube), 2);
          expect(
            bounds.max < armBounds.min || bounds.min > armBounds.max,
            arm.name,
          ).toBe(true);
        }
      }
    });

    it(`keeps the ${side} rail strictly between the same-side wheel arches`, () => {
      const bounds = extent(
        rail.flatMap((cube) => turnedCorners(body, cube)),
        2,
      );
      expect(bounds.min).toBeGreaterThan(extent(points(front), 2).max);
      expect(bounds.max).toBeLessThan(extent(points(rear), 2).min);
    });
  }
});
