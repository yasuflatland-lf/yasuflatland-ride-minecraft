"""SUV chassis and floor."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box


def chassis_cubes():
    # The wider tires now cross the body sides; cut the floor to the same arches as the panels.
    rear, front = DIMS.chassis.rear_z + 1, DIMS.hood.front_z - 1
    split = (DIMS.wheels.rear_axle_z + DIMS.wheels.front_axle_z) / 2
    sides = []
    for back, ahead, axle in ((rear, split, DIMS.wheels.rear_axle_z),
                              (split, front, DIMS.wheels.front_axle_z)):
        sides += shell.arch_cut(DIMS.arch.liner_x, DIMS.chassis.body_half_width,
                                DIMS.chassis.sill_y, DIMS.chassis.floor_y, back, ahead, axle, "trim")
    return [box(-DIMS.arch.liner_x, DIMS.chassis.sill_y, rear, DIMS.arch.liner_x,
                DIMS.chassis.floor_y, front, "trim"), *shell.both_sides(sides)]
