"""SUV chassis and floor."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box


def chassis_cubes():
    return [
        # Chassis and floor
        box(-DIMS.chassis.body_half_width, DIMS.chassis.sill_y, DIMS.chassis.rear_z + 1, DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.hood.front_z - 1, "trim"),
    ]
