"""SUV rock rails and chassis mounting brackets."""

import math

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box


def side_step_cubes():
    steps = DIMS.steps
    bars = 4
    half_width = steps.radius * math.sin(math.pi / (2 * bars))
    cubes = []
    for k in range(bars):
        cube = box(steps.center_x - steps.radius, steps.center_y - half_width, steps.rear_z,
                   steps.outer_x, steps.center_y + half_width, steps.front_z, "arm")
        cube["pivot"] = [steps.center_x, steps.center_y, 0]
        cube["rotation"] = [0, 0, round(k * 180 / bars, 3)]
        cubes.append(cube)

    bracket_span = steps.front_z - steps.rear_z - 2 * steps.bracket_end_margin
    for k in range(steps.bracket_count):
        z = steps.rear_z + steps.bracket_end_margin + k * bracket_span / (steps.bracket_count - 1)
        cubes.append(box(DIMS.chassis.body_half_width - steps.bracket_inset,
                         steps.center_y - steps.bracket_height / 2, z - steps.bracket_width / 2,
                         steps.center_x, steps.center_y + steps.bracket_height / 2,
                         z + steps.bracket_width / 2, "trim"))
    return cubes
