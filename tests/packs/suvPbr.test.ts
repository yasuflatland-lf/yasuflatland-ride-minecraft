import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINTS } from "../../src/domain/shared/paint";
import { readRgbaPng } from "../support/png";

const directory = "packs/yasu_ride_rp/textures/entity/yasu_ride";
const names: string[] = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      "import json, sys\nsys.path.insert(0, 'tools')\nfrom tool_loader import load_tool\nprint(json.dumps(load_tool('suv_palette').NAMES))",
    ],
    { encoding: "utf8" },
  ),
);
type Png = ReturnType<typeof readRgbaPng>;

function nameFor(paint: string): string {
  return paint === "khaki" ? "suv" : `suv_${paint}`;
}

function merFor(paint: string): Png {
  return readRgbaPng(`${directory}/${nameFor(paint)}_mer.png`);
}

function swatchX(name: string): number {
  const index = names.indexOf(name);
  if (index < 0) throw new Error(`Missing palette swatch: ${name}`);
  return index * 4;
}

// Samples (1, 1) inside the 4-texel cell, past the swatch inset.
function swatch(mer: Png, name: string): number[] {
  const offset = (mer.width + swatchX(name) + 1) * 4;
  return [...mer.pixels.subarray(offset, offset + 4)];
}

const regions: {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  base: string;
}[] = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
a = load_tool('suv_atlas')
print(json.dumps([dict(name=s.name, x=a.region('body', s.name).x, y=a.region('body', s.name).y, w=s.w, h=s.h, base=s.base) for s in a.PAINTERS['body'].REGIONS]))`,
    ],
    { encoding: "utf8" },
  ),
);

function textureSet(name: string): Record<string, string> {
  return JSON.parse(
    readFileSync(`${directory}/${name}.texture_set.json`, "utf8"),
  )["minecraft:texture_set"];
}

const reliefKeys = ["heightmap", "normal"];
const khakiSet = textureSet("suv");
const reliefKind = reliefKeys.find((key) => key in khakiSet) ?? "heightmap";
const reliefName = khakiSet[reliefKind];

describe("SUV paint texture sets", () => {
  it.each(PAINTS)("%s has the exact texture set", (paint) => {
    const name = nameFor(paint);
    expect(
      JSON.parse(readFileSync(`${directory}/${name}.texture_set.json`, "utf8")),
    ).toEqual({
      format_version: "1.16.100",
      "minecraft:texture_set": {
        color: name,
        metalness_emissive_roughness: `${name}_mer`,
        [reliefKind]: reliefName,
      },
    });
  });

  it.each(PAINTS)("%s MER matches the colour size", (paint) => {
    const color = readRgbaPng(`${directory}/${nameFor(paint)}.png`);
    const mer = merFor(paint);
    expect([mer.width, mer.height]).toEqual([color.width, color.height]);
  });

  it.each(PAINTS)(
    "%s has painted steel and matte hardtop swatches",
    (paint) => {
      const mer = merFor(paint);
      expect(swatch(mer, "body")).toEqual([110, 0, 60, 255]);
      for (const name of ["hardtop", "hardtop_rib"])
        expect(swatch(mer, name), name).toEqual([0, 0, 220, 255]);
    },
  );

  it.each(PAINTS)("%s glow swatch has emissive 215", (paint) => {
    expect(swatch(merFor(paint), "glow")[1]).toBe(215);
  });

  it.each(PAINTS)("%s lamp swatches have emissive 0", (paint) => {
    const mer = merFor(paint);
    for (const name of ["light", "tail", "amber"])
      expect(swatch(mer, name)[1], name).toBe(0);
  });

  it.each(PAINTS)(
    "%s has no emissive texels outside the glow cell",
    (paint) => {
      const mer = merFor(paint);
      const glowX = swatchX("glow");
      const offending: [number, number][] = [];
      for (let y = 0; y < mer.height && offending.length < 10; y++) {
        for (let x = 0; x < mer.width && offending.length < 10; x++) {
          if (y < 4 && x >= glowX && x < glowX + 4) continue;
          if (mer.pixels[(y * mer.width + x) * 4 + 1] !== 0)
            offending.push([x, y]);
        }
      }
      expect(offending).toEqual([]);
    },
  );
});

describe("SUV detailed steel body regions", () => {
  it.each(PAINTS)(
    "%s has bounded nonemissive steel and matte hardtop detail",
    (paint) => {
      const mer = merFor(paint);
      const invalid: string[] = [];
      for (const region of regions) {
        for (let y = region.y; y < region.y + region.h; y++) {
          for (let x = region.x; x < region.x + region.w; x++) {
            const i = (y * mer.width + x) * 4;
            const [metal = -1, emissive, rough = -1, alpha] =
              mer.pixels.subarray(i, i + 4);
            const valid =
              region.base === "body"
                ? metal >= 102 && metal <= 118 && rough >= 55 && rough <= 65
                : metal === 0 && rough >= 218 && rough <= 222;
            if (
              (!valid || emissive !== 0 || alpha !== 255) &&
              invalid.length < 10
            )
              invalid.push(`${region.name} at ${x},${y}`);
          }
        }
      }
      expect(invalid).toEqual([]);
    },
  );

  it("keeps thin faces flat and maps arch strips continuously before and after export", () => {
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
s = load_tool('suv_shell')
a = load_tool('suv_atlas')
r = load_tool('render_preview')
c = load_tool('suv_cubes')
from copy import deepcopy
for cube in s.grille_cubes()[3:]:
    assert cube['uv'] == a.uv('body')
for cube in s.window_frame_piece(s.BELT_Y, s.CARGO_FRONT, s.ROOF_Y, s.CARGO_FRONT + 1)[:1]:
    assert cube['uv']['up'] == a.ATLAS.face('body')
for name in s.DOORS:
    side, front, back = s.DOORS[name]
    face = 'east' if side > 0 else 'west'
    region = a.region('body', 'door_front' if front > 0 else 'door_rear')
    scale_u, scale_v = a.PAINTERS['body'].panel_scale(region.name)
    cubes = s.door(name)['cubes']
    strips = [cube for cube in cubes if cube['uv'][face]['uv'][1] >= 4 and region.x <= cube['uv'][face]['uv'][0] < region.x + region.w and cube['origin'][1] < s.BELT_Y]
    assert len(strips) > 1
    for cube in strips:
        _, y, z = cube['origin']
        _, h, d = cube['size']
        uv = cube['uv'][face]
        assert abs(uv['uv'][0] - region.x - (z - back) * scale_u) < 1e-8
        assert abs(uv['uv'][1] - region.y - (s.BELT_Y - y - h) * scale_v) < 1e-8
        assert abs(uv['uv_size'][0] - d * scale_u) < 1e-8
        assert abs(uv['uv_size'][1] - h * scale_v) < 1e-8
p = a.PAINTERS['body']
for name, cubes in [('hood_top', s.hood_cubes()), ('tailgate', s.tailgate_cubes())]:
    face = 'up' if name == 'hood_top' else 'north'
    spec = p.SPECS[name]
    assert cubes[0]['uv'][face]['uv_size'] == [spec.w, spec.h]
for cubes in (s.hood_lower_side_cubes(), s.cargo_lower_side_cubes()):
    region = a.region('body', 'flake')
    back = min(cube['origin'][2] for cube in cubes)
    top = max(cube['origin'][1] + cube['size'][1] for cube in cubes)
    for cube in cubes:
        uv = cube['uv']['east']
        assert abs(uv['uv'][0] - region.x - (cube['origin'][2] - back) * 4) < 1e-8
        assert abs(uv['uv'][1] - region.y - (top - cube['origin'][1] - cube['size'][1]) * 4) < 1e-8
        for start, size, origin, extent in zip(uv['uv'], uv['uv_size'], (region.x, region.y), (104, 104)):
            assert origin <= start and start + size <= origin + extent + 1e-8
# The handle recess is at the rear on both sides, including the exported turn.
p = a.PAINTERS['body']
texture = [[(0, 0, 0, 255)] * 512 for _ in range(256)]
for name in s.DOORS:
    side, front, back = s.DOORS[name]
    region_name = 'door_front' if front > 0 else 'door_rear'
    region = a.region('body', region_name)
    u, v, _, _ = p.recess(region_name)
    texture[region.y + int(v)][region.x + int(u)] = (255, 0, 0, 255)
    source = s.door(name)['cubes'][0]
    for exported in (False, True):
        cube = deepcopy(source)
        face = 'east' if side > 0 else 'west'
        if exported:
            load_tool('suv_export').turn_around([{'cubes': [cube]}])
            face = 'west' if face == 'east' else 'east'
        patches = r.textured_face(texture, cube['uv'][face], dict(r.cube_faces(cube))[face], face, 512, 256)
        points = [quad for quad, color in patches if color == (255, 0, 0, 255)]
        assert len(points) == 1
        z = sum(point[2] for point in points[0]) / 4
        expected = back + (s.HANDLE_REAR_OFFSET + s.HANDLE_FRONT_OFFSET) / 2
        assert abs(z - (-expected if exported else expected)) < 0.3
`,
      ],
      { encoding: "utf8" },
    );
  });
});

describe("SUV panel-line relief map", () => {
  it("shares exactly one relief map across all sixteen paints and excludes the lit pass", () => {
    expect(PAINTS).toHaveLength(16);
    expect(reliefName).toBe(`suv_${reliefKind}`);
    for (const paint of PAINTS) {
      const set = textureSet(nameFor(paint));
      expect(reliefKeys.filter((key) => key in set)).toEqual([reliefKind]);
      expect(set[reliefKind]).toBe(reliefName);
    }
    expect(reliefKeys.filter((key) => key in textureSet("suv_lit"))).toEqual(
      [],
    );
  });

  it("matches the colour size and stays flat outside body regions", () => {
    const map = readRgbaPng(`${directory}/${reliefName}.png`);
    const color = readRgbaPng(`${directory}/suv.png`);
    expect([map.width, map.height]).toEqual([color.width, color.height]);
    const flat =
      reliefKind === "heightmap" ? [128, 128, 128, 255] : [128, 128, 255, 255];
    const invalid: [number, number][] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (
          regions.some(
            (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
          )
        )
          continue;
        const offset = (y * map.width + x) * 4;
        if (
          flat.some((value, c) => map.pixels[offset + c] !== value) &&
          invalid.length < 10
        )
          invalid.push([x, y]);
      }
    }
    expect(invalid).toEqual([]);
  });

  it("recesses every panel perimeter in the heightmap", () => {
    if (reliefKind !== "heightmap") return;
    const map = readRgbaPng(`${directory}/${reliefName}.png`);
    const panels = regions.filter((r) =>
      ["door_front", "door_rear", "hood_top", "tailgate"].includes(r.name),
    );
    expect(panels).toHaveLength(4);
    for (const r of panels) {
      for (let v = 0; v < r.h; v++) {
        for (let u = 0; u < r.w; u++) {
          if (u !== 0 && v !== 0 && u !== r.w - 1 && v !== r.h - 1) continue;
          const i = ((r.y + v) * map.width + r.x + u) * 4;
          const height = map.pixels[i];
          expect(height).toBeLessThan(128);
          expect([...map.pixels.subarray(i, i + 4)]).toEqual([
            height,
            height,
            height,
            255,
          ]);
        }
      }
    }
  });
});
