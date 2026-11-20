import { afterAll, describe, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const gear = [
  {
    id: "alarm_clock",
    minCubes: 151,
    bounds: [
      [2, 2.1],
      [5, 5],
      [0.8, 1],
    ],
    tile: 11,
    alpha: [0, 255],
    extra: `
assert tilt.compound_cubes(model.cubes)
case = model.assemblies["alarm_clock_case"]
legs = model.assemblies["alarm_clock_legs"]
assert all(tilt.bounds(part)[0][1] == 0 for part in (case[20:40], legs[:10], legs[10:]))
assert any(set(tile.pixels[3::4]) == {255} for tile in regions)
`,
  },
  {
    id: "binoculars",
    minCubes: 101,
    bounds: [
      [2.499, 2.501],
      [3, 3],
      [2.3, 2.45],
    ],
    tile: 13,
    alpha: [0, 255],
    extra: `
assert len(assemblies) == 3 and len(tilt.compound_cubes(model.cubes)) > 100
assert len(colors) > 50
assert any(g > r*1.5 and g > b and a == 255 for r, g, b, a in colors)
assert any(b > g*1.2 and r > g and a == 255 for r, g, b, a in colors)
`,
  },
  {
    id: "cactus_pot",
    minCubes: 100,
    bounds: [
      [1.999, 2.001],
      [7, 7],
      [1.999, 2.001],
    ],
    alpha: [255],
    extra: `
assert len(colors) > 8
assert not tilt.compound_cubes(model.cubes)
`,
  },
  {
    id: "instant_camera",
    minCubes: 200,
    bounds: [
      [2.499, 2.501],
      [7, 7],
      [2.2, 2.23],
    ],
    tile: 12,
    alpha: [0, 255],
    extra: `
assert assemblies == {"instant_camera_barrels": {"owner": "camping_gear", "cubes": 80}}
faces = [validate.face_rect(f) for cube in model.cubes for f in cube["uv"].values()]
for tile in regions:
    # A reserved but unused paint region consumes space in the fixed atlas cell.
    for y in range(tile.y, tile.y + tile.height):
        for x in range(tile.x, tile.x + tile.width):
            assert any(u0 <= x < u1 and v0 <= y < v1 for u0, v0, u1, v1 in faces)
    opaque_rgb = {tuple(tile.pixels[i:i+3]) for i in range(0, len(tile.pixels), 4) if tile.pixels[i+3] == 255}
    padded = atlas.pad_cutouts(tile)
    if opaque_rgb:
        assert all(tuple(padded[i:i+3]) in opaque_rgb for i in range(0, len(padded), 4) if padded[i+3] == 0)
for width in (23, 19):
    lens = next(tile for tile in regions if tile.width == tile.height == width)
    assert lens.get(width // 2, width // 2)[3] == 255
`,
  },
  {
    id: "mug_pair",
    minCubes: 1,
    bounds: [
      [1.999, 2.001],
      [1.635, 1.635],
      [0.6, 0.7],
    ],
    alpha: [255],
    extra: `
assert {name: len(cubes) for name, cubes in model.assemblies.items()} == {"mug_pair_shells": 128, "mug_pair_handles": 16}
assert all(len({tuple(t.pixels[i:i+3]) for i in range(0, len(t.pixels), 4)}) > 1 for t in regions)
for cube in model.cubes:
    for face in cube["uv"].values():
        u0, v0, u1, v1 = validate.face_rect(face)
        assert any(t.x <= u0 < u1 <= t.x+t.width and t.y <= v0 < v1 <= t.y+t.height for t in regions)
`,
  },
  {
    id: "potted_plant",
    minCubes: 21,
    bounds: [
      [2.499, 2.501],
      [8, 8],
      [1.8, 1.9],
    ],
    tile: 8,
    alpha: [255],
    extra: `
assert len(colors) >= 20
assert not tilt.compound_cubes(model.cubes)
assert all(face["uv"][1] >= 256 for cube in model.cubes for face in cube["uv"].values())
`,
  },
  {
    id: "saucepan",
    minCubes: 101,
    bounds: [
      [2.999, 3.001],
      [3, 3],
      [1.9, 2],
    ],
    alpha: [255],
    extra: `
assert not tilt.compound_cubes(model.cubes)
assert len(colors) > 12
`,
  },
  {
    id: "toaster",
    minCubes: 6,
    bounds: [
      [3, 3],
      [5, 5],
      [3.3, 3.5],
    ],
    tile: 2,
    alpha: [255],
    extra: `
assert [(t.width, t.height) for t in regions] == [(88, 16), (12, 12), (8, 8), (60, 33), (48, 25), (48, 59), (48, 59)]
assert any(validate.face_rect(f)[0] >= 260 for c in model.cubes for f in c["uv"].values())
`,
  },
];

describe.each(gear)(
  "$id decor model",
  ({ id, minCubes, bounds, tile, alpha, extra }) => {
    it("fits the item and pair budgets with registered rotations and painted faces", async () => {
      await python.run(
        `
import builtins, json, sys
from pathlib import Path
sys.path.insert(0, "tools")
from tool_loader import load_tool
registry = load_tool("gear_registry")
atlas = load_tool("gear_atlas")
tilt = load_tool("cube_tilt")
validate = load_tool("gear_validate")
generator = load_tool("gen_camping_gear")
row = json.loads(sys.stdin.read())
item_id = row["id"]
model = registry.build(item_id)
assemblies = registry.assemblies(item_id)
assert row["minCubes"] <= len(model.cubes) <= validate.MAX_CUBES_PER_ITEM
assert 2 * len(model.cubes) <= validate.MAX_CUBES_PER_PAIR_BLOCK
assert all(all(size > 0 for size in cube["size"]) for cube in model.cubes)
assert set(assemblies) == set(model.assemblies)
for name, entry in assemblies.items():
    assert name.startswith(item_id + "_") and entry["owner"] == "camping_gear"
    assert entry["cubes"] == len(model.assemblies[name])
tilt.assert_axes(model.cubes, model.assemblies, assemblies)
assert not validate.rotation_errors(item_id, model.cubes)
assert not validate.uv_errors(item_id, model.cubes, atlas.GEAR_TILES)
lo, hi = tilt.bounds(model.cubes)
assert lo[1] == 0
for axis, (low, high) in enumerate(row["bounds"]):
    assert low <= hi[axis] <= high, (item_id, axis, lo, hi)
    if axis != 1:
        assert abs(lo[axis] + hi[axis]) < 0.001
regions = [tile for tile in atlas.tiles() if tile.item_id == item_id]
assert regions
if "tile" in row:
    assert atlas.GEAR_TILES[item_id] == row["tile"]
expected_alpha = set(row["alpha"])
colors = {tuple(tile.pixels[i:i+4]) for tile in regions for i in range(0, len(tile.pixels), 4)}
assert {color[3] for color in colors} <= expected_alpha
assert validate.sampled_alphas(model.cubes, atlas.atlas_pixels(), atlas.ATLAS_SIZE) == expected_alpha
rp = Path("packs/yasu_ride_rp")
root = rp / "models/blocks/yasu_ride"
def bones_of(path):
    return json.loads(path.read_text())["minecraft:geometry"][0]["bones"]
shipped = [cube for bone in bones_of(root / (item_id + ".geo.json")) for cube in bone.get("cubes", [])]
assert shipped == generator.rounded(list(model.cubes))
if not hasattr(builtins, "gear_pack_pixels"):
    png = load_tool("render_preview").read_png(rp / "textures/blocks/yasu_ride/camping_gear.png")
    builtins.gear_pack_pixels = bytes(channel for line in png for pixel in line for channel in pixel)
    builtins.gear_pair_bones = {}
assert validate.sampled_alphas(shipped, builtins.gear_pack_pixels, atlas.ATLAS_SIZE) == expected_alpha
for kind, pair in generator.PAIRS.items():
    layout = generator.PAIR_LAYOUTS[pair["layout"]]
    if kind not in builtins.gear_pair_bones:
        block_path = Path(f"packs/yasu_ride_bp/blocks/yasu_ride/{kind}_decor_pair.block.json")
        block = json.loads(block_path.read_text())["minecraft:block"]
        name = block["components"]["minecraft:geometry"]["identifier"].removeprefix("geometry.yasu_ride.")
        builtins.gear_pair_bones[kind] = {bone["name"]: bone["cubes"] for bone in bones_of(root / (name + ".geo.json"))}
    for end, (left, ahead) in enumerate(layout.ends):
        cubes = builtins.gear_pair_bones[kind][f"end{end}_{item_id}"]
        assert cubes == generator.rounded([generator.moved(cube, left, ahead) for cube in model.cubes])
        members = {name: generator.rounded([generator.moved(cube, left, ahead) for cube in part])
                   for name, part in model.assemblies.items()}
        tilt.assert_axes(cubes, members, assemblies)
        lower, upper = tilt.bounds(cubes)
        assert all(-8 <= lower[axis] <= upper[axis] <= 8 for axis in (0, 2))
        assert 0 <= lower[1] <= upper[1] <= pair.get("inside_px", 16)
${extra}
`,
        JSON.stringify({ id, minCubes, bounds, tile, alpha }),
      );
    });
  },
);
