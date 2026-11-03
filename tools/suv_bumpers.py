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
    bumper = DIMS.front_bumper
    bar = chamfered_bar(bumper.band_bottom_y, bumper.band_top_y, bumper.back_z, bumper.tip_z,
                        bumper.end_back_z, DIMS.wheels.bumper_half_width, 2)
    # A continuous back web supports the winch recess; the outboard pieces retain tire clearance.
    return [
        box(-DIMS.chassis.body_half_width, bumper.band_bottom_y, bumper.back_z,
            DIMS.chassis.body_half_width, bumper.band_top_y, bumper.winch_face_z, "trim"),
        *suv_cubes.both_sides([
            box(bumper.winch_half_width, bumper.band_bottom_y, bumper.winch_face_z,
                DIMS.chassis.body_half_width, bumper.band_top_y, bumper.tip_z, "trim"),
        ]),
        *bar[1:],
    ]


def front_winch_cubes():
    bumper = DIMS.front_bumper
    y = DIMS.lamps.fog_y
    slot_bottom = y - bumper.fairlead_slot_height / 2
    bell = box(bumper.winch_bell_inner_x, bumper.winch_drum_bottom_y - bumper.winch_bell_overhang,
               bumper.winch_drum_back_z - bumper.winch_bell_overhang,
               bumper.winch_bell_outer_x, bumper.winch_drum_top_y + bumper.winch_bell_overhang,
               bumper.winch_drum_front_z + bumper.winch_bell_overhang, "trim")
    return [
        box(-bumper.fairlead_width / 2, y - bumper.fairlead_height / 2, bumper.winch_face_z,
            bumper.fairlead_width / 2, y + bumper.fairlead_height / 2, bumper.fairlead_front_z, "rim"),
        box(-bumper.fairlead_slot_width / 2, slot_bottom, bumper.fairlead_front_z,
            bumper.fairlead_slot_width / 2, y + bumper.fairlead_slot_height / 2,
            bumper.fairlead_front_z + bumper.fairlead_slot_depth, "grille"),
        box(-bumper.winch_hook_width / 2, slot_bottom - bumper.winch_hook_height, bumper.fairlead_front_z,
            bumper.winch_hook_width / 2, slot_bottom,
            bumper.fairlead_front_z + bumper.winch_hook_depth, "chrome"),
        box(-bumper.winch_drum_half_width, bumper.winch_drum_bottom_y, bumper.winch_drum_back_z,
            bumper.winch_drum_half_width, bumper.winch_drum_top_y, bumper.winch_drum_front_z, "grille"),
        *suv_cubes.both_sides([bell]),
    ]


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
    bumper = DIMS.front_bumper
    x0 = bumper.shackle_x - bumper.shackle_thickness / 2
    x1 = bumper.shackle_x + bumper.shackle_thickness / 2
    rear_z = bumper.tip_z - bumper.shackle_rear_offset
    front_z = bumper.tip_z - bumper.shackle_front_offset
    top_y = bumper.top_y + bumper.shackle_height
    return [
        box(x0, bumper.top_y, z, x1, top_y, z + bumper.shackle_thickness, "chrome")
        for z in (rear_z, front_z)
    ] + [box(x0, top_y - bumper.shackle_thickness, rear_z,
             x1, top_y, front_z + bumper.shackle_thickness, "chrome")]


def rear_tow_hook_cubes():
    return [
        box(7.4, DIMS.chassis.sill_y - 2.2, DIMS.chassis.rear_z - 1.2, 8.4, DIMS.rear_bumper.bottom_y, DIMS.chassis.rear_z + 1, "tail"),  # tow hook
    ]
