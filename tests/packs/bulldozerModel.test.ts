import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
type ModelCube = NonNullable<Bone["cubes"]>[number] & {
  uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
};
type ModelBone = Bone & {
  cubes?: ModelCube[];
  locators?: Record<string, number[]>;
};
const geometryText = () =>
  readFileSync(`${RP}/models/entity/yasu_ride/bulldozer.geo.json`, "utf8");
const geometry = () => JSON.parse(geometryText())["minecraft:geometry"][0];
const bones = (): ModelBone[] => geometry().bones;
const bone = (name: string): ModelBone => {
  const found = bones().find((b) => b.name === name);
  expect(found, name).toBeDefined();
  return found as ModelBone;
};
const points = (b: Bone) => (b.cubes ?? []).flatMap((c) => turnedCorners(b, c));
describe("bulldozer model (ADR 0009, 0136)", () => {
  it("uses the production geometry identifier with no test namespace", () => {
    expect(geometry().description.identifier).toBe(
      "geometry.yasu_ride.bulldozer",
    );
    expect(geometryText()).not.toContain("yasu_ride_test");
    expect(geometry().description.texture_width).toBe(33);
    expect(geometry().description.texture_height).toBe(1);
    const texture = readRgbaPng(
      `${RP}/textures/entity/yasu_ride/bulldozer.png`,
    );
    expect([texture.width, texture.height]).toEqual([33, 1]);
  });
  it("has exactly the bone contract, each bone parented to body except root, body, and door_glass", () => {
    expect(
      bones()
        .map((b) => b.name)
        .sort(),
    ).toEqual(
      [
        "root",
        "body",
        "blade",
        "headlights",
        "beacon",
        "seat_0",
        "track_r_0",
        "track_r_1",
        "track_r_2",
        "track_l_0",
        "track_l_1",
        "track_l_2",
        "idler_front_r",
        "idler_rear_r",
        "sprocket_r",
        "idler_front_l",
        "idler_rear_l",
        "sprocket_l",
        "propeller",
        "door_l",
        "glass",
        "door_glass",
      ].sort(),
    );
    for (const b of bones()) {
      expect(b.parent).toBe(
        b.name === "root"
          ? undefined
          : b.name === "body"
            ? "root"
            : b.name === "door_glass"
              ? "door_l"
              : "body",
      );
      expect(b.rotation?.some((v) => v !== 0) ?? false).toBe(false);
    }
  });
  it("keeps the front at -z", () => {
    for (const side of ["r", "l"]) {
      expect(bone(`idler_front_${side}`).pivot?.[2]).toBeLessThan(
        bone(`sprocket_${side}`).pivot?.[2] as number,
      );
      expect(bone(`sprocket_${side}`).pivot?.[2]).toBeLessThan(
        bone(`idler_rear_${side}`).pivot?.[2] as number,
      );
    }
    expect(bone("blade").pivot?.[2]).toBeLessThan(0);
  });
  it("mirrors the left track phases and wheels from the right ones", () => {
    const normalized = (cubes: ModelCube[], mirror: boolean) =>
      cubes
        .map((c) => {
          const rounded = (values: number[] | undefined) =>
            values?.map((n) => Number(n.toFixed(3)) || 0);
          return JSON.stringify({
            origin: rounded(
              mirror
                ? [-(c.origin[0] + c.size[0]), c.origin[1], c.origin[2]]
                : c.origin,
            ),
            size: rounded(c.size),
            pivot: rounded(
              mirror && c.pivot
                ? [-c.pivot[0], c.pivot[1], c.pivot[2]]
                : c.pivot,
            ),
            rotation: rounded(
              mirror && c.rotation
                ? [c.rotation[0], -c.rotation[1], -c.rotation[2]]
                : c.rotation,
            ),
          });
        })
        .sort();
    for (const k of [0, 1, 2]) {
      const left = bone(`track_l_${k}`).cubes ?? [];
      const right = bone(`track_r_${k}`).cubes ?? [];
      expect(left).toHaveLength(87);
      expect(right).toHaveLength(87);
      expect(normalized(left, false)).toEqual(normalized(right, true));
    }
    for (const wheel of ["idler_front", "idler_rear", "sprocket"]) {
      const pivot = bone(`${wheel}_r`).pivot;
      expect(pivot).toBeDefined();
      if (!pivot) throw new Error("Missing wheel pivot");
      expect(pivot[0]).toBeLessThan(0);
      expect(bone(`${wheel}_l`).pivot).toEqual([-pivot[0], pivot[1], pivot[2]]);
    }
  });
  it("hinges door_glass with door_l and puts the glass bones last", () => {
    expect(bone("door_glass").pivot).toEqual(bone("door_l").pivot);
    expect(
      bones()
        .slice(-2)
        .map((b) => b.name),
    ).toEqual(["glass", "door_glass"]);
    for (const b of bones())
      for (const c of b.cubes ?? []) {
        const slots = Object.values(c.uv).map((face) => face.uv[0]);
        if (slots.includes(32))
          expect(["glass", "door_glass"]).toContain(b.name);
        if (["glass", "door_glass"].includes(b.name))
          expect(slots.every((slot) => slot === 32)).toBe(true);
      }
  });
  it("has a thruster locator on body", () => {
    expect(bone("body").locators?.thruster).toEqual([
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    ]);
  });
  it("seats the driver and lights from bones on body", () => {
    expect(bone("seat_0").pivot).toEqual([0, 28.6, 22.0]);
    expect(bone("headlights").parent).toBe("body");
    expect(bone("beacon").parent).toBe("body");
    expect(bone("headlights").cubes).toHaveLength(9);
    expect(bone("beacon").cubes).toHaveLength(1);
  });
  it("pins the blade front and the model reach that the profile is built from", () => {
    const front = Math.min(...points(bone("blade")).map((p) => p[2]));
    expect(front).toBeCloseTo(-38.4, 3);
    for (const b of bones().filter((b) => b.name !== "blade"))
      for (const p of points(b)) expect(p[2]).toBeGreaterThanOrEqual(front);
    expect(
      Math.min(...points(bone("headlights")).map((p) => p[2])),
    ).toBeCloseTo(-14.8, 3);
    const reach = Math.max(
      ...bones()
        .flatMap(points)
        .map(([x, , z]) => Math.hypot(x, z) / 16),
    );
    expect(reach).toBeCloseTo(3.335, 3);
    expect(reach).toBeLessThanOrEqual(3.35);
  });
});
