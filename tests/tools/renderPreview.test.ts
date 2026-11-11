import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RESORT_GEAR } from "../support/resortGear";

type Point = [number, number, number];

// The full furniture preview set, including the curved chair back, exceeds 30 s locally.
const CAMPING_PREVIEW_TIMEOUT_MS = 240_000;

// Runs collect_boat from tools/render_preview.py on a geometry and returns the
// center of every opaque face it draws, in the preview's mirrored frame.
const faceCenters = (geometry: unknown): Point[] => {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'tools')",
    "import render_preview",
    "geo = json.loads(sys.stdin.read())",
    "pose = {'lamps': False, 'dusk': False}",
    "polygons, _ = render_preview.collect_boat(geo, [[(255, 255, 255, 255)]], pose)",
    "print(json.dumps([[sum(p[i] for p in quad) / len(quad) for i in range(3)] for quad, _, _ in polygons]))",
  ].join("\n");
  const out = execFileSync("python3", ["-I", "-c", script], {
    input: JSON.stringify(geometry),
    encoding: "utf8",
  });
  return JSON.parse(out);
};

const face = { uv: [0, 0], uv_size: [1, 1] };
const uv = Object.fromEntries(
  ["north", "south", "east", "west", "up", "down"].map((f) => [f, face]),
);
// A 1 px bar along -z whose north face is centered on (0, y, z).
const bar = (y: number, z: number, length: number) => ({
  origin: [-0.5, y - 0.5, z],
  size: [1, 1, length],
  uv,
});

const LEAN = 50;
const PIVOT_Y = 10;
const geometry = {
  description: { texture_width: 1, texture_height: 1 },
  bones: [
    { name: "body", pivot: [0, 0, 0], cubes: [bar(0, -5, 1)] },
    {
      name: "steering",
      parent: "body",
      pivot: [0, PIVOT_Y, 0],
      rotation: [LEAN, 0, 0],
      cubes: [bar(PIVOT_Y, -10, 10)],
    },
    {
      name: "rim",
      parent: "steering",
      pivot: [0, 0, 0],
      cubes: [bar(PIVOT_Y, -21, 1)],
    },
  ],
};

const expectNear = (centers: Point[], [x, y, z]: Point) => {
  const nearest = Math.min(
    ...centers.map(([cx, cy, cz]) => Math.hypot(cx - x, cy - y, cz - z)),
  );
  expect(nearest, `a face centered on ${[x, y, z]}`).toBeLessThan(1e-6);
};

describe("render_preview.py bone rotations", () => {
  const centers = faceCenters(geometry);
  const s = Math.sin((LEAN * Math.PI) / 180);
  const c = Math.cos((LEAN * Math.PI) / 180);

  it("turns a rotated bone's cubes about its pivot the way the game does", () => {
    // In game a positive x rotation lays the steering column's front end down
    // toward the dashboard, as on a bus.
    expectNear(centers, [0, PIVOT_Y - 10 * s, -10 * c]);
  });

  it("carries a parent bone's rotation to its child bones", () => {
    expectNear(centers, [0, PIVOT_Y - 21 * s, -21 * c]);
  });

  it("leaves bones outside the rotated chain where they are", () => {
    expectNear(centers, [0, 0, -5]);
  });
});

describe("camping gear, low chair, and tent previews (ADR 0093, 0122, 0130)", () => {
  it(
    "renders every item of the spec and the low chair and tent into their own 128 px squares and keeps the vehicle frame for the rest",
    () => {
      const script = [
        "import json, sys",
        "from pathlib import Path",
        "sys.path.insert(0, 'tools')",
        "import render_preview",
        "images = render_preview.render_camping_gear(Path('packs/yasu_ride_rp'))",
        "names = list(images)",
        "print(json.dumps({'names': names, 'lengths': sorted({len(render_preview.rasterize_job(v)) for v in images.values()}),",
        "  'sizes': [render_preview.image_size(n) for n in names + ['camper-side.png']]}))",
      ].join("\n");
      const out = JSON.parse(
        execFileSync("python3", ["-I", "-c", script], {
          encoding: "utf8",
          timeout: CAMPING_PREVIEW_TIMEOUT_MS,
        }),
      );
      const ids = (
        JSON.parse(readFileSync("tools/camping_gear.json", "utf8")) as {
          id: string;
        }[]
      ).map((g) => g.id);
      const names = [
        ...ids,
        ...RESORT_GEAR.map((piece) => piece.name),
        "noga_chair",
        "low_chair",
        "tent",
        "roof_tent",
        "camp_table",
        "fire_pit",
        "dutch_oven",
        "gas_lantern",
      ];
      expect(out.names).toEqual(
        names.map((name) => `items/camping-gear/${name}.png`),
      );
      expect(out.lengths).toEqual([128 * 128 * 4]);
      expect(out.sizes).toEqual([...names.map(() => [128, 128]), [800, 600]]);
    },
    CAMPING_PREVIEW_TIMEOUT_MS,
  );
});

const previewPython = (body: string) =>
  JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import json, sys",
          "from pathlib import Path",
          "sys.path.insert(0, 'tools')",
          "import render_preview as r",
          body,
        ].join("\n"),
      ],
      { encoding: "utf8" },
    ),
  );

it("ScreenFit maps quads the same after pickling", () => {
  expect(
    previewPython(`
import pickle
quad = [(-2, 1, -3), (4, 1, -3), (4, 5, 2), (-2, 5, 2)]
camera = r.Camera(quad)
scale, off_x, off_y = 317.5, 123.25, -47.75
fit = r.ScreenFit(camera, scale, off_x, off_y)
assert pickle.loads(pickle.dumps(fit))(quad) == fit(quad)
assert fit(quad) == [(off_x + scale * x, off_y + scale * y, q) for x, y, q in map(camera.project, quad)]
print(json.dumps(True))
`),
  ).toBe(true);
});

describe("render_preview.py resort cutout texels", () => {
  it("discards texels below 128 only when opted in and preserves translucent water", () => {
    const result = previewPython(`
face = {"uv": [0, 0], "uv_size": [1, 1]}
cube = {"origin": [0, 0, 0], "size": [1, 1, 1], "uv": {f: face for f in ("north", "south", "east", "west", "up", "down")}}
geo = {"description": {"texture_width": 1, "texture_height": 1}, "bones": [{"name": "body", "cubes": [cube]}]}
pose = {"lamps": False, "dusk": False}
camera = r.Camera([(0, 0, 0), (1, 1, 1)])
fit = r.ScreenFit(camera, 300, 24, 24)
result = []
for mapping in (False, True):
    samples = []
    for cutout, alpha in ((True, 0), (True, 64), (False, 0), (False, 64), (True, 128), (True, 255)):
        polygons, glass = r.collect_boat(geo, [[(200, 100, 50, alpha)]], pose, texture_mapping=mapping, cutout=cutout)
        pixels = r.rasterize(polygons, [], fit, 16, 16, bloom={}, see_through=glass)
        samples.append({"empty": not any(pixels), "painted": any(pixels[3::4]), "opaque": len(polygons), "glass": len(glass)})
    result.append(samples)
print(json.dumps(result))
`);
    for (const samples of result) {
      expect(
        samples.slice(0, 3).map((s: { empty: boolean }) => s.empty),
      ).toEqual([true, true, true]);
      expect(
        samples.slice(3).map((s: { painted: boolean }) => s.painted),
      ).toEqual([true, true, true]);
      expect(samples[0].glass).toBe(0);
      expect(samples[1].glass).toBe(0);
      expect(samples[4]).toMatchObject({ opaque: 0, glass: 6 });
      expect(samples[5]).toMatchObject({ opaque: 6, glass: 0 });
    }
  });

  it("checks alpha after looking up each textured patch", () => {
    expect(
      previewPython(`
face = {"uv": [0, 0], "uv_size": [2, 1]}
cube = {"origin": [0, 0, 0], "size": [2, 1, 1], "uv": {f: face for f in ("north", "south", "east", "west", "up", "down")}}
geo = {"description": {"texture_width": 2, "texture_height": 1}, "bones": [{"name": "body", "cubes": [cube]}]}
polygons, glass = r.collect_boat(geo, [[(255, 0, 0, 64), (0, 255, 0, 255)]], {"lamps": False, "dusk": False}, texture_mapping=True, cutout=True)
print(json.dumps({"colors": [rgb for _, rgb, _ in polygons], "glass": glass}))
`),
    ).toEqual({
      colors: [0.8, 0.8, 0.6, 0.6, 1, 0.5].map((k) => [0, 255 * k, 0]),
      glass: [],
    });
  });
});

describe("render_preview.py photo views", () => {
  it("defines the twelve reference cameras in photo order", () => {
    const views = previewPython("print(json.dumps(r.PHOTO_VIEWS))");
    const toilet = ["topFront", "side", "leftFront", "lidOpen"];
    expect(Object.keys(views)).toEqual([
      ...toilet,
      "sinkFront",
      "sinkBowl",
      "sinkTap",
      "sinkBowlTop",
      "sinkDrain",
      "sinkLeg",
      "sinkNet",
      "sinkWood",
    ]);
    for (const [name, view] of Object.entries(views) as [
      string,
      { position: number[]; target: number[]; fov: number; piece: string },
    ][]) {
      for (const point of [view.position, view.target]) {
        expect(point).toHaveLength(3);
        expect(point.every(Number.isFinite)).toBe(true);
      }
      expect(view.fov).toBeGreaterThan(0);
      expect(view.piece).toBe(toilet.includes(name) ? "toilet" : "washstand");
      expect(Object.keys(view)).toEqual([
        "piece",
        "position",
        "target",
        "fov",
        ...(name === "lidOpen" ? ["lid"] : []),
      ]);
    }
    expect(views.topFront).toEqual({
      piece: "toilet",
      position: [0, 41.1, -22.5],
      target: [0, 8.6, 0.4],
      fov: 30,
    });
    expect(views.sinkLeg).toEqual({
      piece: "washstand",
      position: [5.7, 2.2, -8.5],
      target: [7.7, 1.3, -4.45],
      fov: 30,
    });
    expect(views.lidOpen.lid).toBe(91);
  });

  it("centers targets, preserves vertical field of view and clips before projection", () => {
    expect(
      previewPython(`
import pickle
for view in r.PHOTO_VIEWS.values():
    camera = r.Camera.looking_at(view["position"], view["target"])
    fit = r.PhotoScreenFit.for_fov(camera, view["fov"])
    x, y, _ = fit([view["target"]])[0]
    assert abs(x - 1200) < 1e-9 and abs(y - 1200) < 1e-9
    assert pickle.loads(pickle.dumps(fit))([view["target"]]) == fit([view["target"]])
camera = r.Camera.looking_at((0, 0, 0), (0, 0, -1))
fit = r.PhotoScreenFit.for_fov(camera, 30)
s, c = r.sin_cos(15)
assert abs(fit([(0, s / c, -1)])[0][1]) < 1e-9
behind = [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
assert fit(behind) == []
crossing = [(-1, -1, -1), (1, -1, -1), (1, 1, 1), (-1, 1, 1)]
clipped = fit.clip(crossing)
assert len(clipped) >= 3
assert all(-r.dot(r.sub(p, camera.eye), camera.back) >= r.PHOTO_NEAR - 1e-12 for p in clipped)
assert len(fit(crossing)) == len(clipped)
assert not any(r.rasterize([(behind, (255, 0, 0), None)], [], fit, 16, 16, bloom={}))
for polygon in ([], [(0, 0, 1)], [(0, 0, 1), (1, 1, 1)]):
    r.fill(polygon, 16, 16, lambda *args: sys.exit("degenerate polygon was painted"))
print(json.dumps(True))
`),
    ).toBe(true);
  });

  it("opens the lid's front above its hinge without mutating the bind pose", () => {
    const result = previewPython(`
import copy
geo = ${JSON.stringify({ ...geometry, bones: [{ name: "lid", pivot: [0, PIVOT_Y, 0], cubes: [bar(PIVOT_Y, -10, 10)] }] })}
before = copy.deepcopy(geo)
posed = r.open_lid(geo, 90)
assert geo == before
polygons, _ = r.collect_boat(posed, [[(255, 255, 255, 255)]], {"lamps": False, "dusk": False})
print(json.dumps([[sum(p[i] for p in quad) / len(quad) for i in range(3)] for quad, _, _ in polygons]))
`);
    expectNear(result, [0, PIVOT_Y + 10, 0]);
  });

  it("uses the view's lid default and lets an explicit angle override it", () => {
    expect(
      previewPython(`
from unittest.mock import patch
geo = ${JSON.stringify({ ...geometry, bones: [{ name: "lid", pivot: [0, PIVOT_Y, 0], cubes: [bar(PIVOT_Y, -10, 10)] }] })}
r.RESORT_GEAR = [{"name": "toilet", "geometry": "test", "textured": True, "cutout": True}]
with patch.object(Path, "read_text", return_value=json.dumps({"minecraft:geometry": [geo], "animations": {"animation.yasu_ride.toilet.rest": {"bones": {"swirl": {"scale": [0,0,0]}, "rim_jets": {"scale": [0,0,0]}}}}})), patch.object(r, "read_png", return_value=[[(255, 255, 255, 255)]]):
    opened = r.render_photo_view(Path("unused"), "lidOpen")
    closed = r.render_photo_view(Path("unused"), "lidOpen", lid=0)
    assert max(p[1] for q, _, _ in opened.polygons for p in q) > 19
    assert max(p[1] for q, _, _ in closed.polygons for p in q) == 10.5
    assert opened.width == opened.height == 800
    assert opened.layers == [] and opened.background is None and opened.bloom == {}
    geo["bones"][0]["name"] = "body"
with patch.object(Path, "read_text", return_value=json.dumps({"minecraft:geometry": [geo], "animations": {"animation.yasu_ride.toilet.rest": {"bones": {"swirl": {"scale": [0,0,0]}, "rim_jets": {"scale": [0,0,0]}}}}})):
    try:
        r.render_photo_view(Path("unused"), "lidOpen")
    except ValueError as e:
        assert "bone named 'lid'" in str(e)
    else:
        raise AssertionError("missing lid was accepted")
print(json.dumps(True))
`),
    ).toBe(true);
  });

  it("rejects a missing photo-view piece independently of the shipped catalog", () => {
    expect(
      previewPython(`
for view, piece in (("topFront", "toilet"), ("sinkTap", "washstand")):
    r.RESORT_GEAR = []
    try:
        r.render_photo_view(Path("unused"), view)
    except ValueError as e:
        assert piece in str(e) and "tools/resort_gear.json" in str(e)
    else:
        raise AssertionError("missing piece accepted")
print(json.dumps(True))
`),
    ).toBe(true);
  });

  it.each([
    [
      ["--view", "unknown", "--out", "/tmp/views"],
      /valid names: topFront.*sinkWood/,
    ],
    [
      ["--view", "topFront", "--lid", "92", "--out", "/tmp/views"],
      /--lid must be between 0 and 91/,
    ],
    [["--lid", "0", "output"], /--lid requires a named --view/],
    [
      ["--view", "topFront", "--check", "--out", "/tmp/views"],
      /cannot be combined with --check/,
    ],
    [
      ["output", "--view", "topFront", "--out", "/tmp/views"],
      /no positional output_dir/,
    ],
    [["--view", "topFront"], /requires --out/],
    [["output", "--out", "/tmp/views"], /does not allow --out/],
    [
      ["--view", "-1", "0.65", "-1", "--out", "/tmp/views"],
      /requires --beach-chair-form/,
    ],
  ])("rejects invalid photo CLI arguments %j", (args, message) => {
    expect(() =>
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          "import sys; sys.path.insert(0, 'tools'); import render_preview as r; r.RESORT_GEAR = []; sys.argv = ['tools/render_preview.py', 'packs/yasu_ride_rp', *sys.argv[1:]]; r.main()",
          ...args,
        ],
        { encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow(message);
  });
});

// An opaque face as [rgb, bloom group or null].
type LitFace = [number[], string | null];

describe("render_preview.py lit bones", () => {
  it("lights each bone named in lit in its own color only while the lamps are on", () => {
    const result: {
      on: LitFace[];
      off: LitFace[];
      default: LitFace[];
      lamp: number[];
    } = previewPython(`
face = {"uv": [0, 0], "uv_size": [1, 1]}
cube = {"origin": [0, 0, 0], "size": [1, 1, 1], "uv": {f: face for f in ("north", "south", "east", "west", "up", "down")}}
geo = {"description": {"texture_width": 1, "texture_height": 1}, "bones": [{"name": name, "cubes": [cube]} for name in ("body", "headlights", "beacon")]}
texture = [[(255, 255, 255, 255)]]
lit = {"headlights": (1, 2, 3), "beacon": (4, 5, 6)}
def faces(lamps, default=False):
    args = () if default else (lit,)
    polygons, _ = r.collect_boat(geo, texture, {"lamps": lamps, "dusk": False}, *args)
    return [[rgb, group] for _, rgb, group in polygons]
print(json.dumps({"on": faces(True), "off": faces(False), "default": faces(True, True), "lamp": r.LAMP_LIT}))
`);
    const lampFaces = (faces: LitFace[], rgb: number[]) =>
      faces.filter(
        ([color, group]) =>
          group === "lamp" && JSON.stringify(color) === JSON.stringify(rgb),
      );
    const groups = (faces: LitFace[]) => faces.map(([, group]) => group);
    expect(lampFaces(result.on, [1, 2, 3])).toHaveLength(6);
    expect(lampFaces(result.on, [4, 5, 6])).toHaveLength(6);
    expect(groups(result.on).filter((group) => group === null)).toHaveLength(6);
    expect(groups(result.off)).toEqual(Array(18).fill(null));
    expect(lampFaces(result.default, result.lamp)).toHaveLength(6);
    expect(groups(result.default)).toEqual([
      ...Array(6).fill(null),
      ...Array(6).fill("lamp"),
      ...Array(6).fill(null),
    ]);
  });
});

describe("render_preview.py SUV lit and cutout bones", () => {
  const result: {
    on: LitFace[][];
    off: LitFace[];
    opaqueBase: LitFace[];
    litColor: number[];
  } = previewPython(`
face = {"uv": [0, 0], "uv_size": [2, 1]}
uv = {f: face for f in ("north", "south", "east", "west", "up", "down")}
geo = {"description": {"texture_width": 2, "texture_height": 1}, "bones": [
    {"name": name, "cubes": [{"origin": [i * 2, 0, 0], "size": [1, 1, 1], "uv": uv}]}
    for i, name in enumerate(("lens", "cutout", "body"))]}
texture = [[(200, 100, 50, 0), (10, 20, 30, 255)]]
lit = [[(250, 10, 10, 0), (10, 20, 30, 255)]]
pose = {"lamps": True, "dusk": False, "hover": False, "submarine": False}
def faces(bone, base=texture, lamps=True):
    polygons = r.collect({**geo, "bones": [bone]}, base, {}, {}, {**pose, "lamps": lamps}, lit,
                         lit_bones={"lens": "texel"}, cutout_bones=frozenset({"cutout"}))
    return [[rgb, group] for _, rgb, group in polygons]
print(json.dumps({"on": [faces(bone) for bone in geo["bones"]],
                  "off": faces(geo["bones"][0], lamps=False),
                  "opaqueBase": faces(geo["bones"][0], [[(200, 100, 50, 255), (10, 20, 30, 255)]]),
                  "litColor": [c + (255 - c) * r.LIT_GAIN for c in (250, 10, 10)]}))
`);
  // Mirroring reverses winding, so the down/up normals receive up/down shading.
  const shades = [0.8, 0.8, 0.6, 0.6, 1, 0.5];
  const shaded = (color: number[]): LitFace[] =>
    shades.map((shade) => [color.map((c) => c * shade), null]);

  it("lights only the lit texture's alpha-0 texels in their own brightened color", () => {
    const expected = shaded([10, 20, 30]).flatMap((face) => [
      [result.litColor, "lamp"],
      face,
    ]);
    expect(result.on[0]).toEqual(expected);
    expect(result.opaqueBase).toEqual(expected);
  });

  it("skips transparent texels only on cutout bones", () => {
    expect(result.on[1]).toEqual(shaded([10, 20, 30]));
    expect(result.on[2]).toEqual(
      shades.flatMap((shade) => [
        [[200, 100, 50].map((c) => c * shade), null],
        [[10, 20, 30].map((c) => c * shade), null],
      ]),
    );
  });

  it("shades every texel normally when the lamps are off", () => {
    expect(result.off).toEqual(result.on[2]);
  });
});

describe("bulldozer previews (ADR 0136)", () => {
  it("draws only the first grouser phase and no propeller", () => {
    const result = previewPython(`
geo = json.loads(Path("packs/yasu_ride_rp/models/entity/yasu_ride/bulldozer.geo.json").read_text())["minecraft:geometry"][0]
print(json.dumps({"all": [b["name"] for b in geo["bones"]], "kept": [b["name"] for b in r.bulldozer_bones(geo["bones"])]}))
`);
    const hidden = [
      "track_r_1",
      "track_r_2",
      "track_l_1",
      "track_l_2",
      "propeller",
      "blade_wide",
    ];
    expect(result.kept).toEqual(
      result.all.filter((name: string) => !hidden.includes(name)),
    );
    expect(result.kept).toContain("blade");
    expect(result.kept).toContain("track_r_0");
    expect(result.kept).toContain("track_l_0");
  });
  it("draws alpha-0 lens swatches opaque and keeps the glass see-through", () => {
    expect(
      previewPython(
        "print(json.dumps(r.opaque_lenses([[(1,2,3,0),(4,5,6,96),(7,8,9,255)]])))",
      ),
    ).toEqual([
      [
        [1, 2, 3, 255],
        [4, 5, 6, 96],
        [7, 8, 9, 255],
      ],
    ]);
  });
  it("renders four previews from the camper's angles in the vehicle frame", () => {
    const result = previewPython(
      "print(json.dumps({'names': list(r.BULLDOZER_POSES), 'views': [p['view'] for p in r.BULLDOZER_POSES.values()], 'camper': [p['view'] for p in r.CAMPER_POSES.values()], 'size': r.image_size('bulldozer-side.png')}))",
    );
    expect(result.names).toEqual([
      "bulldozer-front-left.png",
      "bulldozer-headlights.png",
      "bulldozer-side.png",
      "bulldozer-rear.png",
    ]);
    expect(result.views).toEqual(result.camper);
    expect(result.size).toEqual([800, 600]);
  });
});

describe("render_preview.py textured faces", () => {
  it("merges adjacent equal texels into rectangles without changing their UV coverage", () => {
    const result = previewPython(`
quad = dict(r.cube_faces({"origin": [0, 0, 0], "size": [4, 1, 4]}))["east"]
texture = [[(v, v, v, 255)] * 4 for v in (10, 10, 20, 20)]
patches = list(r.textured_face(texture, {"uv": [0, 0], "uv_size": [4, 4]}, quad, "east", 4, 4, merge=True))
print(json.dumps([[min(p[1] for p in q), max(p[1] for p in q), min(p[2] for p in q), max(p[2] for p in q), color[0]] for q, color in patches]))
`);
    expect(result).toEqual([
      [0.5, 1, 0, 4, 10],
      [0, 0.5, 0, 4, 20],
    ]);
  });

  it("maps fractional UV rows to matching strips and preserves uniform faces", () => {
    const result = previewPython(`
cube = {"origin": [0, 0, 0], "size": [1, 1, 1]}
quad = dict(r.cube_faces(cube))["east"]
face = {"uv": [0, 0.5], "uv_size": [1, 2]}
texture = [[(v, v, v, 255)] for v in (10, 20, 30)]
patches = list(r.textured_face(texture, face, quad, "east", 1, 3))
uniform = list(r.textured_face([[(10,10,10,255)]] * 3, face, quad, "east", 1, 3))
print(json.dumps({"strips": [[min(p[1] for p in q), max(p[1] for p in q), color[0]] for q, color in patches], "uniform": uniform == [(quad, (10,10,10,255))]}))
`);
    expect(result.strips).toEqual([
      [0.75, 1, 10],
      [0.25, 0.75, 20],
      [0, 0.25, 30],
    ]);
    expect(result.uniform).toBe(true);
  });
});

it("maps up and down UVs along x with the same z direction", () => {
  const result = previewPython(`
cube = {"origin": [0, 0, 0], "size": [30, 1, 12]}
texture = [[(10,0,0,255), (20,0,0,255)], [(30,0,0,255), (40,0,0,255)]]
result = {}
for name in ('up', 'down'):
    patches = r.textured_face(texture, {"uv": [0,0], "uv_size": [2,2]}, dict(r.cube_faces(cube))[name], name, 2, 2)
    result[name] = [[sum(p[0] for p in quad)/4, sum(p[2] for p in quad)/4, color[0]] for quad, color in patches]
print(json.dumps(result))
`);
  const expected = [
    [7.5, 9, 10],
    [7.5, 3, 30],
    [22.5, 9, 20],
    [22.5, 3, 40],
  ];
  expect(result.up).toEqual(expected);
  expect(result.down).toEqual(expected);
});

it("applies the Beach Chair table animation relative to its bind pose without mutating it", () => {
  expect(
    previewPython(`
g = json.loads(Path('packs/yasu_ride_rp/models/entity/yasu_ride/beach_chair.geo.json').read_text())['minecraft:geometry'][0]
a = json.loads(Path('packs/yasu_ride_rp/animations/yasu_ride/beach_chair.anim.json').read_text())['animations']['animation.yasu_ride.beach_chair.table']
p = r.static_pose(g, a)
print(json.dumps([[b.get('rotation', [0,0,0]) for b in p['bones'] if b['name']=='backrest'][0], [b['rotation'] for b in g['bones'] if b['name']=='backrest'][0]]))
`),
  ).toEqual([
    [0, 0, 0],
    [37, 0, 0],
  ]);
});

describe("camping gear tiles and review views", () => {
  it("cuts non-glass tile patches and retains translucent glass patches", () => {
    expect(
      previewPython(`
face = {"uv": [16, 0], "uv_size": [2, 1]}
cube = {"origin": [0, 0, 0], "size": [2, 1, 1], "uv": {f: face for f in ("north", "south", "east", "west", "up", "down")}}
geo = {"description": {"texture_width": 32, "texture_height": 32}, "bones": [{"name": "body", "cubes": [cube]}]}
texture = [[(0, 0, 255, 255)] * 32 for _ in range(32)]
texture[0][16:18] = [(255, 0, 0, 0), (0, 255, 0, 255)]
assert r.gear_tiled(geo, texture)
opaque, glass = r.collect_gear(geo, texture, {"glass": False})
assert len(opaque) == 6 and not glass
assert [rgb for _, rgb, _ in opaque] == [(0, 255 * k, 0) for k in (0.8, 0.8, 0.6, 0.6, 1, 0.5)]
texture[0][16] = (255, 0, 0, 110)
opaque, glass = r.collect_gear(geo, texture, {"glass": True})
assert len(opaque) == len(glass) == 6
assert all(alpha == 110 / 255 for _, _, alpha in glass)
assert all(rgb[0] > 0 and rgb[1:] == (0, 0) for _, rgb, _ in glass)
print(json.dumps(True))
`),
    ).toBe(true);
  });

  it("detects painted gear and defines the six review angles in order", () => {
    expect(
      previewPython(`
rp = Path('packs/yasu_ride_rp')
texture = r.read_png(rp / r.GEAR_TEXTURE)
for item in json.loads(r.GEAR_SPEC.read_text()):
    geo = json.loads((rp / r.GEAR_GEOMETRY.format(item['id'])).read_text())['minecraft:geometry'][0]
    assert r.gear_tiled(geo, texture) == (item['id'] == 'saucepan'), item['id']
assert r.GEAR_VIEWS['left'] == (1, 0.15, 0)
assert r.GEAR_VIEWS['right'] == (-1, 0.15, 0)
assert r.GEAR_VIEWS['threeQuarter'] == r.VIEW_DIRECTION
print(json.dumps(list(r.GEAR_VIEWS)))
`),
    ).toEqual(["front", "back", "left", "right", "top", "threeQuarter"]);
  });

  it.each([
    ["--gear", "unknown", "--out", "/tmp/unused-gear-1595"],
    [
      "--gear",
      "sugar_pot",
      "--view",
      "unknown",
      "--out",
      "/tmp/unused-gear-1595",
    ],
    ["--gear", "sugar_pot"],
    ...["--check", "--icons", "--beach-chair-form", "--lid"].map((option) => [
      "--gear",
      "sugar_pot",
      "--out",
      "/tmp/unused-gear-1595",
      option,
      ...(option === "--icons"
        ? ["packs/yasu_ride_rp"]
        : option === "--beach-chair-form"
          ? ["chair"]
          : option === "--lid"
            ? ["45"]
            : []),
    ]),
  ])("rejects invalid gear review arguments %j", (...args) => {
    expect(() =>
      execFileSync(
        "python3",
        ["-I", "tools/render_preview.py", "packs/yasu_ride_rp", ...args],
        { stdio: "pipe" },
      ),
    ).toThrow();
  });
});
