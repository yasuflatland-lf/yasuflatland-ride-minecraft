"""Generate the model and textures for the Yasuflatland Ride SUV.

Coordinates are in pixels (16 px = 1 block). The definitions below use "forward +z, right +x",
and are rotated 180° around the Y axis just before writing, because in Bedrock the front of an
entity is on the -z side of the model.
Bone names follow the convention (ADR 0009, 0022, 0043, 0192): root / body / headlights / tail_lights /
wheel_fl / wheel_fr / wheel_rl / wheel_rr / glow_fl / glow_fr / glow_rl / glow_rr / rear_glass / windows_sealed /
prop_rl / prop_rr / arm_fl / arm_fr / arm_rl / arm_rr / sub_arm_rl / sub_arm_rr / door_fr / door_rr / door_fl /
door_rl / seat_0..3.
"""
import json
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
MODELS.mkdir(parents=True, exist_ok=True)
ENTITY_TEXTURES.mkdir(parents=True, exist_ok=True)
ITEM_TEXTURES.mkdir(parents=True, exist_ok=True)

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
palette = load_tool("suv_palette")
globals().update({k: v for k, v in vars(palette).items() if k.isupper()})
shell = load_tool("suv_shell")
lamps = load_tool("suv_lamps")
dash = load_tool("suv_dash")
gauges = load_tool("suv_gauges")
cabin = load_tool("suv_cabin")
running_gear = load_tool("suv_running_gear")
export = load_tool("suv_export")
both_sides = load_tool("suv_cubes").both_sides

ASSEMBLIES = {
    name: {"owner": "suv", "cubes": count}
    for part in (shell, lamps, dash, gauges, cabin, running_gear)
    for name, count in getattr(part, "ASSEMBLIES", {}).items()
}

part_bones = {p.name: p.bone for p in lamps.LAMP_PARTS}
lamp_bones = {p.bone: [] for p in lamps.LAMP_PARTS if p.bone != "body"}


def lamp_part(name, mirrored=False):
    """Return a lamp piece's cubes for the body, or move them to their own lamp bone (ADR 0192)."""
    cubes = getattr(lamps, f"{name}_cubes")()
    if mirrored:
        cubes = both_sides(cubes)
    bone = part_bones[name]
    if bone == "body":
        return cubes
    lamp_bones[bone].extend(cubes)
    return []


body = [
    *shell.chassis_cubes(),
    *shell.hood_cubes(),
    *dash.dash_slab_cubes(),
    *shell.windshield_frame_cubes(),
    *both_sides(shell.a_pillar_cubes()),
    *shell.rearview_mirror_cubes(),
    *shell.roof_cubes(),
    *both_sides(shell.b_pillar_cubes()),
    *both_sides(shell.cargo_upper_side_cubes()),
    *shell.cargo_floor_cubes(),
    *shell.tailgate_cubes(),
    *lamp_part("third_brake_light"),
    *lamp_part("tail_light", mirrored=True),
    *shell.tailgate_hinge_cubes(),
    *shell.exhaust_cubes(),
    *both_sides(shell.side_step_cubes()),
]
body += shell.hood_dome_and_cowl_cubes()
body += both_sides(shell.hood_detail_cubes())
body += both_sides(shell.hood_lower_side_cubes())
body += both_sides(shell.cowl_side_cubes())
body += both_sides(shell.cargo_lower_side_cubes())
body += shell.fuel_door_cubes()
body += both_sides(shell.arch_liner_cubes())
body += both_sides([
    *shell.fender_flare(FRONT_AXLE_Z, SILL_Y + 1, SILL_Y),
    *shell.fender_flare(REAR_AXLE_Z, SILL_Y, SILL_Y),
    *lamp_part("turn_signal"),
])
body += lamp_part("front_strip", mirrored=True)
body += shell.front_bumper_lower_cubes()
body += shell.front_bumper_band_cubes()
body += shell.front_bumper_top_cubes()
body += both_sides(shell.frame_horn_cubes())
body += both_sides(shell.front_tow_hook_cubes())
body += shell.rear_bumper_cubes()
body += both_sides([
    *lamp_part("bumper_reflector"),
    *shell.rear_tow_hook_cubes(),
])
body += cabin.pleated_seat(2, 11, FRONT_SEAT_Z)
body += cabin.pleated_seat(-11, -2, FRONT_SEAT_Z)
body += cabin.pleated_seat(-11, 0, REAR_SEAT_Z)
body += cabin.pleated_seat(0, 11, REAR_SEAT_Z)
body += cabin.steering_cubes()
body += lamp_part("headlight_ring")
body += lamp_part("headlight_lens")
body += shell.grille_cubes()
body += lamp_part("fog_pocket", mirrored=True)
body += lamp_part("fog_lens", mirrored=True)
body += both_sides(shell.roof_edge_cubes())
body += shell.roof_rib_cubes()
body += gauges.gauge_cluster_cubes() + dash.passenger_dash_cubes()
body += cabin.floor_console_cubes()
body += cabin.pedal_cubes()
body += running_gear.round_tire("z", SPARE, 5, REAR - 3, REAR)
body += shell.spare_rim_cubes()

geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [
        {
            "description": {
                "identifier": "geometry.yasu_ride.suv",
                "texture_width": TEXTURE_WIDTH,
                "texture_height": 16,
                "visible_bounds_width": 5,
                "visible_bounds_height": 3,
                "visible_bounds_offset": [0, 1, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 12, 0]},
                {"name": "body", "parent": "root", "pivot": [0, FLOOR_Y, 0], "cubes": body,
                 "locators": {"exhaust": [9, SILL_Y - 1.4, REAR - 2.6]}},
                *[{"name": name, "parent": "body", "pivot": [0, FLOOR_Y, 0], "cubes": lamp_bones[name]}
                  for name in ("headlights", "tail_lights")],
                # Shown only in flight by the render controller (ADR 0026)
                {"name": "rear_glass", "parent": "body", "pivot": [0, FLOOR_Y, 0],
                 "cubes": shell.rear_glass_cubes()},
                running_gear.wheel("wheel_fl", -1, FRONT_AXLE_Z),
                running_gear.wheel("wheel_fr", +1, FRONT_AXLE_Z),
                running_gear.wheel("wheel_rl", -1, REAR_AXLE_Z),
                running_gear.wheel("wheel_rr", +1, REAR_AXLE_Z),
                # Hidden until the submarine form shows them (ADR 0040)
                {"name": "windows_sealed", "parent": "body", "pivot": [0, FLOOR_Y, 0], "cubes": shell.windows_sealed()},
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
                *[shell.door(n) for n in shell.DOORS],
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
export.sync_animation(RP / "animations/yasu_ride/suv.anim.json", export.scaled)

model_cubes = [cube for bone in geometry["bones"] for cube in bone.get("cubes", [])]
assert_axes(model_cubes, {"arc": compound_cubes(model_cubes)}, ASSEMBLIES)
(MODELS / "suv.geo.json").write_text(json.dumps(geo, indent=1))

export.paint_textures(ENTITY_TEXTURES)
export.lit_textures(ENTITY_TEXTURES, "suv", TEXTURE_WIDTH, 16,
                    palette.swatches(BODY_PAINTS[0].body))
export.item_icons(ITEM_TEXTURES)
print("cubes:", len(model_cubes))
