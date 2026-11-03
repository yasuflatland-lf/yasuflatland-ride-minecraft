"""SUV windshield, pillars, roof and sealed windows."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box
windshield_part = shell.windshield_part
leaning_top = shell.leaning_top
suv_cubes = load_tool("suv_cubes")
both_sides = suv_cubes.both_sides
REARVIEW_STAY_LENGTH = 2.5 / 3


def windshield_frame_cubes():
    return [
        windshield_part(-DIMS.chassis.cabin_half_width, DIMS.hood.top_y, DIMS.windshield.foot_z, DIMS.chassis.cabin_half_width, DIMS.hood.top_y + DIMS.windshield.rail_height, DIMS.hood.rear_z, "trim"),
    ]


def a_pillar_cubes():
    return [windshield_part(DIMS.chassis.cabin_half_width, DIMS.hood.top_y, DIMS.hood.rear_z - 1, DIMS.chassis.body_half_width, leaning_top(DIMS.greenhouse.roof_top), DIMS.hood.rear_z, "body")]


def b_pillar_cubes():
    # B-pillars run down to the floor so they close the gap between the front and rear doors.
    return [box(DIMS.chassis.cabin_half_width, DIMS.chassis.floor_y, DIMS.cabin.b_pillar_rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y, DIMS.cabin.b_pillar_front_z, "body")]


def rearview_mirror_cubes():
    return [
        # Rearview mirror (center of the windshield's top edge, behind the leaning glass)
        box(-0.5, DIMS.greenhouse.roof_y - REARVIEW_STAY_LENGTH, DIMS.windshield.roof_front - 0.8, 0.5, DIMS.greenhouse.roof_y, DIMS.windshield.roof_front - 0.3, "trim"),
        box(-2.5, DIMS.greenhouse.roof_y - REARVIEW_STAY_LENGTH - 1.5, DIMS.windshield.roof_front - 1.3, 2.5, DIMS.greenhouse.roof_y - REARVIEW_STAY_LENGTH, DIMS.windshield.roof_front - 0.8, "rim"),
    ]


def roof_cubes():
    return [
        # Black hardtop roof
        box(-DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y, DIMS.chassis.rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_top, DIMS.windshield.roof_front, "hardtop"),
    ]


def roof_edge_cubes():
    # The hardtop's thick side edge stands a little proud of the doors and drops over their frames' top rails
    return [box(DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y - 0.4, DIMS.chassis.rear_z, 13.4, DIMS.greenhouse.roof_top + 0.2, DIMS.windshield.roof_front, "hardtop")]


def roof_rib_cubes():
    # Ribs on the hardtop: two front panels split down the middle over the front seats, a seam across,
    # and long ribs running back over the rear panel
    return [
        box(-0.15, DIMS.greenhouse.roof_top, DIMS.cabin.roof_seam_z, 0.15, DIMS.greenhouse.roof_top + 0.05, DIMS.windshield.roof_front - 0.5, "grille"),
        box(-DIMS.chassis.body_half_width, DIMS.greenhouse.roof_top, DIMS.cabin.roof_seam_z - 0.15, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_top + 0.05, DIMS.cabin.roof_seam_z + 0.15, "grille"),
        *both_sides([box(x - 0.4, DIMS.greenhouse.roof_top, DIMS.cabin.roof_seam_z + 1.5, x + 0.4, DIMS.greenhouse.roof_top + 0.3, DIMS.windshield.roof_front - 1.5, "hardtop_rib")
                     for x in (3, 6.5, 10)]),
        *[box(x - 0.4, DIMS.greenhouse.roof_top, DIMS.chassis.rear_z + 2, x + 0.4, DIMS.greenhouse.roof_top + 0.3, DIMS.cabin.roof_seam_z - 1.5, "hardtop_rib")
          for x in (-10.5, -7, -3.5, 0, 3.5, 7, 10.5)],
    ]


# The side windows and the windshield are open frames. Under water (ADR 0040) plates fill them, flush
# with the outside of the frames, in the same blue as the rear glass. The front side window is a
# trapezoid, so 1 px strips step down along the leaning front post. Each strip reaches from its lower
# end a little into the post, which the post hides, and sits 0.05 px inside the frame's outer face so
# the overlap does not fight the post for the same plane.
def front_post_back(y):
    """z of the rear face of the front door's leaning post at height y, which starts 1.5 px behind the pivot."""
    y0, z0 = DIMS.windshield.pivot[1] - 1.5 * DIMS.windshield.lean_sin, DIMS.windshield.pivot[2] - 1.5 * DIMS.windshield.lean_cos
    return z0 - (y - y0) * DIMS.windshield.lean_tan


def front_side_panes():
    # Split at the cowl height as well as each pixel: every strip end stays hidden in either
    # the upright foot or the raked post, even when the belt and roof are fractional pixels.
    panes = []
    y = DIMS.greenhouse.window_bottom_y
    while y < DIMS.greenhouse.window_top_y - 1e-6:
        if y < DIMS.hood.top_y:
            top = min(y + 1, DIMS.hood.top_y)
            front = DIMS.cabin.front_door_hinge_z - 1
        else:
            top = min(y + 1, DIMS.greenhouse.window_top_y)
            front = front_post_back(y) + 0.2
        panes.append(box(12.85, y, -4, 12.95, top, front, "rear_glass"))
        y = top
    return panes


def windows_sealed():
    return [
        windshield_part(-DIMS.chassis.cabin_half_width, DIMS.hood.top_y + DIMS.windshield.rail_height, DIMS.hood.rear_z - 0.1, DIMS.chassis.cabin_half_width, leaning_top(DIMS.greenhouse.roof_y), DIMS.hood.rear_z, "rear_glass"),
        *both_sides([
            *front_side_panes(),
            box(12.9, DIMS.greenhouse.window_bottom_y, DIMS.chassis.cargo_front_z + 1, DIMS.chassis.body_half_width, DIMS.greenhouse.window_top_y, -7, "rear_glass"),
        ]),
    ]


def rear_glass_cubes():
    return [box(-DIMS.chassis.cabin_half_width, DIMS.greenhouse.window_bottom_y, DIMS.chassis.rear_z, DIMS.chassis.cabin_half_width, DIMS.greenhouse.window_top_y, DIMS.chassis.rear_z + 1, "rear_glass")]
