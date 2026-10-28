import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const screens: { item: string; state: string; label: string }[] = read(
  "tools/monitor_screens.json",
).sportsboat;
type Cube = NonNullable<Bone["cubes"]>[number] & {
  pivot: [number, number, number];
  rotation: [number, number, number];
  uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
};
type MonitorBone = Bone & { cubes: Cube[] };
const main = read(`${RP}/models/entity/yasu_ride/sportsboat.geo.json`)[
  "minecraft:geometry"
][0];
const monitor = read(
  `${RP}/models/entity/yasu_ride/sportsboat_monitor.geo.json`,
)["minecraft:geometry"][0];
const monitorBones: MonitorBone[] = monitor.bones.filter(
  (b: Bone) => b.name !== "root",
);
const boneNames = screens.map((s) => `screen_${s.item}_${s.state}`);
const controllerName = "controller.render.yasu_ride.sportsboat.monitor";

// turnedCorners applies the game's x rotation sign, unlike the preview's rotate (ADR 0051).
function southNormal(cube: Cube): [number, number, number] {
  const [result] = turnedCorners(
    { name: "normal" },
    {
      origin: [0, 0, 1],
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

describe("sportsboat dash monitor (ADR 0171)", () => {
  it("uses ordered screen bones and the main model's visible bounds", () => {
    const { description } = monitor;
    expect(description.identifier).toBe(
      "geometry.yasu_ride.sportsboat_monitor",
    );
    expect([description.texture_width, description.texture_height]).toEqual([
      64,
      36 * screens.length,
    ]);
    for (const key of [
      "visible_bounds_width",
      "visible_bounds_height",
      "visible_bounds_offset",
    ])
      expect(description[key]).toEqual(main.description[key]);
    expect(monitorBones.map((b) => b.name)).toEqual(boneNames);
    for (const b of monitorBones) {
      expect(b.parent).toBe("root");
      expect(b.pivot).toEqual([0, 0, 0]);
    }
  });
  it("hangs the screens from a cubeless root that the attitude animation tilts with the hull", () => {
    const root = monitor.bones[0];
    const mainRoot = main.bones.find((b: Bone) => b.name === "root");
    expect(root).toEqual({ name: "root", pivot: mainRoot.pivot });
    const attitude = read(`${RP}/animations/yasu_ride/sportsboat.anim.json`)
      .animations["animation.yasu_ride.sportsboat.attitude"];
    expect(Object.keys(attitude.bones)).toEqual(["root"]);
  });
  it("maps exactly one face of each single cube to its atlas cell", () => {
    monitorBones.forEach((b, k) => {
      expect(b.cubes).toHaveLength(1);
      const cube = b.cubes[0] as Cube;
      expect(Object.keys(cube.uv)).toEqual(["south"]);
      const uv = cube.uv.south;
      if (!uv) throw new Error("Missing south UV");
      expect(uv.uv_size.map(Math.abs)).toEqual([64, 36]);
      expect(
        uv.uv.map((v, axis) =>
          Math.min(v, v + (uv.uv_size[axis] ?? Number.NaN)),
        ),
      ).toEqual([0, k * 36]);
    });
  });
  it("covers the display face, faces the driver's eye, and clears it by 0.10 px", () => {
    const screen = main.bones
      .flatMap((b: MonitorBone) => b.cubes ?? [])
      .find(
        (c: Cube) =>
          c.size[0] === 6.4 && c.size[1] === 3.6 && c.size[2] === 0.1,
      ) as Cube;
    expect(screen).toBeDefined();
    const server = read(
      "packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json",
    )["minecraft:entity"];
    const seat: number[] =
      server.components["minecraft:rideable"].seats[0].position;
    const eye = seat.map((v, i) => (v + (i === 1 ? 1.62 : 0)) * 16);
    for (const b of monitorBones) {
      const cube = b.cubes[0] as Cube;
      expect(cube.rotation).toEqual(screen.rotation);
      cube.pivot.forEach((v, i) => {
        expect(v).toBeCloseTo(screen.pivot[i] ?? Number.NaN, 3);
      });
      expect(cube.size.slice(0, 2)).toEqual(screen.size.slice(0, 2));
      expect(cube.size[2]).toBe(0.02);
      const n = southNormal(cube);
      expect(n[1]).toBeGreaterThan(0);
      expect(n[2]).toBeGreaterThan(0);
      expect(
        dot(
          n,
          eye.map((v, i) => v - (cube.pivot[i] ?? Number.NaN)),
        ),
      ).toBeGreaterThan(0);
      const clearance = visibleFace(cube, n) - visibleFace(screen, n);
      expect(clearance).toBeCloseTo(0.1, 3);
      // Project both faces onto the screen's horizontal and tilted vertical axes.
      for (const tangent of [
        [1, 0, 0],
        [0, n[2] ?? 0, -(n[1] ?? 0)],
      ]) {
        const extent = (c: Cube) =>
          turnedCorners({ name: "plate" }, c).map((p) => dot(p, tangent));
        expect(Math.min(...extent(cube))).toBeCloseTo(
          Math.min(...extent(screen)),
          3,
        );
        expect(Math.max(...extent(cube))).toBeCloseTo(
          Math.max(...extent(screen)),
          3,
        );
      }
      // South UVs increase toward +x and down the plate, so text reads from the seat.
      expect(cube.uv.south?.uv_size).toEqual([64, 36]);
    }
  });
  it("uses an RGBA atlas with opaque background and emissive texels", () => {
    const { width, height, pixels } = readRgbaPng(
      `${RP}/textures/entity/yasu_ride/sportsboat_monitor.png`,
    );
    expect([width, height]).toEqual([64, 36 * screens.length]);
    const alphas = new Set(Array.from(pixels).filter((_, i) => i % 4 === 3));
    expect([...alphas].sort()).toEqual([0, 255]);
  });
  it("reuses the item icon in each screen and changes only the label between states", () => {
    const atlas = readRgbaPng(
      `${RP}/textures/entity/yasu_ride/sportsboat_monitor.png`,
    );
    const icon = readRgbaPng(
      `${RP}/textures/items/yasu_ride/icebreaker_switch.png`,
    );
    for (let cell = 0; cell < screens.length; cell++) {
      for (let y = 0; y < icon.height; y++) {
        for (let x = 0; x < icon.width; x++) {
          const from = (y * icon.width + x) * 4;
          const at = ((cell * 36 + 10 + y) * atlas.width + 4 + x) * 4;
          if (icon.pixels[from + 3] === 0) {
            expect(atlas.pixels[at + 3]).toBe(255);
          } else {
            expect(atlas.pixels.slice(at, at + 3)).toEqual(
              icon.pixels.slice(from, from + 3),
            );
            expect(atlas.pixels[at + 3]).toBe(0);
          }
        }
      }
    }
    const cellBytes = atlas.width * 36 * 4;
    const first = atlas.pixels.slice(0, cellBytes);
    const second = atlas.pixels.slice(cellBytes);
    expect(first).not.toEqual(second);
    for (let y = 0; y < 36; y++) {
      const row = y * atlas.width * 4;
      expect(first.slice(row, row + 24 * 4)).toEqual(
        second.slice(row, row + 24 * 4),
      );
    }
  });
  it("selects one emissive screen by property value", () => {
    expect(
      read(`${RP}/render_controllers/yasu_ride/sportsboat_monitor.rc.json`),
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
    const client = read(`${RP}/entity/yasu_ride/sportsboat.ce.json`)[
      "minecraft:client_entity"
    ].description;
    expect(client.geometry.monitor).toBe(
      "geometry.yasu_ride.sportsboat_monitor",
    );
    expect(client.textures.monitor).toBe(
      "textures/entity/yasu_ride/sportsboat_monitor",
    );
    expect(client.render_controllers).toEqual([
      { [controllerName]: "query.property('yasu_ride:monitor') > 0" },
      "controller.render.yasu_ride.sportsboat",
      "controller.render.yasu_ride.sportsboat.mirror",
      {
        "controller.render.yasu_ride.sportsboat.lit":
          "query.property('yasu_ride:headlights')",
      },
    ]);
    expect(screens.length).toBeGreaterThanOrEqual(1);
    expect(
      read("packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json")[
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
