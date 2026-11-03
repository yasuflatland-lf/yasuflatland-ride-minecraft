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

DIMS = load_tool("suv_dims").DIMS
palette = load_tool("suv_palette")
globals().update({k: v for k, v in vars(palette).items() if k.isupper()})
chassis = load_tool("suv_chassis")
hood = load_tool("suv_hood")
grille = load_tool("suv_grille")
fenders = load_tool("suv_fenders")
bumpers = load_tool("suv_bumpers")
steps = load_tool("suv_steps")
doors = load_tool("suv_doors")
greenhouse = load_tool("suv_greenhouse")
rear = load_tool("suv_rear")
lamps = load_tool("suv_lamps")
dash = load_tool("suv_dash")
gauges = load_tool("suv_gauges")
cabin = load_tool("suv_cabin")
running_gear = load_tool("suv_running_gear")
export = load_tool("suv_export")
texture = load_tool("suv_texture")
ATLAS = load_tool("suv_atlas").ATLAS
both_sides = load_tool("suv_cubes").both_sides

ASSEMBLIES = {
    name: {"owner": "suv", "cubes": count}
    for part in (chassis, hood, grille, fenders, bumpers, steps, doors, greenhouse, rear, lamps, dash, gauges, cabin, running_gear)
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
    *chassis.chassis_cubes(),
    *hood.hood_cubes(),
    *dash.dash_slab_cubes(),
    *greenhouse.windshield_frame_cubes(),
    *both_sides(greenhouse.a_pillar_cubes()),
    *greenhouse.rearview_mirror_cubes(),
    *greenhouse.roof_cubes(),
    *both_sides(greenhouse.b_pillar_cubes()),
    *both_sides(rear.cargo_upper_side_cubes()),
    *rear.cargo_floor_cubes(),
    *rear.tailgate_cubes(),
    *lamp_part("third_brake_light"),
    *lamp_part("tail_light", mirrored=True),
    *lamp_part("tail_resin", mirrored=True),
    *rear.tailgate_hinge_cubes(),
    *rear.exhaust_cubes(),
    *both_sides(steps.side_step_cubes()),
]
body += hood.hood_dome_and_cowl_cubes()
body += both_sides(hood.hood_detail_cubes())
body += both_sides(hood.hood_lower_side_cubes())
body += both_sides(hood.cowl_side_cubes())
body += both_sides(rear.cargo_lower_side_cubes())
body += rear.fuel_door_cubes()
body += both_sides(fenders.arch_liner_cubes())
body += both_sides([
    *fenders.fender_flare(DIMS.wheels.front_axle_z, DIMS.flare.front_crest_y, DIMS.front_bumper.top_y, DIMS.steps.top_y),
    *fenders.fender_flare(DIMS.wheels.rear_axle_z, DIMS.flare.rear_crest_y, DIMS.steps.top_y, DIMS.chassis.sill_y),
    *fenders.fender_vent_cubes(),
    *lamp_part("turn_signal"),
])
body += lamp_part("front_strip", mirrored=True)
body += bumpers.front_bumper_lower_cubes()
body += bumpers.front_bumper_band_cubes()
body += bumpers.front_bumper_top_cubes()
body += both_sides(bumpers.frame_horn_cubes())
body += both_sides(bumpers.front_tow_hook_cubes())
body += bumpers.rear_bumper_cubes()
body += both_sides([
    *lamp_part("bumper_reflector"),
    *bumpers.rear_tow_hook_cubes(),
])
body += cabin.pleated_seat(2, 11, DIMS.seats.front_z)
body += cabin.pleated_seat(-11, -2, DIMS.seats.front_z)
body += cabin.pleated_seat(-11, 0, DIMS.seats.rear_z)
body += cabin.pleated_seat(0, 11, DIMS.seats.rear_z)
body += cabin.steering_cubes()
body += lamp_part("headlight_bezel")
body += lamp_part("headlight_lens")
body += grille.grille_cubes()
body += lamp_part("fog_pocket", mirrored=True)
body += lamp_part("fog_lens", mirrored=True)
body += both_sides(greenhouse.roof_edge_cubes())
body += greenhouse.roof_rib_cubes()
body += gauges.gauge_cluster_cubes() + dash.dash_fittings_cubes()
body += cabin.floor_console_cubes()
body += cabin.pedal_cubes()
body += running_gear.round_tire("z", DIMS.spare.center, DIMS.spare.radius, DIMS.chassis.rear_z - 2 * DIMS.spare.half_width, DIMS.chassis.rear_z)
body += rear.spare_rim_cubes()

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
                {"name": "body", "parent": "root", "pivot": [0, DIMS.chassis.floor_y, 0], "cubes": body,
                 "locators": {"exhaust": [9, DIMS.chassis.sill_y - 1.4, DIMS.chassis.rear_z - 2.6]}},
                *[{"name": name, "parent": "body", "pivot": [0, DIMS.chassis.floor_y, 0], "cubes": lamp_bones[name]}
                  for name in ("headlights", "tail_lights")],
                {"name": "headlight_bezels", "parent": "body", "pivot": [0, 0, 0], "cubes": lamp_bones["headlight_bezels"]},
                # Shown only in flight by the render controller (ADR 0026)
                {"name": "rear_glass", "parent": "body", "pivot": [0, DIMS.chassis.floor_y, 0],
                 "cubes": greenhouse.rear_glass_cubes()},
                running_gear.wheel("wheel_fl", -1, DIMS.wheels.front_axle_z),
                running_gear.wheel("wheel_fr", +1, DIMS.wheels.front_axle_z),
                running_gear.wheel("wheel_rl", -1, DIMS.wheels.rear_axle_z),
                running_gear.wheel("wheel_rr", +1, DIMS.wheels.rear_axle_z),
                # Hidden until the submarine form shows them (ADR 0040)
                {"name": "windows_sealed", "parent": "body", "pivot": [0, DIMS.chassis.floor_y, 0], "cubes": greenhouse.windows_sealed()},
                running_gear.prop("prop_rl", -1, DIMS.wheels.rear_axle_z),
                running_gear.prop("prop_rr", +1, DIMS.wheels.rear_axle_z),
                running_gear.glow("glow_fl", -1, DIMS.wheels.front_axle_z),
                running_gear.glow("glow_fr", +1, DIMS.wheels.front_axle_z),
                running_gear.glow("glow_rl", -1, DIMS.wheels.rear_axle_z),
                running_gear.glow("glow_rr", +1, DIMS.wheels.rear_axle_z),
                running_gear.arm("arm_fl", -1, DIMS.wheels.front_axle_z),
                running_gear.arm("arm_fr", +1, DIMS.wheels.front_axle_z),
                running_gear.arm("arm_rl", -1, DIMS.wheels.rear_axle_z),
                running_gear.arm("arm_rr", +1, DIMS.wheels.rear_axle_z),
                running_gear.sub_arm("sub_arm_rl", -1, DIMS.wheels.rear_axle_z),
                running_gear.sub_arm("sub_arm_rr", +1, DIMS.wheels.rear_axle_z),
                *[doors.door(n) for n in doors.DOORS],
                {"name": "seat_0", "parent": "body", "pivot": [6, DIMS.seats.cushion_y, DIMS.seats.front_z + 2]},
                {"name": "seat_1", "parent": "body", "pivot": [-6, DIMS.seats.cushion_y, DIMS.seats.front_z + 2]},
                {"name": "seat_2", "parent": "body", "pivot": [6, DIMS.seats.cushion_y, DIMS.seats.rear_z + 1]},
                {"name": "seat_3", "parent": "body", "pivot": [-6, DIMS.seats.cushion_y, DIMS.seats.rear_z + 1]},
            ],
        }
    ],
}

geometry = geo["minecraft:geometry"][0]
export.scale_geometry(geometry)
export.turn_around(geometry["bones"])
export.sync_animation(out, RP / "animations/yasu_ride/suv.anim.json", export.scaled)

model_cubes = [cube for bone in geometry["bones"] for cube in bone.get("cubes", [])]
assert_axes(model_cubes, {"arc": compound_cubes(model_cubes)}, ASSEMBLIES)
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
