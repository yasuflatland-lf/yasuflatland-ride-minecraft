"""Generate the model and textures for the Yasuflatland Ride SUV.

Coordinates are in pixels (16 px = 1 block). The definitions below use "forward +z, right +x",
and are rotated 180° around the Y axis just before writing, because in Bedrock the front of an
entity is on the -z side of the model.
Bone names follow the convention (ADR 0009, 0022, 0043, 0192): root / body / headlights / tail_lights /
wheel_fl / wheel_fr / wheel_rl / wheel_rr / glow_fl / glow_fr / glow_rl / glow_rr / rear_glass / windows_sealed /
prop_rl / prop_rr / arm_fl / arm_fr / arm_rl / arm_rr / sub_arm_rl / sub_arm_rr / door_fr / door_rr / door_fl /
door_rl / seat_0..3.
"""
import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

cube_tilt = load_tool("cube_tilt")
assert_axes, compound_cubes = cube_tilt.assert_axes, cube_tilt.compound_cubes

RP = Path(sys.argv[1])
MODELS = RP / "models/entity/yasu_ride"
ENTITY_TEXTURES = RP / "textures/entity/yasu_ride"
ITEM_TEXTURES = RP / "textures/items/yasu_ride"
out = load_tool("texture_io").Outputs("--check" in sys.argv[2:])

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
palette = load_tool("suv_palette")
globals().update({k: v for k, v in vars(palette).items() if k.isupper()})
body_parts = load_tool("suv_body")
dash = load_tool("suv_dash")
gauges = load_tool("suv_gauges")
cabin = load_tool("suv_cabin")
running_gear = load_tool("suv_running_gear")
export = load_tool("suv_export")
texture = load_tool("suv_texture")
ATLAS = load_tool("suv_atlas").ATLAS
suv_cubes = load_tool("suv_cubes")

ASSEMBLIES = {
    name: {"owner": "suv", "cubes": count}
    for part in (body_parts, dash, gauges, cabin, running_gear)
    for name, count in getattr(part, "ASSEMBLIES", {}).items()
}

bone_cubes = body_parts.build()
hull_turn_ids = {id(c) for c in compound_cubes([c for cubes in bone_cubes.values() for c in cubes])}
body = bone_cubes["body"]
body += [
    *dash.dash_slab_cubes(),
    # The seats stop short of the side windows and the rear wheels' inner faces (ADR 0214); the interior
    # is refitted in a later pull request.
    *cabin.pleated_seat(2, SEAT_OUTER_X, FRONT_SEAT_Z),
    *cabin.pleated_seat(-SEAT_OUTER_X, -2, FRONT_SEAT_Z),
    *cabin.pleated_seat(-SEAT_OUTER_X, 0, REAR_SEAT_Z),
    *cabin.pleated_seat(0, SEAT_OUTER_X, REAR_SEAT_Z),
    *cabin.steering_cubes(),
    *gauges.gauge_cluster_cubes(),
    *dash.dash_fittings_cubes(),
    *suv_cubes.shifted_z([*cabin.floor_console_cubes(), *cabin.pedal_cubes()], INTERIOR_SHIFT_Z),
]

def door(name):
    """A door hinged at its front edge on the body side; the front doors carry the mirrors."""
    side = 1 if name.endswith("l") else -1
    hinge = REAR_DOOR_HINGE_Z if name.startswith("door_r") else FRONT_DOOR_HINGE_Z
    return {"name": name, "parent": "body", "pivot": [-side * DOOR_HINGE_X, FLOOR_Y, hinge], "cubes": bone_cubes[name]}


geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [
        {
            "description": {
                "identifier": "geometry.yasu_ride.suv",
                "texture_width": ATLAS.width,
                "texture_height": ATLAS.height,
                "visible_bounds_width": 5,
                "visible_bounds_height": 3,
                "visible_bounds_offset": [0, 1, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 12, 0]},
                {"name": "body", "parent": "root", "pivot": [0, FLOOR_Y, 0], "cubes": body,
                 "locators": {"exhaust": [EXHAUST_X, EXHAUST_Y, EXHAUST_Z]}},
                *[{"name": name, "parent": "body", "pivot": [0, FLOOR_Y, 0], "cubes": bone_cubes[name]}
                  for name in ("headlights", "tail_lights")],
                {"name": "headlight_bezels", "parent": "body", "pivot": [0, 0, 0], "cubes": bone_cubes["headlight_bezels"]},
                # Shown only in flight by the render controller (ADR 0026)
                {"name": "rear_glass", "parent": "body", "pivot": [0, FLOOR_Y, 0],
                 "cubes": bone_cubes["rear_glass"]},
                running_gear.wheel("wheel_fl", -1, FRONT_AXLE_Z),
                running_gear.wheel("wheel_fr", +1, FRONT_AXLE_Z),
                running_gear.wheel("wheel_rl", -1, REAR_AXLE_Z),
                running_gear.wheel("wheel_rr", +1, REAR_AXLE_Z),
                # Hidden until the submarine form shows them (ADR 0040)
                {"name": "windows_sealed", "parent": "body", "pivot": [0, FLOOR_Y, 0], "cubes": bone_cubes["windows_sealed"]},
                running_gear.prop("prop_rl", -1, REAR_AXLE_Z),
                running_gear.prop("prop_rr", +1, REAR_AXLE_Z),
                running_gear.glow("glow_fl", -1, FRONT_AXLE_Z),
                running_gear.glow("glow_fr", +1, FRONT_AXLE_Z),
                running_gear.glow("glow_rl", -1, REAR_AXLE_Z),
                running_gear.glow("glow_rr", +1, REAR_AXLE_Z),
                running_gear.arm("arm_fl", -1, FRONT_AXLE_Z),
                running_gear.arm("arm_fr", +1, FRONT_AXLE_Z),
                running_gear.arm("arm_rl", -1, REAR_AXLE_Z),
                running_gear.arm("arm_rr", +1, REAR_AXLE_Z),
                running_gear.sub_arm("sub_arm_rl", -1, REAR_AXLE_Z),
                running_gear.sub_arm("sub_arm_rr", +1, REAR_AXLE_Z),
                *[door(n) for n in body_parts.DOORS],
                {"name": "seat_0", "parent": "body", "pivot": [6, 10, FRONT_SEAT_Z + 2]},
                {"name": "seat_1", "parent": "body", "pivot": [-6, 10, FRONT_SEAT_Z + 2]},
                {"name": "seat_2", "parent": "body", "pivot": [6, 10, REAR_SEAT_Z + 1]},
                {"name": "seat_3", "parent": "body", "pivot": [-6, 10, REAR_SEAT_Z + 1]},
            ],
        }
    ],
}

geometry = geo["minecraft:geometry"][0]
export.scale_geometry(geometry)
export.turn_around(geometry["bones"])
export.sync_animation(out, RP / "animations/yasu_ride/suv.anim.json", export.scaled)

model_cubes = [cube for bone in geometry["bones"] for cube in bone.get("cubes", [])]
hull_turns = [cube for cube in compound_cubes(model_cubes) if id(cube) in hull_turn_ids]
arcs = [cube for cube in compound_cubes(model_cubes) if id(cube) not in hull_turn_ids]
assert_axes(model_cubes, {"arc": arcs, "hull_turns": hull_turns}, ASSEMBLIES)
out.json(MODELS / "suv.geo.json", geo, indent=1)

export.paint_textures(out, ENTITY_TEXTURES)
load_tool("lit_textures").build_lit_textures(
    out, ENTITY_TEXTURES, "suv", ATLAS.width, ATLAS.height,
    texture.paint_pixel(palette.BODY_PAINTS[0]),
    is_lit=texture.is_lit, opaque_unlit_cutouts=True)
export.item_icons(out, ITEM_TEXTURES)
print("cubes:", len(model_cubes))

if out.check:
    out.finish("Stale SUV outputs:", "SUV model and textures are up to date")
