import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { profileOf } from "../../src/domain/vehicle/kinds";
import { defined } from "../support/defined";
import {
  type Bone,
  type Triple,
  turn,
  turnedCorners,
} from "../support/geometry";
import { monitorScreens } from "../support/monitorContract";
import { readRgbaPng } from "../support/png";

const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
type Cube = NonNullable<Bone["cubes"]>[number] & {
  pivot: [number, number, number];
  rotation: [number, number, number];
  uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
};
type MonitorBone = Bone & { cubes: Cube[] };
const dot = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + v * (b[i] ?? Number.NaN), 0);
const visibleFace = (cube: Cube, n: number[]) =>
  Math.max(...turnedCorners({ name: "plate" }, cube).map((p) => dot(p, n)));

interface Screen {
  item: string;
  state: string;
}

const screenTable: Record<"bulldozer" | "sportsboat", Screen[]> = read(
  "tools/monitor_screens.json",
);
const monitors = [
  {
    vehicle: "bulldozer",
    screens: screenTable.bulldozer,
    cell: [48, 32],
    face: "down",
    normal: [0, -1, 0],
  },
  {
    vehicle: "sportsboat",
    screens: screenTable.sportsboat,
    cell: [64, 36],
    face: "south",
    normal: [0, 0, 1],
  },
] as const;

it("covers both vehicle monitors and their eight screens", () => {
  expect(monitors).toHaveLength(2);
  expect(monitors.flatMap(({ screens }) => screens)).toHaveLength(8);
});

describe.each(monitors)(
  "$vehicle monitor",
  ({ vehicle, screens, cell, face, normal }) => {
    const [main] = read(`${RP}/models/entity/yasu_ride/${vehicle}.geo.json`)[
      "minecraft:geometry"
    ];
    const [monitor] = read(
      `${RP}/models/entity/yasu_ride/${vehicle}_monitor.geo.json`,
    )["minecraft:geometry"];
    const monitorBones: MonitorBone[] = monitor.bones.filter(
      (bone: Bone) => bone.name !== "root",
    );
    const boneNames = screens.map(
      ({ item, state }) => `screen_${item}_${state}`,
    );
    const controller = `controller.render.yasu_ride.${vehicle}`;
    const controllerName = `${controller}.monitor`;
    const [cellWidth, cellHeight] = cell;
    const server = read(
      `packs/yasu_ride_bp/entities/yasu_ride/${vehicle}.se.json`,
    )["minecraft:entity"];

    it("uses ordered screen bones and the main model's visible bounds", () => {
      const rule = defined(
        profileOf(vehicle).monitor,
        `${vehicle} monitor rule`,
      );
      expect(screens.map(({ item, state }) => ({ item, state }))).toEqual(
        monitorScreens(rule),
      );
      const { description } = monitor;
      expect(description.identifier).toBe(
        `geometry.yasu_ride.${vehicle}_monitor`,
      );
      expect([description.texture_width, description.texture_height]).toEqual([
        cellWidth,
        cellHeight * screens.length,
      ]);
      for (const key of [
        "visible_bounds_width",
        "visible_bounds_height",
        "visible_bounds_offset",
      ])
        expect(description[key]).toEqual(main.description[key]);
      expect(monitorBones.map(({ name }) => name)).toEqual(boneNames);
      for (const bone of monitorBones) {
        expect(bone.parent).toBe(vehicle === "sportsboat" ? "root" : undefined);
        expect(bone.pivot).toEqual([0, 0, 0]);
      }
    });

    it("maps one face of each screen cube to its atlas cell", () => {
      for (const [index, bone] of monitorBones.entries()) {
        expect(bone.cubes).toHaveLength(1);
        const cube = defined(bone.cubes[0], bone.name);
        expect(Object.keys(cube.uv)).toEqual([face]);
        const {
          uv: [u, v],
          uv_size: [width, height],
        } = defined(cube.uv[face], face);
        expect([Math.abs(width), Math.abs(height)]).toEqual(cell);
        expect([Math.min(u, u + width), Math.min(v, v + height)]).toEqual([
          0,
          index * cellHeight,
        ]);
      }
    });

    it("uses an RGBA atlas with opaque background and emissive texels", () => {
      const { width, height, pixels } = readRgbaPng(
        `${RP}/textures/entity/yasu_ride/${vehicle}_monitor.png`,
      );
      expect([width, height]).toEqual([cellWidth, cellHeight * screens.length]);
      const alphas = new Set(pixels.filter((_, index) => index % 4 === 3));
      expect([...alphas].sort()).toEqual([0, 255]);
    });

    it("selects one emissive screen by property value", () => {
      expect(
        read(`${RP}/render_controllers/yasu_ride/${vehicle}_monitor.rc.json`),
      ).toMatchObject({
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
      const client = read(`${RP}/entity/yasu_ride/${vehicle}.ce.json`)[
        "minecraft:client_entity"
      ].description;
      expect(client.geometry.monitor).toBe(
        `geometry.yasu_ride.${vehicle}_monitor`,
      );
      expect(client.textures.monitor).toBe(
        `textures/entity/yasu_ride/${vehicle}_monitor`,
      );
      expect(client.render_controllers).toEqual([
        { [controllerName]: "query.property('yasu_ride:monitor') > 0" },
        controller,
        ...(vehicle === "sportsboat" ? [`${controller}.mirror`] : []),
        { [`${controller}.lit`]: "query.property('yasu_ride:headlights')" },
      ]);
      expect(server.description.properties["yasu_ride:monitor"]).toEqual({
        type: "int",
        range: [0, screens.length],
        default: 0,
        client_sync: true,
      });
    });

    if (vehicle === "bulldozer") {
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
          const n = turn([...normal] as Triple, [0, 0, 0], cube.rotation);
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
    }
    if (vehicle === "sportsboat") {
      it("hangs the screens from a cubeless root that the attitude animation tilts with the hull", () => {
        const root = monitor.bones[0];
        const mainRoot = main.bones.find((b: Bone) => b.name === "root");
        expect(root).toEqual({ name: "root", pivot: mainRoot.pivot });
        const attitude = read(`${RP}/animations/yasu_ride/sportsboat.anim.json`)
          .animations["animation.yasu_ride.sportsboat.attitude"];
        expect(Object.keys(attitude.bones)).toEqual(["root"]);
      });
      it("covers the display face, faces the driver's eye, and clears it by 0.10 px", () => {
        const screen = main.bones
          .flatMap((b: MonitorBone) => b.cubes ?? [])
          .find(
            (c: Cube) =>
              c.size[0] === 6.4 && c.size[1] === 3.6 && c.size[2] === 0.1,
          ) as Cube;
        expect(screen).toBeDefined();
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
          const n = turn([...normal] as Triple, [0, 0, 0], cube.rotation);
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
          expect(cube.uv.south?.uv_size).toEqual(cell);
        }
      });
      it("reuses the item icon in each screen and changes only the label between states", () => {
        const atlas = readRgbaPng(
          `${RP}/textures/entity/yasu_ride/sportsboat_monitor.png`,
        );
        const icon = readRgbaPng(
          `${RP}/textures/items/yasu_ride/icebreaker_switch.png`,
        );
        for (let index = 0; index < screens.length; index++) {
          for (let y = 0; y < icon.height; y++) {
            for (let x = 0; x < icon.width; x++) {
              const from = (y * icon.width + x) * 4;
              const at =
                ((index * cellHeight + 10 + y) * atlas.width + 4 + x) * 4;
              if (icon.pixels[from + 3] === 0) {
                expect(atlas.pixels[at + 3]).toBe(255);
              } else if (Math.max(...icon.pixels.slice(from, from + 3)) < 60) {
                // The near-black deck and rail are lifted so they read on the dark screen.
                expect(
                  Math.min(...atlas.pixels.slice(at, at + 3)),
                ).toBeGreaterThanOrEqual(100);
                expect(atlas.pixels[at + 3]).toBe(0);
              } else {
                expect(atlas.pixels.slice(at, at + 3)).toEqual(
                  icon.pixels.slice(from, from + 3),
                );
                expect(atlas.pixels[at + 3]).toBe(0);
              }
            }
          }
        }
        const cellBytes = atlas.width * cellHeight * 4;
        const first = atlas.pixels.slice(0, cellBytes);
        const second = atlas.pixels.slice(cellBytes);
        expect(first).not.toEqual(second);
        for (let y = 0; y < cellHeight; y++) {
          const row = y * atlas.width * 4;
          expect(first.slice(row, row + 24 * 4)).toEqual(
            second.slice(row, row + 24 * 4),
          );
        }
      });
    }
  },
);
