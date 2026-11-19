"""Generate the scooter foundation; area builders replace placeholders independently."""

import sys
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
cube_tilt = load_tool("cube_tilt")
texture_io = load_tool("texture_io")
scooter_textures = load_tool("scooter_textures")
scooter_engine = load_tool("scooter_engine")
region_atlas = load_tool("region_atlas")
geometry_passes = load_tool("geometry_passes")

AREA_ORDER = (
    "running",
    "stand",
    "struts",
    "body",
    "floor",
    "rear",
    "engine",
    "head",
    "shield",
    "glow",
)

ASSEMBLIES = {
    "running_wheel_front": {"owner": "scooter", "cubes": 777},
    "running_wheel_rear": {"owner": "scooter", "cubes": 777},
    "running_spring": {"owner": "scooter", "cubes": 112},
    "running_stand": {"owner": "scooter", "cubes": 2},
    "running_pedal": {"owner": "scooter", "cubes": 3},
    "shield_face": {"owner": "scooter", "cubes": 105},
    "shield_trim": {"owner": "scooter", "cubes": 66},
    "shield_ridge": {"owner": "scooter", "cubes": 110},
    "shield_fender": {"owner": "scooter", "cubes": 295},
    "body_cowl": {"owner": "scooter", "cubes": 594},
    "body_tail": {"owner": "scooter", "cubes": 216},
    "body_frame": {"owner": "scooter", "cubes": 148},
    "body_floor": {"owner": "scooter", "cubes": 164},
    "rear_seat": {"owner": "scooter", "cubes": 162},
    "rear_lamp": {"owner": "scooter", "cubes": 130},
    "rear_dome": {"owner": "scooter", "cubes": 48},
    "rear_cage": {"owner": "scooter", "cubes": 10},
    "rear_flange": {"owner": "scooter", "cubes": 4},
    "rear_plate": {"owner": "scooter", "cubes": 4},
    "engine_casting": {"owner": "scooter", "cubes": 42},
    "engine_fan": {"owner": "scooter", "cubes": 32},
    "engine_kick": {"owner": "scooter", "cubes": 18},
    "engine_muffler": {"owner": "scooter", "cubes": 114},
    "engine_header": {"owner": "scooter", "cubes": 66},
    "head_collar": {"owner": "scooter", "cubes": 36},
    "head_headset": {"owner": "scooter", "cubes": 120},
    "head_bib": {"owner": "scooter", "cubes": 120},
    "head_meter": {"owner": "scooter", "cubes": 24},
    "head_lamp": {"owner": "scooter", "cubes": 72},
    "head_controls": {"owner": "scooter", "cubes": 64},
    "head_levers": {"owner": "scooter", "cubes": 6},
    "head_mirrors": {"owner": "scooter", "cubes": 52},
}

BONES = (
    ("root", None, (0, 0, 0)),
    ("body", "root", (0, 0, 0)),
    ("steer", "root", dims.STEER_PIVOT),
    (dims.FOLD_BONES["front"], "steer", (0, dims.AXLE_Y, dims.FRONT_AXLE_Z)),
    ("wheel_front", dims.FOLD_BONES["front"], (0, dims.AXLE_Y, dims.FRONT_AXLE_Z)),
    ("glow_front", dims.FOLD_BONES["front"], (0, dims.AXLE_Y, dims.FRONT_AXLE_Z)),
    (dims.STRUT_BONES["front"], "steer", (0, dims.AXLE_Y, dims.FRONT_AXLE_Z)),
    ("headlights", "steer", (0, 0, 0)),
    (dims.FOLD_BONES["rear"], "body", (0, dims.AXLE_Y, dims.REAR_AXLE_Z)),
    ("wheel_rear", dims.FOLD_BONES["rear"], (0, dims.AXLE_Y, dims.REAR_AXLE_Z)),
    ("glow_rear", dims.FOLD_BONES["rear"], (0, dims.AXLE_Y, dims.REAR_AXLE_Z)),
    (dims.STRUT_BONES["rear"], "body", (0, dims.AXLE_Y, dims.REAR_AXLE_Z)),
    (dims.REAR_STEM_BONE, "body", (0, dims.REAR_STEM_TOP, dims.REAR_AXLE_Z)),
    ("stand", "body", dims.STAND_PIVOT),
    ("tail_lights", "body", (0, 0, 0)),
    ("seat_0", "body", (0, dims.SEAT_Y, dims.DRIVER_SEAT_Z)),
    ("seat_1", "body", (0, dims.SEAT_Y, dims.PASSENGER_SEAT_Z)),
)


def _placeholders():
    body = kit.box((-dims.PLACEHOLDER_BODY_HALF_WIDTH, dims.PLACEHOLDER_BODY_BOTTOM_Y, dims.PLACEHOLDER_BODY_FRONT_Z),
                   (dims.PLACEHOLDER_BODY_HALF_WIDTH, dims.PLACEHOLDER_BODY_TOP_Y, dims.PLACEHOLDER_BODY_REAR_Z),
                   atlas.faces("paint"))
    result = kit.AreaCubes().add("body", body)
    result.add("steer", kit.tube([(0, dims.AXLE_Y, dims.FRONT_AXLE_Z), dims.STEER_PIVOT],
                                dims.PLACEHOLDER_COLUMN_SIZE, atlas.faces("chrome")))
    for name, z in (("wheel_front", dims.FRONT_AXLE_Z), ("wheel_rear", dims.REAR_AXLE_Z)):
        result.add(name, kit.box((-dims.TYRE_HALF_WIDTH, dims.AXLE_Y-dims.TYRE_RADIUS, z-dims.TYRE_RADIUS),
                                 (dims.TYRE_HALF_WIDTH, dims.AXLE_Y+dims.TYRE_RADIUS, z+dims.TYRE_RADIUS),
                                 atlas.faces("rubber")))
    result.add("stand", kit.box(dims.PLACEHOLDER_STAND_LO, dims.PLACEHOLDER_STAND_HI, atlas.faces("chrome")))
    result.add("headlights", kit.box(dims.PLACEHOLDER_HEADLIGHT_LO, dims.PLACEHOLDER_HEADLIGHT_HI, atlas.faces("lens_head")))
    result.add("tail_lights", kit.box(dims.PLACEHOLDER_TAIL_LIGHT_LO, dims.PLACEHOLDER_TAIL_LIGHT_HI, atlas.faces("lens_tail")))
    return result


def rounded(value):
    if isinstance(value, float):
        return round(value, 3) + 0.0
    if isinstance(value, (list, tuple)):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        values = {k: rounded(v) for k, v in value.items()}
        if isinstance(value, atlas.region_atlas.RegionFace):
            return atlas.region_atlas.RegionFace(values, value.region, value.flip_x, value.flip_y)
        return values
    return value


def relocate_face(local, region, layout, face):
    local.to_atlas(layout.placement(region.name), region.width, region.height).apply(face)
    layout.bind_face(region.name, face)


class AtlasPass(NamedTuple):
    geometry: dict
    layout: region_atlas.Layout
    pixels: bytes


class BuildResult(NamedTuple):
    full_geometry: dict
    fixed: AtlasPass
    paint: AtlasPass
    lit: AtlasPass


def pack_regions(regions, *, shared=True):
    registry = region_atlas.RegionRegistry()
    for region in regions:
        registry.register(region)
    return region_atlas.pack(
        registry, gutter_px=atlas.GUTTER_TEXELS, max_side=atlas.MAX_SIDE_TEXELS,
        share_key=(lambda r: (r.material, atlas.is_lit_region(r.name))) if shared else None)


def finish_pass(geometry, layout):
    geometry["description"].update(texture_width=layout.size[0], texture_height=layout.size[1])
    pixels = atlas.render_atlas(layout)
    errors = atlas.audit(layout, pixels)
    if errors:
        raise ValueError(f"{geometry['description']['identifier']} atlas audit failed: " + "; ".join(errors))
    return AtlasPass(rounded({"format_version": "1.12.0", "minecraft:geometry": [geometry]}), layout, pixels)


def build():
    parents = {name: parent for name, parent, _ in BONES}
    for strut in dims.STRUT_BONES.values():
        ancestor = parents[strut]
        while ancestor is not None:
            if ancestor.endswith("_fold"):
                raise ValueError(f"Strut bone {strut} must not descend from fold bone {ancestor}")
            ancestor = parents[ancestor]
    if set(AREA_ORDER) != set(dims.AREA_CUBE_ALLOCATION):
        raise ValueError("Scooter area order and allocation keys differ")
    merged = kit.AreaCubes()
    for name in AREA_ORDER:
        area = load_tool(f"scooter_{name}").build()
        if sum(map(len, area.values())) > dims.AREA_CUBE_ALLOCATION[name]:
            raise ValueError(f"Scooter area {name} exceeds its cube allocation")
        if name == "floor":
            # Body inner plates followed the floor solids before the areas were split.
            trailing = load_tool("scooter_body").trailing_cube_count()
            plates = merged["body"][-trailing:]
            del merged["body"][-trailing:]
            merged.merge(area)
            merged["body"].extend(plates)
        else:
            merged.merge(area)
    allowed = {name for name, _, _ in BONES}
    for name, cubes in merged.items():
        if name not in allowed:
            raise ValueError(f"Unknown scooter bone: {name}")
        if name in dims.FOLD_BONES.values() and cubes:
            raise ValueError(f"Fold bone must not carry cubes: {name}")
    for name, cubes in _placeholders().items():
        if not merged.get(name):
            merged.add(name, cubes)
    all_cubes = [cube for cubes in merged.values() for cube in cubes]
    if len(all_cubes) > dims.CUBE_BUDGET_CEILING:
        raise ValueError("Scooter cube count exceeds the owner-approved ceiling")
    regions = dict(atlas.REGISTRY._regions)
    is_paint = lambda face: regions[face.region].material == atlas.Material.PAINT
    fixed_layout = pack_regions(r for r in regions.values() if r.material != atlas.Material.PAINT)
    paint_layout = pack_regions(r for r in regions.values() if r.material == atlas.Material.PAINT)
    local_uvs = {id(face): region_atlas.UvRect.of(face)
                 for cube in all_cubes for face in cube["uv"].values()}
    for cube in all_cubes:
        for face in cube["uv"].values():
            layout = paint_layout if is_paint(face) else fixed_layout
            relocate_face(local_uvs[id(face)], regions[face.region], layout, face)
    bones = [{"name": name, **({"parent": parent} if parent else {}), "pivot": list(pivot),
              "cubes": merged.get(name, [])} for name, parent, pivot in BONES]
    for bone in bones:
        if bone["name"] == scooter_engine.BONE:
            bone["locators"] = {"exhaust": list(scooter_engine.OUTLET_END)}
        if bone["name"].startswith("glow_"):
            side = bone["name"].removeprefix("glow_")
            outer = min(cube["origin"][0] for cube in bone["cubes"])
            bone["locators"] = {"hover_" + side: [outer, *bone["pivot"][1:]]}
    description = {"identifier": "geometry.yasu_ride.scooter",
                   "texture_width": fixed_layout.size[0], "texture_height": fixed_layout.size[1],
                   "visible_bounds_width": dims.VISIBLE_BOUNDS_WIDTH,
                   "visible_bounds_height": dims.VISIBLE_BOUNDS_HEIGHT,
                   "visible_bounds_offset": dims.VISIBLE_BOUNDS_OFFSET}
    geometry = {"description": description, "bones": bones}
    lit_geometry = geometry_passes.select_faces(geometry, geometry_passes.PassSpec(
        "geometry.yasu_ride.scooter_lit",
        lambda name, cube, face: name in ("headlights", "tail_lights") or name.startswith("glow_")))
    bound = {face.region for bone in lit_geometry["bones"]
             for cube in bone.get("cubes", []) for face in cube["uv"].values()}
    lit_layout = pack_regions((r for r in regions.values() if r.name in bound), shared=False)
    for original_bone, lit_bone in zip(bones, lit_geometry["bones"], strict=True):
        for original_cube, lit_cube in zip(original_bone["cubes"], lit_bone["cubes"]):
            for name, face in lit_cube["uv"].items():
                original = original_cube["uv"][name]
                relocate_face(local_uvs[id(original)], regions[original.region], lit_layout, face)
    kit.mirror_to_game(bones)
    kit.mirror_to_game(lit_geometry["bones"])
    fixed_geometry, paint_geometry = geometry_passes.partition_geometry(geometry, [
        geometry_passes.PassSpec("geometry.yasu_ride.scooter", lambda bone, cube, name: not is_paint(cube["uv"][name])),
        geometry_passes.PassSpec("geometry.yasu_ride.scooter_paint", lambda bone, cube, name: is_paint(cube["uv"][name])),
    ])
    cube_tilt.assert_axes(all_cubes, merged.assemblies, ASSEMBLIES)
    fixed = finish_pass(fixed_geometry, fixed_layout)
    paint = finish_pass(paint_geometry, paint_layout)
    lit = finish_pass(lit_geometry, lit_layout)
    full = rounded({"format_version": "1.12.0", "minecraft:geometry": [geometry]})
    return BuildResult(full, fixed, paint, lit)


def main(argv):
    rp = Path(argv[0])
    outputs = texture_io.Outputs("--check" in argv[1:])
    built = build()
    for name, render_pass in (("scooter", built.fixed), ("scooter_paint", built.paint), ("scooter_lit", built.lit)):
        outputs.json(rp / f"models/entity/yasu_ride/{name}.geo.json", render_pass.geometry)
    outputs.json(rp / "animations/yasu_ride/scooter.anim.json", load_tool("scooter_anim").build())
    scooter_textures.write(outputs, rp, built.fixed.layout, built.fixed.pixels,
                           built.paint.layout, built.paint.pixels, built.lit.layout, built.lit.pixels)
    counts = [(b["name"], len(b["cubes"])) for b in built.full_geometry["minecraft:geometry"][0]["bones"]]
    for name, count in counts:
        print(f"{name}: {count}")
    print(f"total cubes: {sum(count for _, count in counts)}")
    outputs.finish("Stale scooter outputs:", "scooter model and texture are up to date")


if __name__ == "__main__":
    main(sys.argv[1:])
