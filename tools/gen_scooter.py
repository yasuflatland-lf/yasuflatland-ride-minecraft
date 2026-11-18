"""Generate the scooter foundation; area builders replace placeholders independently."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
cube_tilt = load_tool("cube_tilt")
texture_io = load_tool("texture_io")
scooter_textures = load_tool("scooter_textures")

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
    "running_wheel_front": {"owner": "scooter", "cubes": 292},
    "running_wheel_rear": {"owner": "scooter", "cubes": 292},
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
        return {k: rounded(v) for k, v in value.items()}
    return value


def build():
    parents = {name: parent for name, parent, _ in BONES}
    for strut in dims.STRUT_BONES.values():
        ancestor = parents[strut]
        while ancestor is not None:
            if ancestor.endswith("_fold"):
                raise ValueError(f"Strut bone {strut} must not descend from fold bone {ancestor}")
            ancestor = parents[ancestor]
    merged = kit.AreaCubes()
    for name in AREA_ORDER:
        area = load_tool(f"scooter_{name}").build()
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
    layout = atlas.pack_layout()
    atlas.resolve(all_cubes, layout)
    bones = [{"name": name, **({"parent": parent} if parent else {}), "pivot": list(pivot),
              "cubes": merged.get(name, [])} for name, parent, pivot in BONES]
    for bone in bones:
        if bone["name"].startswith("glow_"):
            side = bone["name"].removeprefix("glow_")
            outer = min(cube["origin"][0] for cube in bone["cubes"])
            bone["locators"] = {"hover_" + side: [outer, *bone["pivot"][1:]]}
    kit.mirror_to_game(bones)
    cube_tilt.assert_axes(all_cubes, merged.assemblies, ASSEMBLIES)
    pixels = atlas.render_atlas(layout)
    errors = atlas.audit(layout, pixels)
    if errors:
        raise ValueError("Scooter atlas audit failed: " + "; ".join(errors))
    geo = {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.scooter",
                        "texture_width": layout.size[0], "texture_height": layout.size[1],
                        "visible_bounds_width": dims.VISIBLE_BOUNDS_WIDTH,
                        "visible_bounds_height": dims.VISIBLE_BOUNDS_HEIGHT,
                        "visible_bounds_offset": dims.VISIBLE_BOUNDS_OFFSET},
        "bones": bones}]}
    return rounded(geo), layout, pixels


def main(argv):
    rp = Path(argv[0])
    outputs = texture_io.Outputs("--check" in argv[1:])
    geo, layout, pixels = build()
    outputs.json(rp / "models/entity/yasu_ride/scooter.geo.json", geo)
    outputs.json(rp / "animations/yasu_ride/scooter.anim.json", load_tool("scooter_anim").build())
    scooter_textures.write(outputs, rp, layout, pixels)
    counts = [(b["name"], len(b["cubes"])) for b in geo["minecraft:geometry"][0]["bones"]]
    for name, count in counts:
        print(f"{name}: {count}")
    print(f"total cubes: {sum(count for _, count in counts)}")
    outputs.finish("Stale scooter outputs:", "scooter model and texture are up to date")


if __name__ == "__main__":
    main(sys.argv[1:])
