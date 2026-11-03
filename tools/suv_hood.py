"""SUV hood, dome, cowl and hood details."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box
panel_face = shell.panel_face
arch_cut = shell.arch_cut
suv_cubes = load_tool("suv_cubes")
turned = suv_cubes.turned


def hood_cubes():
    return [
        # Hood (engine compartment) above the front arches; its lower sides follow the arches below
        panel_face(box(-DIMS.chassis.body_half_width, DIMS.arch.top_y, DIMS.hood.rear_z, DIMS.chassis.body_half_width, DIMS.hood.top_y, DIMS.hood.front_z, "body"), "hood_top", "up"),
        box(-DIMS.arch.liner_x, DIMS.chassis.floor_y, DIMS.hood.rear_z, DIMS.arch.liner_x, DIMS.arch.top_y, DIMS.hood.front_z, "body"),
    ]


def hood_dome_and_cowl_cubes():
    # Hood: a raised power dome, a black mesh vent on each side of it, washer nozzles, the cowl's vent
    # strip with the wipers parked on it, and the latches at the rear corners
    return [
        box(-9.5, DIMS.hood.top_y, DIMS.hood.rear_z + 2, 9.5, DIMS.hood.top_y + 0.4, DIMS.hood.front_z - 0.4, "body"),
        box(-8.5, DIMS.hood.top_y + 0.4, DIMS.hood.rear_z + 2.6, 8.5, DIMS.hood.top_y + 0.7, DIMS.hood.front_z - 0.9, "body"),
        box(-DIMS.chassis.body_half_width, DIMS.hood.top_y, DIMS.hood.rear_z, DIMS.chassis.body_half_width, DIMS.hood.top_y + 0.3, DIMS.hood.rear_z + 1.6, "trim"),  # cowl
        box(-3, DIMS.hood.top_y + 0.3, DIMS.hood.rear_z + 0.4, 3, DIMS.hood.top_y + 0.4, DIMS.hood.rear_z + 1.3, "grille"),  # cowl vent
    ]


def hood_detail_cubes():
    return [
        box(10, DIMS.hood.top_y, DIMS.hood.front_z - 7.5, 12.2, DIMS.hood.top_y + 0.5, DIMS.hood.front_z - 2.5, "grille"),  # vent
        *[box(10.2, DIMS.hood.top_y + 0.5, z, 12.0, DIMS.hood.top_y + 0.6, z + 0.35, "trim") for z in (DIMS.hood.front_z - d for d in (7, 6.1, 5.2, 4.3, 3.4))],  # vent mesh
        box(2.4, DIMS.hood.top_y + 0.7, DIMS.hood.front_z - 4, 3.2, DIMS.hood.top_y + 1.1, DIMS.hood.front_z - 3, "grille"),  # washer nozzle
        box(11.4, DIMS.hood.top_y - 0.8, DIMS.hood.rear_z + 0.8, 12.6, DIMS.hood.top_y + 0.7, DIMS.hood.rear_z + 2.2, "grille"),  # latch
        turned(box(1, DIMS.hood.top_y + 0.3, DIMS.hood.rear_z + 0.6, 9.5, DIMS.hood.top_y + 0.6, DIMS.hood.rear_z + 0.9, "grille"), (1, DIMS.hood.top_y + 0.3, DIMS.hood.rear_z + 0.75), (0, -8, 0)),  # wiper
    ]


def hood_lower_side_cubes():
    # The hood's lower sides, cut along the front arch, outside the liners. They reach back to the front
    # door's hinge: with the front arch moved forward, its flare no longer hides the gap under the cowl.
    return arch_cut(DIMS.arch.liner_x, DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.arch.top_y, DIMS.cabin.front_door_hinge_z, DIMS.hood.front_z, DIMS.wheels.front_axle_z, "body")


def cowl_side_cubes():
    return [box(DIMS.arch.liner_x, DIMS.arch.top_y, DIMS.cabin.front_door_hinge_z, DIMS.chassis.body_half_width, DIMS.hood.top_y, DIMS.hood.rear_z, "body")]
