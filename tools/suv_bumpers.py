"""SUV bumpers, frame horns and tow hooks."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box
chamfered_bar = shell.chamfered_bar
suv_cubes = load_tool("suv_cubes")
facing_back = suv_cubes.facing_back


def front_bumper_lower_cubes():
    # Front bumper: a low bar under the grille, between a tucked-in lower lip and a slightly set-back top
    # edge, standing on two frame horns that reach forward from the chassis
    return chamfered_bar(DIMS.front_bumper.bottom_y, DIMS.front_bumper.band_bottom_y, DIMS.front_bumper.back_z, DIMS.front_bumper.tip_z - 1,
                          DIMS.front_bumper.end_back_z, DIMS.wheels.bumper_half_width - 1, 1.2)


def front_bumper_band_cubes():
    return chamfered_bar(DIMS.front_bumper.band_bottom_y, DIMS.front_bumper.band_top_y, DIMS.front_bumper.back_z, DIMS.front_bumper.tip_z,
                          DIMS.front_bumper.end_back_z, DIMS.wheels.bumper_half_width, 2)


def front_bumper_top_cubes():
    return chamfered_bar(DIMS.front_bumper.band_top_y, DIMS.front_bumper.top_y, DIMS.front_bumper.back_z, DIMS.front_bumper.tip_z - 0.5,
                          DIMS.front_bumper.end_back_z, DIMS.wheels.bumper_half_width - 0.5, 1.7)


def rear_bumper_cubes():
    # Rear bumper: the same kind of bar facing backward, with red reflectors at its ends and red tow
    # hooks under it
    return [facing_back(c) for c in chamfered_bar(DIMS.rear_bumper.bottom_y, DIMS.rear_bumper.top_y, -DIMS.rear_bumper.tip_z - DIMS.rear_bumper.length, -DIMS.rear_bumper.tip_z,
                                                   DIMS.rear_bumper.end_back_z, DIMS.wheels.bumper_half_width, DIMS.rear_bumper.chamfer)]


def frame_horn_cubes():
    return [box(5, DIMS.chassis.sill_y, DIMS.hood.front_z - 1.5, 7, DIMS.chassis.floor_y, DIMS.front_bumper.back_z + 0.5, "trim")]


def front_tow_hook_cubes():
    # Tow hooks standing on the bar's top, outboard of the grille's middle slots
    return [box(5.2, DIMS.front_bumper.top_y, DIMS.front_bumper.tip_z - 2, 5.9, DIMS.front_bumper.top_y + 1, DIMS.front_bumper.tip_z - 0.8, "rim")]


def rear_tow_hook_cubes():
    return [
        box(7.4, DIMS.chassis.sill_y - 2.2, DIMS.chassis.rear_z - 1.2, 8.4, DIMS.rear_bumper.bottom_y, DIMS.chassis.rear_z + 1, "tail"),  # tow hook
    ]
