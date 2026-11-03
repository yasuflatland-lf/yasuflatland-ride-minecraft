"""SUV side steps."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box


def side_step_cubes():
    # Side steps run between the fender flares.
    return [box(DIMS.chassis.body_half_width, DIMS.chassis.sill_y, DIMS.steps.rear_z, DIMS.wheels.hub_x, DIMS.steps.top_y, DIMS.steps.front_z, "trim")]
