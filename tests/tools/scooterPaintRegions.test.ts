import fc from "fast-check";
import { afterAll, beforeAll, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker({ hashSeed: 0 });
afterAll(() => python.close());

const setup = `import builtins, math, sys
from pathlib import Path
sys.path.insert(0, "tools")
from tool_loader import load_tool
atlas = load_tool("region_atlas")

def rows(image, face):
    uv = atlas.UvRect.of(face)
    rect = uv.texels()
    ys = range(rect.y0, rect.y1)
    for y in reversed(ys) if uv.h < 0 else ys:
        start = (y * image.width + rect.x0) * 4
        row = image.pixels[start:start + (rect.x1 - rect.x0) * 4]
        yield b"".join(row[i:i + 4] for i in range(len(row) - 4, -1, -4)) if uv.w < 0 else row
`;

beforeAll(async () => {
  await python.run(`${setup}
builtins.scooter_build = built = load_tool("gen_scooter").build()
face_crop = load_tool("face_crop")
preview = load_tool("render_preview")
rp = Path("packs/yasu_ride_rp")
source = built.source_geometry["minecraft:geometry"][0]
culled = built.cull.geometry
full = built.full_geometry["minecraft:geometry"][0]
paint_regions = {r.name for r in built.paint_source.layout.regions}
pass_bones = []
source_images = []
shipped_images = []
shipped_count = 0
for texture, source_pass, render_pass in (
    ("scooter_fixed", built.fixed, built.fixed),
    ("scooter_paint", built.paint_source, built.paint),
):
    bones = render_pass.geometry["minecraft:geometry"][0]["bones"]
    pass_bones.append(bones)
    shipped_count += sum(len(cube["uv"]) for bone in bones for cube in bone["cubes"])
    source_images.append(atlas.AtlasImage(*source_pass.layout.size, source_pass.pixels))
    shipped_image = atlas.AtlasImage(*preview.read_png_bytes(rp / f"textures/entity/yasu_ride/{texture}.png"))
    assert (shipped_image.width, shipped_image.height) == render_pass.layout.size
    shipped_images.append(shipped_image)

def shape(cube):
    return {key: value for key, value in cube.items() if key != "uv"}

source_count = clear_count = buried_count = 0
visibility = {}
region_for_rect = {}
paint_faces = []
clear_paint_faces = {}
for original_bone, culled_bone, full_bone, fixed_bone, paint_bone in zip(
        source["bones"], culled["bones"], full["bones"], *pass_bones, strict=True):
    for bone in (full_bone, fixed_bone, paint_bone):
        assert {k: v for k, v in bone.items() if k != "cubes"} == {
            k: v for k, v in original_bone.items() if k != "cubes"
        }
    cursors = (iter(fixed_bone["cubes"]), iter(paint_bone["cubes"]))
    full_cubes = iter(full_bone["cubes"])
    bone_name = original_bone["name"]
    lit = bone_name in ("headlights", "tail_lights") or bone_name.startswith("glow_")
    for index, original in enumerate(original_bone["cubes"]):
        kept_index = built.cull.index_map[(bone_name, index)]
        kept_faces = {} if kept_index is None else culled_bone["cubes"][kept_index]["uv"]
        expected = ({}, {})
        for name, face in original["uv"].items():
            source_count += 1
            owner = int(face.region in paint_regions)
            if not lit:
                key = (owner, atlas.UvRect.of(face).texels())
                if key not in visibility:
                    visibility[key] = face_crop.is_visible(face, source_images[owner])
                if not visibility[key]:
                    clear_count += 1
                    continue
            if name not in kept_faces:
                buried_count += 1
                continue
            expected[owner][name] = face
        shipped_faces = {}
        for owner, faces in enumerate(expected):
            if not faces:
                continue
            shipped = next(cursors[owner])
            assert shape(shipped) == shape(original)
            assert list(shipped["uv"]) == list(faces)
            shipped_faces.update(shipped["uv"])
            for name, shipped_face in shipped["uv"].items():
                source_face = faces[name]
                source_rect = atlas.UvRect.of(source_face).texels()
                shipped_rect = atlas.UvRect.of(shipped_face).texels()
                if owner:
                    placement = built.paint.layout.placement(shipped_face.region)
                    flip_x, flip_y = placement.flip_x, placement.flip_y
                    assert region_for_rect.setdefault(source_rect, shipped_face.region) == shipped_face.region
                    assert (shipped_rect.x0, shipped_rect.y0) == (placement.x, placement.y)
                    paint_faces.append((source_face, shipped_face))
                    for axis, lo, hi, offset, flip in (
                        (0, source_rect.x0, source_rect.x1, placement.x, flip_x),
                        (1, source_rect.y0, source_rect.y1, placement.y, flip_y),
                    ):
                        origin = source_face["uv"][axis]
                        assert abs(shipped_face["uv"][axis] - offset - (hi - origin if flip else origin - lo)) < 1e-6
                    du, dv = source_face["uv_size"]
                    assert shipped_face["uv_size"] == [-du if flip_x else du, -dv if flip_y else dv]
                else:
                    assert shipped_face == source_face
                assert all(before == after for before, after in zip(
                    rows(source_images[owner], source_face),
                    rows(shipped_images[owner], shipped_face), strict=True))
        if shipped_faces:
            rejoined = next(full_cubes)
            assert shape(rejoined) == shape(original)
            assert rejoined["uv"] == shipped_faces
            assert list(rejoined["uv"]) == [name for name in original["uv"] if name in shipped_faces]
    assert all(next(cursor, None) is None for cursor in cursors)
    assert next(full_cubes, None) is None
assert clear_count > 0
assert buried_count == sum(count.removed_faces for count in built.removals)
assert source_count == clear_count + buried_count + shipped_count
assert set(region_for_rect.values()) == {r.name for r in built.paint.layout.regions}
slots = set()
for region in built.paint.layout.regions:
    placement = built.paint.layout.placement(region.name)
    slots.add((placement.x, placement.y, region.width, region.height))
assert len(slots) <= len(region_for_rect) == len(built.paint.layout.regions)
assert math.prod(built.paint.layout.size) < math.prod(built.paint_source.layout.size)
builtins.paint_faces = paint_faces
builtins.clear_paint_faces = list(clear_paint_faces.values())
`);
}, 41_000);

const verifySamples = (color: string, faces: string) =>
  python.run(`${setup}
from builtins import scooter_build as built, paint_faces, clear_paint_faces
textures = load_tool("scooter_textures")
color = ${color}

def recolored_image(part):
    pixels = textures.recolor(part.layout, part.pixels, color)
    return atlas.AtlasImage(*part.layout.size, pixels)

before = recolored_image(built.paint_source)
after = recolored_image(built.paint)
face_crop = load_tool("face_crop")
assert all(not face_crop.is_visible(face, before) for face in clear_paint_faces)
for source, shipped in ${faces}:
    assert face_crop.is_visible(source, before), source
    assert list(rows(before, source)) == list(rows(after, shipped)), (source, shipped)
`);

it.each(["khaki", "red", "black"])(
  "preserves every retained %s paint face in sampling order",
  async (paint) => {
    await verifySamples(`textures.PAINTS["${paint}"]`, "paint_faces");
  },
);

it("preserves sampled faces across paint channel values", async () => {
  const channel = fc.integer({ min: 0, max: 255 });
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(channel, channel, channel),
      fc.array(fc.nat(), { minLength: 32, maxLength: 32 }),
      async (rgb, indices) => {
        await verifySamples(
          JSON.stringify(rgb),
          `(paint_faces[i % len(paint_faces)] for i in ${JSON.stringify(indices)})`,
        );
      },
    ),
    { numRuns: 8 },
  );
});
