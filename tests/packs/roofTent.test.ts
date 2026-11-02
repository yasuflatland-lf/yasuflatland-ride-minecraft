import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { SUV_SPEC } from "../../src/domain/vehicle/kinds/suv/spec";
import {
  ROOF_TENT_FAMILY,
  ROOF_TENT_FLAP_OPEN_PROPERTY,
  ROOF_TENT_ITEM,
  ROOF_TENT_LADDER_PROPERTY,
  ROOF_TENT_OCCUPIED_PROPERTY,
  ROOF_TENT_TYPE,
} from "../../src/infrastructure/camp/identifiers";
import { PACK_STEM_TAGS } from "../../src/test-pack/impact";
import { type Bone, turnedCorners } from "../support/geometry";
import { readRgbaPng } from "../support/png";
import { assertOneAxis } from "./oneAxis";

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const entity = read(`${BP}/entities/yasu_ride/roof_tent.se.json`)[
  "minecraft:entity"
];
const client = read(`${RP}/entity/yasu_ride/roof_tent.ce.json`)[
  "minecraft:client_entity"
].description;
const geometries = read(`${RP}/models/entity/yasu_ride/roof_tent.geo.json`)[
  "minecraft:geometry"
];
type TexturedBone = Omit<Bone, "cubes"> & {
  cubes?: (NonNullable<Bone["cubes"]>[number] & {
    uv: Record<string, { uv: [number, number]; uv_size: [number, number] }>;
  })[];
};
const geometry = geometries[0];
const suvDims = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `
import json, sys
from dataclasses import asdict
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('gen_roof_tent')
print(json.dumps(m.tent.rounded(json.loads(json.dumps(asdict(m.SUV_DIMS))))))
`,
    ],
    { encoding: "utf8" },
  ),
);

describe("roof tent asset contract", () => {
  it("declares stable identifiers, synced flags, fixed collision, and damage immunity", () => {
    expect(ROOF_TENT_TYPE).toBe("yasu_ride:roof_tent");
    expect(ROOF_TENT_ITEM).toBe("yasu_ride:roof_tent_item");
    expect(entity.description).toEqual({
      identifier: ROOF_TENT_TYPE,
      is_spawnable: false,
      is_summonable: true,
      properties: Object.fromEntries(
        [
          ROOF_TENT_LADDER_PROPERTY,
          ROOF_TENT_FLAP_OPEN_PROPERTY,
          ROOF_TENT_OCCUPIED_PROPERTY,
        ].map((p) => [p, { type: "bool", default: false, client_sync: true }]),
      ),
    });
    expect([
      ROOF_TENT_LADDER_PROPERTY,
      ROOF_TENT_FLAP_OPEN_PROPERTY,
      ROOF_TENT_OCCUPIED_PROPERTY,
    ]).toEqual([
      "yasu_ride:ladder",
      "yasu_ride:flap_open",
      "yasu_ride:occupied",
    ]);
    expect(entity.components["minecraft:type_family"].family).toEqual([
      ROOF_TENT_FAMILY,
      "inanimate",
    ]);
    expect(ROOF_TENT_FAMILY).toBe("yasu_ride:roof_tent");
    expect(entity.components["minecraft:collision_box"]).toEqual({
      width: 2,
      height: 1.2,
    });
    const suvBounds =
      entity.component_groups["yasu_ride:suv_bounds"][
        "minecraft:collision_box"
      ];
    expect(suvBounds).toEqual({ width: 5.2, height: 1.7 });
    expect(entity.events["yasu_ride:suv_bounds"]).toEqual({
      add: { component_groups: ["yasu_ride:suv_bounds"] },
    });
    expect(suvBounds.width).toBeGreaterThanOrEqual(
      (2 * suvDims.half_width) / 16,
    );
    expect(suvBounds.height).toBeGreaterThanOrEqual(
      (suvDims.shell_lift +
        suvDims.ridge_height +
        suvDims.ridge_cap_lift +
        suvDims.ridge_cap_thickness +
        suvDims.seam_proud +
        suvDims.seam_width) /
        16,
    );
    expect(SUV_SPEC.roofTentAnchorX - suvDims.half_width / 16).toBeCloseTo(
      -SUV_SPEC.bodyHalfWidth + 0.875,
    );
    expect(
      SUV_SPEC.roofTentAnchorX +
        suvDims.half_width / 16 -
        SUV_SPEC.bodyHalfWidth,
    ).toBeGreaterThan(0);
    expect(entity.components["minecraft:physics"]).toEqual({
      has_collision: false,
      has_gravity: false,
    });
    const tent = read(`${BP}/entities/yasu_ride/tent.se.json`)[
      "minecraft:entity"
    ];
    expect(entity.components["minecraft:damage_sensor"]).toEqual(
      tent.components["minecraft:damage_sensor"],
    );
    expect(entity.components["minecraft:pushable"]).toEqual(
      tent.components["minecraft:pushable"],
    );
    expect(entity.components["minecraft:persistent"]).toEqual({});
  });

  it("maps the model +x ladder foot to the vehicle-left gameplay entrance", () => {
    const ladder: TexturedBone = geometries[1].bones.find(
      (bone: TexturedBone) => bone.name === "ladder",
    );
    expect(ladder.pivot?.[0]).toBeGreaterThan(0);
    const corners = (ladder.cubes ?? []).flatMap((cube) => {
      expect(cube.origin[0]).toBeGreaterThan(0);
      expect(cube.rotation?.[2]).toBeLessThan(0);
      return turnedCorners(ladder, cube);
    });
    const foot = corners.reduce((lowest, point) =>
      point[1] < lowest[1] ? point : lowest,
    );
    expect(foot[0]).toBeGreaterThan(ladder.pivot?.[0] ?? 0);
    expect(SUV_SPEC.roofTentEntranceX).toBeCloseTo(
      SUV_SPEC.roofTentAnchorX + foot[0] / 16,
      4,
    );
    expect(SUV_SPEC.roofTentEntranceZ).toBeCloseTo(
      SUV_SPEC.roofTentAnchorZ - (ladder.pivot?.[2] ?? 0) / 16,
      4,
    );
    expect(SUV_SPEC.roofTentRoofHeight + foot[1] / 16).toBeCloseTo(0, 4);
    const bounds =
      entity.component_groups["yasu_ride:suv_bounds"][
        "minecraft:collision_box"
      ];
    for (const [x, , z] of corners) {
      expect(Math.abs(x / 16)).toBeLessThan(bounds.width / 2);
      expect(Math.abs(z / 16)).toBeLessThan(bounds.width / 2);
    }
  });

  it("switches every paint variant in shared PAINTS order", () => {
    expect(entity.components["minecraft:variant"]).toEqual({ value: 0 });
    const groups = PAINTS.map((paint) => `yasu_ride:paint_${paint}`);
    expect(Object.keys(entity.component_groups)).toEqual([
      "yasu_ride:suv_bounds",
      ...groups,
    ]);
    expect(Object.keys(entity.events)).toEqual([
      "yasu_ride:suv_bounds",
      ...groups,
    ]);
    for (const [index, group] of groups.entries()) {
      expect(entity.component_groups[group]).toEqual({
        "minecraft:variant": { value: index },
      });
      expect(entity.events[group]).toEqual({
        add: { component_groups: [group] },
        remove: { component_groups: groups.filter((g) => g !== group) },
      });
    }
  });

  it("selects paint textures, blends mesh, hides the ladder, and rolls the entrance flap", () => {
    expect(client.identifier).toBe(ROOF_TENT_TYPE);
    expect(client.geometry).toEqual({
      default: "geometry.yasu_ride.roof_tent",
      suv: "geometry.yasu_ride.roof_tent_suv",
    });
    expect(client.materials).toEqual({ default: "entity_alphablend" });
    expect(client.textures).toEqual(
      Object.fromEntries(
        PAINTS.map((p) => [
          p === "khaki" ? "default" : p,
          `textures/entity/yasu_ride/roof_tent${p === "khaki" ? "" : `_${p}`}`,
        ]),
      ),
    );
    expect(client.render_controllers).toEqual([
      "controller.render.yasu_ride.roof_tent",
    ]);
    const controller = read(
      `${RP}/render_controllers/yasu_ride/roof_tent.rc.json`,
    ).render_controllers[client.render_controllers[0]];
    expect(controller).toEqual({
      arrays: {
        textures: {
          "Array.paints": PAINTS.map(
            (p) => `Texture.${p === "khaki" ? "default" : p}`,
          ),
        },
      },
      geometry:
        "query.property('yasu_ride:ladder') ? Geometry.suv : Geometry.default",
      materials: [{ "*": "Material.default" }],
      textures: ["Array.paints[query.variant]"],
      part_visibility: [{ ladder: "query.property('yasu_ride:ladder')" }],
    });
    expect(client.animations).toEqual({
      flap: "animation.yasu_ride.roof_tent.flap",
    });
    expect(client.scripts).toEqual({ animate: ["flap"] });
    expect(
      read(`${RP}/animations/yasu_ride/roof_tent.anim.json`).animations,
    ).toEqual({
      "animation.yasu_ride.roof_tent.flap": {
        loop: true,
        bones: {
          flap: {
            scale: [1, "q.property('yasu_ride:flap_open') ? 0.125 : 1", 1],
          },
        },
      },
    });
  });

  it.each([false, true])(
    "keeps the full bone, shell, bedding, UV, and bounds contract (SUV: %s)",
    (suv) => {
      expect(
        geometries.map((g: typeof geometry) => g.description.identifier),
      ).toEqual([
        "geometry.yasu_ride.roof_tent",
        "geometry.yasu_ride.roof_tent_suv",
      ]);
      const bones: TexturedBone[] = geometries[suv ? 1 : 0].bones;
      expect(bones.map((b) => b.name)).toEqual([
        "root",
        "body",
        "fabric",
        "flap",
        "sleeping_bag",
        "ladder",
      ]);
      expect(bones.find((b) => b.name === "root")?.parent).toBeUndefined();
      expect(bones.find((b) => b.name === "body")?.parent).toBe("root");
      expect(bones.find((b) => b.name === "flap")?.pivot).toEqual(
        suv
          ? [
              0,
              suvDims.shell_lift +
                suvDims.platform_height +
                suvDims.panel_thickness,
              -suvDims.half_depth,
            ]
          : [0, 12, -20],
      );
      const ladder = bones.find((b) => b.name === "ladder");
      expect(ladder?.pivot).toEqual(
        suv
          ? [
              suvDims.ladder_pivot[0],
              suvDims.ladder_pivot[1] + suvDims.shell_lift,
              suvDims.ladder_pivot[2],
            ]
          : [16, 2, 0],
      );
      for (const cube of ladder?.cubes ?? []) {
        expect(cube.origin[0]).toBeGreaterThanOrEqual(16);
      }
      assertOneAxis(
        bones.flatMap((b) => b.cubes ?? []),
        {},
      );
      for (const bone of bones) {
        for (const cube of bone.cubes ?? []) {
          for (const [x, y, z] of turnedCorners(bone, cube)) {
            expect(x).toBeGreaterThanOrEqual(
              bone.name === "ladder"
                ? suv
                  ? suvDims.ladder_lower[0]
                  : 16
                : suv
                  ? -suvDims.half_width - 1
                  : -17,
            );
            expect(x).toBeLessThanOrEqual(
              bone.name === "ladder"
                ? suv
                  ? suvDims.ladder_upper_x
                  : 27
                : suv
                  ? suvDims.half_width + 1
                  : 17,
            );
            expect(y).toBeGreaterThanOrEqual(
              bone.name === "ladder"
                ? suv
                  ? suvDims.ladder_lower[1]
                  : -33
                : suv
                  ? -suvDims.mount_foot_drop
                  : 0,
            );
            expect(y).toBeLessThanOrEqual(
              suv ? suvDims.ridge_height + suvDims.shell_lift + 1 : 20,
            );
            expect(z).toBeGreaterThanOrEqual(
              suv ? -suvDims.half_depth - 1.5 : -31,
            );
            expect(z).toBeLessThanOrEqual(suv ? suvDims.half_depth + 1.5 : 20);
            if (bone.name === "sleeping_bag") {
              expect(Math.abs(x)).toBeLessThan(
                suv ? suvDims.half_width - suvDims.end_inset : 15,
              );
              expect(y).toBeGreaterThanOrEqual(
                suv ? suvDims.platform_height + suvDims.shell_lift : 2,
              );
              expect(y).toBeLessThanOrEqual(
                suv ? suvDims.window_bottom + suvDims.shell_lift : 5,
              );
              expect(Math.abs(z)).toBeLessThan(
                suv ? suvDims.half_depth - 1 : 19,
              );
            }
          }
          for (const face of Object.values(cube.uv)) {
            expect(face.uv_size).toEqual([4, 4]);
            const [u, v] = face.uv;
            const slot = u / 4 + v;
            if (slot < 2) expect(["fabric", "flap"]).toContain(bone.name);
          }
        }
      }
      const shell = bones.find((b) => b.name === "fabric");
      expect(shell?.cubes?.filter((c) => c.rotation?.[2]).length).toBe(
        suv
          ? 18 +
              15 * suvDims.end_window_sides.length +
              (2 - suvDims.end_window_sides.length) *
                (4 + 2 * suvDims.zip_chamfer_steps)
          : 2,
      );
      const mesh = shell?.cubes?.filter((c) =>
        Object.values(c.uv).every((f) => f.uv[0] === 4 && f.uv[1] === 8),
      );
      expect(mesh).toHaveLength(suv ? 2 + suvDims.end_window_sides.length : 2);
    },
  );

  it("fits the wide SUV profile with thin window panels and a ground-reaching rear-left ladder", () => {
    const d = suvDims;
    expect((d.half_width * 2) / 16).toBeCloseTo(1.2 * 1.64 * 2);
    expect(d.half_depth * 2).toBeCloseTo(38.4);
    expect(d.ridge_height - d.wall_height).toBeLessThan(
      d.ridge_cap_half_depth * 2,
    );
    const bones: TexturedBone[] = geometries[1].bones;
    const shell = bones.find((b) => b.name === "fabric") as TexturedBone;
    const roofs =
      shell.cubes?.filter(
        (c) => c.rotation?.[0] && c.size[1] === d.panel_thickness,
      ) ?? [];
    expect(roofs).toHaveLength(2);
    for (const roof of roofs) {
      expect(roof.rotation?.slice(1)).toEqual([0, 0]);
      expect(roof.size[0]).toBeCloseTo(2 * (d.half_width - d.end_inset));
      expect(roof.size[1]).toBe(d.panel_thickness);
      for (const [, y, z] of turnedCorners(shell, roof)) {
        const profile =
          d.shell_lift +
          d.ridge_height -
          (Math.abs(z) * (d.ridge_height - d.wall_height)) / d.half_roof;
        expect(Math.abs(y - profile)).toBeLessThan(d.panel_thickness + 0.1);
      }
    }
    const endSheets =
      shell.cubes?.filter(
        (c) =>
          c.rotation?.[2] &&
          c.size[0] === d.panel_thickness &&
          c.size[2] > d.half_depth &&
          Object.values(c.uv).every((f) => f.uv[0] === 0 && f.uv[1] === 0),
      ) ?? [];
    expect(endSheets).toHaveLength(2 + d.end_window_sides.length);
    for (const panel of endSheets) {
      expect(panel.size[0]).toBe(d.panel_thickness);
      for (const [x, y] of turnedCorners(shell, panel)) {
        const profile =
          d.half_width -
          ((y - d.shell_lift - d.platform_height) * d.end_inset) /
            (d.wall_height - d.platform_height);
        expect(Math.abs(Math.abs(x) - profile)).toBeLessThan(d.panel_thickness);
      }
    }
    const longSides =
      shell.cubes?.filter(
        (c) =>
          !c.rotation?.[0] &&
          Math.abs(c.origin[2]) >= d.half_depth - d.panel_thickness &&
          c.origin[1] < d.wall_height + d.shell_lift &&
          c.size[2] <= d.panel_thickness + d.frame_thickness,
      ) ?? [];
    expect(longSides.length).toBeGreaterThan(0);
    for (const panel of longSides) {
      for (const [x, y] of turnedCorners(shell, panel)) {
        const edge =
          d.half_width -
          ((y - d.shell_lift - d.platform_height) * d.end_inset) /
            (d.wall_height - d.platform_height);
        expect(Math.abs(x)).toBeLessThanOrEqual(
          edge +
            d.panel_thickness *
              Math.max(0.5, d.end_inset / (d.wall_height - d.platform_height)) +
            d.seam_proud,
        );
      }
    }
    const gableCourses = Math.ceil(
      (d.ridge_height - d.wall_height) / d.panel_thickness,
    );
    const gables =
      shell.cubes?.filter(
        (c) =>
          !c.rotation &&
          c.origin[1] >= d.wall_height + d.shell_lift &&
          c.size[0] === d.panel_thickness &&
          Object.values(c.uv).every((f) => f.uv[0] === 0 && f.uv[1] === 0),
      ) ?? [];
    expect(gables).toHaveLength(2 * gableCourses);
    for (const strip of gables) {
      const low = strip.origin[1] - d.shell_lift;
      const halfZ =
        (d.half_roof * (d.ridge_height - low)) /
        (d.ridge_height - d.wall_height);
      expect(strip.origin[2]).toBeCloseTo(-halfZ, 2);
      expect(strip.size[2]).toBeCloseTo(2 * halfZ, 2);
      expect(strip.size[1]).toBeCloseTo(
        (d.ridge_height - d.wall_height) / gableCourses,
        3,
      );
      expect(Math.abs(strip.origin[0] + strip.size[0] / 2)).toBeCloseTo(
        d.half_width -
          ((low - d.platform_height) * d.end_inset) /
            (d.wall_height - d.platform_height),
        2,
      );
    }
    const mesh =
      shell.cubes?.filter((c) =>
        Object.values(c.uv).every((f) => f.uv[0] === 4 && f.uv[1] === 8),
      ) ?? [];
    expect(mesh).toHaveLength(2 + d.end_window_sides.length);
    for (const window of mesh) {
      expect(Math.min(...window.size)).toBeLessThan(d.panel_thickness);
      const endWindow = Boolean(window.rotation?.[2]);
      if (endWindow) {
        expect(window.size[1]).toBeCloseTo(
          d.end_window_top - d.end_window_bottom,
        );
        expect(window.size[2]).toBe(2 * d.end_window_half_depth);
        expect(window.pivot?.[0]).toBeGreaterThan(0);
      }
      const [wx, wy, wz] = window.origin;
      const [ww, wh, wd] = window.size;
      for (const opaque of shell.cubes?.filter(
        (c) =>
          !mesh.includes(c) &&
          JSON.stringify(c.rotation) === JSON.stringify(window.rotation) &&
          JSON.stringify(c.pivot) === JSON.stringify(window.pivot),
      ) ?? []) {
        const [x, y, z] = opaque.origin;
        const [w, h, depth] = opaque.size;
        expect(
          x < wx + ww - 0.01 &&
            x + w > wx + 0.01 &&
            y < wy + wh - 0.01 &&
            y + h > wy + 0.01 &&
            z < wz + wd &&
            z + depth > wz,
        ).toBe(false);
      }
    }
    const flap = bones.find((b) => b.name === "flap") as TexturedBone;
    expect(flap.cubes).toHaveLength(1 + 2 + 4 + 1);
    expect(
      flap.cubes
        ?.slice(1)
        .every((c) =>
          Object.values(c.uv).every((f) => f.uv[0] === 8 && f.uv[1] === 4),
        ),
    ).toBe(true);
    expect(flap.cubes?.at(-1)?.size[0]).toBe(d.flap_strap_width);
    const flapCube = flap.cubes?.[0];
    expect(flap.pivot).toEqual([0, flapCube?.origin[1], -d.half_depth]);
    expect(flapCube?.size[0]).toBe(2 * d.doorway_half_width);
    expect(flapCube?.size[2]).toBe(d.panel_thickness);
    const body = bones.find((b) => b.name === "body") as TexturedBone;
    const postCount = d.pole_x.length * 2;
    expect(body.cubes).toHaveLength(
      1 + postCount + d.mount_bar_x.length * (1 + d.mount_foot_z.length),
    );
    for (const post of body.cubes?.slice(1, 1 + postCount) ?? []) {
      for (const [x, y, z] of turnedCorners(body, post)) {
        expect(Math.abs(x)).toBeLessThan(
          d.half_width -
            ((y - d.shell_lift - d.platform_height) * d.end_inset) /
              (d.wall_height - d.platform_height),
        );
        expect(Math.abs(z)).toBeLessThan(d.half_depth);
      }
    }
    const ladder = bones.find((b) => b.name === "ladder") as TexturedBone;
    expect(ladder.pivot).toEqual([
      d.ladder_pivot[0],
      d.ladder_pivot[1] + d.shell_lift,
      d.ladder_pivot[2],
    ]);
    expect(ladder.cubes).toHaveLength(
      2 +
        3 *
          Math.ceil(
            (d.ladder_pivot[1] - d.ladder_first_rung) / d.ladder_rung_spacing,
          ),
    );
    for (const cube of ladder.cubes ?? []) {
      expect(cube.pivot).toEqual(ladder.pivot);
      expect(cube.rotation?.[2]).toBeCloseTo(d.ladder_tilt, 3);
    }
    const rails = ladder.cubes?.slice(0, 2) ?? [];
    expect(rails.map((c) => c.size[1])).toEqual(
      d.ladder_rails_z.map(() => d.ladder_pivot[1] - d.ladder_bottom),
    );
    const tape =
      ladder.cubes?.filter((c) =>
        Object.values(c.uv).every((f) => f.uv[0] === 0 && f.uv[1] === 8),
      ) ?? [];
    expect(tape).toHaveLength(
      2 *
        Math.ceil(
          (d.ladder_pivot[1] - d.ladder_first_rung) / d.ladder_rung_spacing,
        ),
    );
    for (const patch of tape) {
      expect(patch.origin[0]).toBeCloseTo(
        d.ladder_pivot[0] + d.ladder_rail_width,
      );
      expect(patch.size[0]).toBe(d.ladder_tape_thickness);
      expect(patch.size[2]).toBe(d.ladder_tape_length);
    }
    expect(rails.map((c) => c.origin[2])).toEqual(d.ladder_rails_z);
    const corners = rails.flatMap((c) => turnedCorners(ladder, c));
    expect(Math.min(...corners.map(([x]) => x))).toBeCloseTo(
      d.ladder_pivot[0],
      3,
    );
    expect(d.ladder_pivot[0]).toBeGreaterThan(d.half_width);
    expect(Math.min(...corners.map(([, y]) => y))).toBeCloseTo(
      d.ladder_foot[1],
      3,
    );
    expect(d.ladder_foot[1] + d.host_roof_height).toBeCloseTo(0, 3);
    expect(SUV_SPEC.roofTentRoofHeight * 16).toBeCloseTo(d.host_roof_height);
    expect(SUV_SPEC.roofTentEntranceX).toBeCloseTo(
      SUV_SPEC.roofTentAnchorX + d.ladder_foot[0] / 16,
    );
    expect(SUV_SPEC.roofTentEntranceZ).toBeCloseTo(
      SUV_SPEC.roofTentAnchorZ - d.ladder_pivot[2] / 16,
    );
    expect(d.ladder_rails_z[0]).toBeGreaterThan(-d.end_window_half_depth);
    expect(d.ladder_rails_z[1] + d.ladder_rail_width).toBeLessThanOrEqual(
      d.end_window_half_depth + d.frame_thickness + d.seam_width,
    );
    expect(d.end_window_top + d.frame_thickness).toBeLessThan(
      d.platform_height +
        Math.hypot(d.wall_height - d.platform_height, d.end_inset),
    );
    const foot = corners.find(
      ([x, y]) =>
        Math.abs(x - d.ladder_foot[0]) < 0.001 &&
        Math.abs(y - d.ladder_foot[1]) < 0.001,
    );
    expect(foot).toBeDefined();
    expect(Math.min(...corners.map(([, , z]) => z))).toBeGreaterThan(0);
    const bounds = geometries[1].description;
    expect(bounds.visible_bounds_width).toBe(d.visible_bounds_width);
    expect(bounds.visible_bounds_height).toBe(d.visible_bounds_height);
    expect(bounds.visible_bounds_offset).toEqual(d.visible_bounds_offset);
    for (const bone of bones)
      for (const cube of bone.cubes ?? [])
        for (const [x, y, z] of turnedCorners(bone, cube)) {
          expect(
            Math.abs(x / 16 - bounds.visible_bounds_offset[0]),
          ).toBeLessThan(bounds.visible_bounds_width / 2);
          expect(
            Math.abs(y / 16 - bounds.visible_bounds_offset[1]),
          ).toBeLessThan(bounds.visible_bounds_height / 2);
          expect(
            Math.abs(z / 16 - bounds.visible_bounds_offset[2]),
          ).toBeLessThan(bounds.visible_bounds_width / 2);
        }
  });

  it("adds raised piping, a shallow ridge cap, skirt, toggles, and rack hardware", () => {
    const d = suvDims;
    const bones: TexturedBone[] = geometries[1].bones;
    const fabric = bones.find((b) => b.name === "fabric")?.cubes ?? [];
    const swatch = (cube: (typeof fabric)[number], u: number, v: number) =>
      Object.values(cube.uv).every(
        (face) => face.uv[0] === u && face.uv[1] === v,
      );
    const seams = fabric.filter((c) => swatch(c, 8, 4));
    // Include roof outlines, gable edges, toggles, and the static rear flap seams.
    expect(seams).toHaveLength(
      2 * (4 + 2 * d.zip_chamfer_steps + 2 + 2 + 8 + 8 + 2) +
        4 * Math.ceil((d.ridge_height - d.wall_height) / d.panel_thickness) -
        4 +
        2 +
        1 +
        4 +
        9 * d.end_window_sides.length +
        7 +
        (2 - d.end_window_sides.length) * (4 + 2 * d.zip_chamfer_steps),
    );
    expect(seams.filter((c) => c.rotation?.[2])).toHaveLength(
      2 * (4 + 2) +
        9 * d.end_window_sides.length +
        (2 - d.end_window_sides.length) * (4 + 2 * d.zip_chamfer_steps),
    );
    for (const seam of seams) {
      expect(Math.min(...seam.size)).toBeLessThanOrEqual(
        Math.max(d.frame_thickness, d.panel_thickness),
      );
    }
    const caps = fabric.filter((c) => c.rotation?.[0] && swatch(c, 4, 0));
    expect(caps).toHaveLength(2);
    for (const cap of caps) {
      expect(cap.size[0]).toBeCloseTo(2 * (d.half_width - d.end_inset));
      expect(cap.size[1]).toBe(d.ridge_cap_thickness);
      expect(cap.size[2]).toBeCloseTo(
        Math.hypot(d.ridge_cap_half_depth, d.ridge_cap_rise),
        3,
      );
      expect(Math.abs(cap.rotation?.[0] ?? 0)).toBeCloseTo(
        (Math.atan2(d.ridge_cap_rise, d.ridge_cap_half_depth) * 180) / Math.PI,
        3,
      );
    }
    const skirts = fabric.filter(
      (c) =>
        !c.rotation &&
        c.origin[1] === d.platform_height + d.shell_lift &&
        c.size[0] === 2 * d.half_width,
    );
    expect(skirts).toHaveLength(2);
    const toggles = fabric.filter(
      (c) =>
        swatch(c, 8, 4) &&
        c.size[0] === d.toggle_length &&
        c.size[1] === d.toggle_height,
    );
    expect(toggles).toHaveLength(2 * 4);
    const hardware =
      bones
        .find((b) => b.name === "body")
        ?.cubes?.slice(1 + 2 * d.pole_x.length) ?? [];
    expect(hardware).toHaveLength(
      d.mount_bar_x.length * (1 + d.mount_foot_z.length),
    );
    const base = bones.find((b) => b.name === "body")?.cubes?.[0];
    expect(base && swatch(base, 8, 4)).toBe(true);
    for (const cube of hardware) {
      expect(swatch(cube, 8, 4)).toBe(true);
      expect(cube.origin[1]).toBeGreaterThanOrEqual(0);
      expect(cube.origin[1] + cube.size[1]).toBeLessThanOrEqual(d.shell_lift);
    }
    // Leave room for detail while guarding against accidentally multiplying sheet courses.
    expect(bones.flatMap((b) => b.cubes ?? []).length).toBeLessThan(
      400 + 6 * d.zip_chamfer_steps,
    );
  });

  it("keeps the opposite-end zip door on the sheet with chamfered top corners", () => {
    const d = suvDims;
    const fabric: TexturedBone = geometries[1].bones.find(
      (b: TexturedBone) => b.name === "fabric",
    );
    const sheet = fabric.cubes?.find(
      (c) => c.pivot?.[0] === -d.half_width && c.size[2] === 2 * d.half_depth,
    );
    expect(sheet).toBeDefined();
    const face = -d.half_width - d.panel_thickness / 2 - d.seam_proud;
    const outline =
      fabric.cubes?.filter(
        (c) => Math.abs(c.origin[0] - (face - d.seam_width / 2)) < 0.001,
      ) ?? [];
    expect(outline).toHaveLength(4 + 2 * d.zip_chamfer_steps);
    const half = d.half_depth * d.end_zip_depth_fraction;
    const length = Math.hypot(d.wall_height - d.platform_height, d.end_inset);
    const bottom =
      d.shell_lift +
      d.platform_height +
      (length * (1 - d.end_zip_height_fraction)) / 2;
    const top = bottom + length * d.end_zip_height_fraction;
    for (const seam of outline) {
      expect(seam.pivot).toEqual(sheet?.pivot);
      expect(seam.rotation).toEqual(sheet?.rotation);
      expect(seam.size[0]).toBeCloseTo(d.seam_width);
      expect(seam.origin[1]).toBeGreaterThanOrEqual(bottom - 0.001);
      expect(Math.abs(seam.origin[2])).toBeLessThanOrEqual(half + 0.001);
    }
    const [floor, left, right, ceiling, ...chamfers] = outline;
    expect(floor?.size[2]).toBeCloseTo(2 * half);
    expect(floor?.origin[1]).toBeCloseTo(bottom, 3);
    expect(ceiling?.origin[1]).toBeCloseTo(top - d.seam_width, 3);
    expect(ceiling?.size[2]).toBeCloseTo(2 * (half - d.zip_chamfer));
    for (const side of [left, right]) {
      expect((side?.origin[1] ?? 0) + (side?.size[1] ?? 0)).toBeCloseTo(
        top - d.zip_chamfer,
        2,
      );
    }
    expect(chamfers).toHaveLength(2 * d.zip_chamfer_steps);
    expect(new Set(chamfers.map((c) => c.origin[1])).size).toBe(
      d.zip_chamfer_steps,
    );
    const ladder: TexturedBone = geometries[1].bones.find(
      (b: TexturedBone) => b.name === "ladder",
    );
    const ladderTop = Math.max(
      ...(ladder.cubes ?? []).flatMap((c) =>
        turnedCorners(ladder, c).map(([, y]) => y),
      ),
    );
    const windowBottom = Math.min(
      ...(fabric.cubes ?? [])
        .filter(
          (c) =>
            c.rotation?.[2] &&
            Object.values(c.uv).every((f) => f.uv[0] === 4 && f.uv[1] === 8),
        )
        .flatMap((c) => turnedCorners(fabric, c).map(([, y]) => y)),
    );
    expect(ladderTop).toBeLessThan(windowBottom);
  });

  it("ships all sixteen paints and recolors only fabric swatches", () => {
    const folder = `${RP}/textures/entity/yasu_ride`;
    const names = PAINTS.map(
      (p) => `roof_tent${p === "khaki" ? "" : `_${p}`}.png`,
    );
    expect(
      readdirSync(folder)
        .filter((f) => /^roof_tent(?:_\w+)?\.png$/.test(f))
        .sort(),
    ).toEqual([...names].sort());
    for (const [index, name] of names.entries()) {
      const texture = readRgbaPng(`${folder}/${name}`);
      const ground = readRgbaPng(`${folder}/${name.replace("roof_", "")}`);
      const base = readRgbaPng(`${folder}/roof_tent.png`);
      expect([texture.width, texture.height]).toEqual([
        geometry.description.texture_width,
        geometry.description.texture_height,
      ]);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const start = (y * 16 + x) * 4;
          const pixel = texture.pixels.subarray(start, start + 4);
          const slot = Math.floor(y / 4) * 4 + Math.floor(x / 4);
          if (slot < 2) {
            if (index === 0) {
              const shade = slot === 0 ? 1 : 136 / 176;
              expect([...pixel]).toEqual([
                ...[86, 94, 64].map((channel) => Math.round(channel * shade)),
                255,
              ]);
            } else {
              expect(pixel).toEqual(ground.pixels.subarray(start, start + 4));
            }
            if (index > 0)
              expect(pixel).not.toEqual(base.pixels.subarray(start, start + 4));
          } else expect(pixel).toEqual(base.pixels.subarray(start, start + 4));
          if (slot === 9) {
            expect(pixel[3]).toBeGreaterThan(0);
            expect(pixel[3]).toBeLessThan(255);
          }
        }
    }
  });

  it("ships a single starter item without a recipe, with generated icon and preview", () => {
    const item = read(`${BP}/items/yasu_ride/roof_tent_item.item.json`)[
      "minecraft:item"
    ];
    expect(item.description).toEqual({
      identifier: ROOF_TENT_ITEM,
      menu_category: { category: "items" },
    });
    expect(item.components).toEqual({
      "minecraft:icon": "yasu_ride_roof_tent_item",
      "minecraft:max_stack_size": 1,
      "minecraft:display_name": { value: "item.yasu_ride:roof_tent_item.name" },
    });
    expect(
      existsSync(`${BP}/recipes/yasu_ride/roof_tent_item.recipe.json`),
    ).toBe(false);
    expect(
      read(`${RP}/textures/item_texture.json`).texture_data
        .yasu_ride_roof_tent_item,
    ).toEqual({ textures: "textures/items/yasu_ride/roof_tent_item" });
    for (const [path, size] of [
      [`${RP}/textures/items/yasu_ride/roof_tent_item.png`, 32],
      ["docs/images/items/camping-gear/roof_tent.png", 128],
    ] as const) {
      const image = readRgbaPng(path);
      expect([image.width, image.height]).toEqual([size, size]);
    }
    for (const stem of ["roof_tent", "roof_tent_item"]) {
      expect(PACK_STEM_TAGS[stem]).toEqual([
        "camp",
        "vehicle:suv",
        "vehicle:camper",
      ]);
    }
  });
});
