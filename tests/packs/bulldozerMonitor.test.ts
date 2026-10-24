import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const screens: { item: string; state: string; label: string }[] = read(
  "tools/monitor_screens.json",
).bulldozer;
type Cube = NonNullable<Bone["cubes"]>[number] & {
  pivot: [number, number, number];
  rotation: [number, number, number];
  uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
};
type MonitorBone = Bone & { cubes: Cube[] };
const main = read(`${RP}/models/entity/yasu_ride/bulldozer.geo.json`)[
  "minecraft:geometry"
][0];
const monitor = read(
  `${RP}/models/entity/yasu_ride/bulldozer_monitor.geo.json`,
)["minecraft:geometry"][0];
const monitorBones: MonitorBone[] = monitor.bones;
const boneNames = screens.map((s) => `screen_${s.item}_${s.state}`);
const controllerName = "controller.render.yasu_ride.bulldozer.monitor";

// turnedCorners applies the game's x rotation sign, unlike the preview's rotate (ADR 0051).
function downNormal(cube: Cube): [number, number, number] {
  const [result] = turnedCorners(
    { name: "normal" },
    {
      origin: [0, -1, 0],
      size: [0, 0, 0],
      pivot: [0, 0, 0],
      rotation: cube.rotation,
    },
  );
  if (!result) throw new Error("Missing rotated normal");
  return result;
}
const dot = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + v * (b[i] ?? Number.NaN), 0);
const visibleFace = (cube: Cube, n: number[]) =>
  Math.max(...turnedCorners({ name: "plate" }, cube).map((p) => dot(p, n)));

describe("bulldozer cab monitor (ADR 0139)", () => {
  it("uses ordered top-level screen bones and the main model's visible bounds", () => {
    const { description } = monitor;
    expect(description.identifier).toBe("geometry.yasu_ride.bulldozer_monitor");
    expect([description.texture_width, description.texture_height]).toEqual([
      48,
      32 * screens.length,
    ]);
    for (const key of [
      "visible_bounds_width",
      "visible_bounds_height",
      "visible_bounds_offset",
    ])
      expect(description[key]).toEqual(main.description[key]);
    expect(monitorBones.map((b) => b.name)).toEqual(boneNames);
    for (const b of monitorBones) {
      expect(b.parent).toBeUndefined();
      expect(b.pivot).toEqual([0, 0, 0]);
    }
  });
  it("maps exactly one face of each single cube to its atlas cell", () => {
    monitorBones.forEach((b, k) => {
      expect(b.cubes).toHaveLength(1);
      const cube = b.cubes[0] as Cube;
      expect(Object.keys(cube.uv)).toEqual(["down"]);
      const uv = cube.uv.down;
      if (!uv) throw new Error("Missing down UV");
      expect(uv.uv_size.map(Math.abs)).toEqual([48, 32]);
      expect(
        uv.uv.map((v, axis) =>
          Math.min(v, v + (uv.uv_size[axis] ?? Number.NaN)),
        ),
      ).toEqual([0, k * 32]);
    });
  });
  it("faces the seat and clears the console screen by at least 0.1 px", () => {
    const body = main.bones.find((b: Bone) => b.name === "body");
    const screen = body.cubes.find(
      (c: Cube) =>
        JSON.stringify(c.rotation) === "[138.366,0,0]" &&
        Object.values(c.uv).every((f) => f.uv[0] === 25),
    ) as Cube;
    expect(screen).toBeDefined();
    const seat = main.bones.find((b: Bone) => b.name === "seat_0")
      .pivot as number[];
    for (const b of monitorBones) {
      const cube = b.cubes[0] as Cube;
      expect(cube.rotation).toEqual(screen.rotation);
      expect(cube.size[0]).toBe(4.4);
      expect(cube.size[1]).toBe(0.02);
      expect(cube.size[2]).toBe(screen.size[2]);
      const n = downNormal(cube);
      expect(n[1]).toBeGreaterThan(0);
      expect(n[2]).toBeGreaterThan(0);
      expect(
        dot(
          n,
          seat.map((v, i) => v - (cube.pivot[i] ?? Number.NaN)),
        ),
      ).toBeGreaterThan(0);
      // The generator rounds origins and pivots to 0.001 px, so allow that quantization.
      const clearance = visibleFace(cube, n) - visibleFace(screen, n);
      expect(clearance).toBeGreaterThanOrEqual(0.1 - 0.001);
    }
  });
  it("uses an RGBA atlas with opaque background and emissive texels", () => {
    const { width, height, pixels } = readRgbaPng(
      `${RP}/textures/entity/yasu_ride/bulldozer_monitor.png`,
    );
    expect([width, height]).toEqual([48, 32 * screens.length]);
    const alphas = new Set(Array.from(pixels).filter((_, i) => i % 4 === 3));
    expect([...alphas].sort()).toEqual([0, 255]);
  });
  it("selects one emissive screen by property value", () => {
    expect(
      read(`${RP}/render_controllers/yasu_ride/bulldozer_monitor.rc.json`),
    ).toEqual({
      format_version: "1.8.0",
      render_controllers: {
        [controllerName]: {
          geometry: "Geometry.monitor",
          materials: [{ "*": "Material.lamp_lit" }],
          textures: ["Texture.monitor"],
          part_visibility: [
            { "*": false },
            ...boneNames.map((name, k) => ({
              [name]: `query.property('yasu_ride:monitor') == ${k + 1}`,
            })),
          ],
        },
      },
    });
  });
  it("draws the monitor before glass and leaves it hidden by default", () => {
    const client = read(`${RP}/entity/yasu_ride/bulldozer.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.geometry.monitor).toBe(
      "geometry.yasu_ride.bulldozer_monitor",
    );
    expect(client.textures.monitor).toBe(
      "textures/entity/yasu_ride/bulldozer_monitor",
    );
    expect(client.render_controllers).toEqual([
      { [controllerName]: "query.property('yasu_ride:monitor') > 0" },
      "controller.render.yasu_ride.bulldozer",
    ]);
    expect(screens.length).toBeGreaterThanOrEqual(1);
    expect(
      read("packs/yasu_ride_bp/entities/yasu_ride/bulldozer.se.json")[
        "minecraft:entity"
      ].description.properties["yasu_ride:monitor"],
    ).toEqual({
      type: "int",
      range: [0, screens.length],
      default: 0,
      client_sync: true,
    });
  });
});
