"""SUV cargo area, tailgate, spare wheel rim, exhaust and fuel door."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box
panel_face = shell.panel_face
arch_cut = shell.arch_cut
suv_cubes = load_tool("suv_cubes")
disc = suv_cubes.disc


def cargo_upper_side_cubes():
    # Cargo area sides: body-colored below the belt line, the black hardtop above it with a closed,
    # tinted quarter window
    return [
        box(DIMS.chassis.cabin_half_width, DIMS.greenhouse.belt_y, DIMS.chassis.rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y, DIMS.chassis.cargo_front_z, "hardtop"),
        box(DIMS.chassis.body_half_width, DIMS.greenhouse.window_bottom_y, DIMS.chassis.rear_z + 2.5, 13.1, DIMS.greenhouse.window_top_y, DIMS.chassis.cargo_front_z - 1.5, "glass"),
    ]


def cargo_lower_side_cubes():
    # The cargo area's body-colored side below the belt line, cut along the rear arch
    return arch_cut(DIMS.chassis.cabin_half_width, DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.greenhouse.belt_y, DIMS.chassis.rear_z + 1, DIMS.chassis.cargo_front_z, DIMS.wheels.rear_axle_z, "body")


def cargo_floor_cubes():
    return [
        # Cargo floor
        box(-DIMS.chassis.cabin_half_width, DIMS.chassis.floor_y, DIMS.chassis.rear_z + 1, DIMS.chassis.cabin_half_width, DIMS.chassis.floor_y + 0.3, DIMS.chassis.cargo_front_z, "hardtop"),
    ]


def tailgate_cubes():
    return [
        # Rear: body-colored tailgate, and the hardtop's header over the rear window with the third brake
        # light under it. On the ground the rear window stays open; the rear_glass bone closes it in the
        # other forms (ADR 0026).
        panel_face(box(-DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.chassis.rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.belt_y, DIMS.chassis.rear_z + 1, "body"), "tailgate", "north"),
        box(-DIMS.chassis.body_half_width, DIMS.greenhouse.window_top_y, DIMS.chassis.rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y, DIMS.chassis.rear_z + 1, "hardtop"),
    ]


def tailgate_hinge_cubes():
    # The tailgate hinges sit on the right.
    return [
        box(6.2, 14.2, DIMS.chassis.rear_z - 0.3, 9.0, 15.2, DIMS.chassis.rear_z, "body"),
        box(6.2, 10.4, DIMS.chassis.rear_z - 0.3, 9.0, 11.4, DIMS.chassis.rear_z, "body"),
    ]


def spare_rim_cubes():
    result = []
    result += disc("z", DIMS.spare.center, 2.3, DIMS.chassis.rear_z - 3.3, DIMS.chassis.rear_z - 3, (0, 30, 60), "rim")
    result += disc("z", DIMS.spare.center, 0.9, DIMS.chassis.rear_z - 3.5, DIMS.chassis.rear_z - 3.3, (0, 45), "trim")
    return result


def exhaust_cubes():
    return [
        # Exhaust pipe (rear right = +x side, sticking out backward from under the rear bumper)
        box(8, DIMS.chassis.sill_y - 2.2, DIMS.chassis.rear_z - 2, 10, DIMS.chassis.sill_y - 0.6, DIMS.wheels.rear_axle_z - 1, "trim"),
        box(7.75, DIMS.chassis.sill_y - 2.45, DIMS.chassis.rear_z - 2.5, 10.25, DIMS.chassis.sill_y - 0.35, DIMS.chassis.rear_z - 2, "rim"),
    ]


def fuel_door_cubes():
    # Round fuel door on the left side of the cargo area, behind the rear flare and under the belt line
    return disc("x", (-DIMS.chassis.body_half_width, 14.8, DIMS.chassis.rear_z + 2.7), 1.2, -DIMS.chassis.body_half_width - 0.25, -DIMS.chassis.body_half_width, [i * 11.25 for i in range(8)], "grille")  # 32 sides
