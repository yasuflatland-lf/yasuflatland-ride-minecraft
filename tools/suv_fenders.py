"""SUV fender flares and arch liners."""

import math

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box
suv_cubes = load_tool("suv_cubes")
turned = suv_cubes.turned


def fender_flare(z_center, front_leg_bottom, rear_leg_bottom):
    """A black trapezoid flare over a wheel on the +x side, like a Wrangler's: a flat top over the tire,
    a side sloping down and out at each end, and a leg under each slope that drops toward the bumper or
    the side step."""
    length = math.hypot(DIMS.arch.top_y - DIMS.arch.foot_y, DIMS.arch.foot_z - DIMS.arch.top_half) + 0.6  # closes the corner
    slope = round(math.degrees(math.atan(DIMS.arch.run_per_rise)), 3)
    x1 = DIMS.flare.x
    cubes = [box(DIMS.chassis.body_half_width, DIMS.arch.top_y, z_center - DIMS.arch.top_half - 0.8, x1, DIMS.arch.top_y + DIMS.flare.thickness,
                 z_center + DIMS.arch.top_half + 0.8, "trim")]
    # Each slope stands on its lower inner end and tips its top toward the wheel's center; a positive x
    # rotation here tips +y toward -z in game (see WINDSHIELD_LEAN).
    for side in (1, -1):
        z0 = z_center + side * DIMS.arch.foot_z
        z1 = z0 + side * DIMS.flare.thickness
        cubes.append(turned(box(DIMS.chassis.body_half_width, DIMS.arch.foot_y, min(z0, z1), x1, DIMS.arch.foot_y + length, max(z0, z1), "trim"),
                            (DIMS.chassis.body_half_width, DIMS.arch.foot_y, z0), (side * slope, 0, 0)))
    for side, leg_bottom in ((1, front_leg_bottom), (-1, rear_leg_bottom)):
        z0 = z_center + side * DIMS.arch.foot_z
        z1 = z0 + side * (DIMS.flare.thickness - 0.1)
        cubes.append(box(DIMS.chassis.body_half_width, leg_bottom, min(z0, z1), x1, DIMS.arch.foot_y + 0.5, max(z0, z1), "trim"))
    return cubes


def arch_liner_cubes():
    # Black inner liners behind each arch, so the cabin does not show through it. The front arch sits
    # close enough to the hood's front face that an unclipped liner would stick out ahead of the grille.
    return [
        box(DIMS.arch.liner_x, DIMS.arch.foot_y - 1, z - DIMS.arch.foot_z - 0.5, 11.6, DIMS.arch.top_y + 0.5, min(z + DIMS.arch.foot_z + 0.5, DIMS.hood.front_z), "grille")
        for z in (DIMS.wheels.front_axle_z, DIMS.wheels.rear_axle_z)
    ]
