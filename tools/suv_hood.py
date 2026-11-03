"""SUV hood, dome, cowl and hood details."""

import math

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
panels = load_tool("panels")
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


def painted_panel(extents, pivot, rotation):
    # shell.box preserves the per-face flake UVs on rotated sheet metal.
    uv = box(*extents, "body")["uv"]
    cube = panels.panel(*extents, uv["up"], pivot, rotation)
    cube["uv"] = uv
    return cube


def hood_dome_and_cowl_cubes():
    h = DIMS.hood
    side_length = math.hypot(h.dome_side_run, h.dome_height)
    side_angle = math.degrees(math.atan2(h.dome_height, h.dome_side_run))
    side = painted_panel(
        (h.dome_half_width, h.dome_top_y - h.panel_thickness, h.dome_rear_z,
         h.dome_half_width + side_length, h.dome_top_y, h.dome_front_z),
        (h.dome_half_width, h.dome_top_y, h.dome_rear_z), (0, 0, side_angle))
    cowl_top = h.top_y + 0.3
    slat_count, slat_pitch, slat_width = 9, 0.75, 0.3
    return [
        box(-h.dome_half_width, h.top_y, h.dome_rear_z,
            h.dome_half_width, h.dome_top_y, h.dome_front_z, "body"),
        *suv_cubes.both_sides([side]),
        box(-DIMS.chassis.body_half_width, h.top_y, h.rear_z,
            DIMS.chassis.body_half_width, cowl_top, h.rear_z + 1.6, "trim"),
        *[box((i - (slat_count - 1) / 2) * slat_pitch - slat_width / 2,
              cowl_top, h.rear_z + 0.4,
              (i - (slat_count - 1) / 2) * slat_pitch + slat_width / 2,
              cowl_top + 0.1, h.rear_z + 1.3, "resin")
          for i in range(slat_count)],
    ]


def hood_scoop_cubes():
    h = DIMS.hood
    top_length = math.hypot(h.scoop_length, h.scoop_height)
    top_angle = math.degrees(math.atan2(h.scoop_height, h.scoop_length))
    top = painted_panel(
        (-h.scoop_half_width, h.dome_top_y, h.scoop_rear_z,
         h.scoop_half_width, h.dome_top_y + h.panel_thickness,
         h.scoop_rear_z + top_length),
        (0, h.dome_top_y, h.scoop_rear_z), (top_angle, 0, 0))
    # Each cheek turns with the top about the same rear pivot, so its upper edge runs under the top.
    # It reaches far enough below the top that its front lower corner lands on the dome; the rear
    # part that dips below the dome surface stays hidden inside the dome.
    depth = h.scoop_height / math.cos(math.radians(top_angle))
    cheek = painted_panel(
        (h.scoop_half_width - h.panel_thickness, h.dome_top_y - depth, h.scoop_rear_z,
         h.scoop_half_width, h.dome_top_y, h.scoop_rear_z + top_length),
        (0, h.dome_top_y, h.scoop_rear_z), (top_angle, 0, 0))
    opening_depth, recess = 0.08, 0.3
    opening_z = h.scoop_front_z - recess
    # Body-coloured dividers in front of the recessed dark face split it into the reference's
    # intake slots.
    divider_half_width = 0.15
    slot_width = 2 * h.scoop_half_width / h.scoop_slots
    dividers = [box(x - divider_half_width, h.dome_top_y, opening_z,
                    x + divider_half_width, h.dome_top_y + h.scoop_height, h.scoop_front_z, "body")
                for x in (-h.scoop_half_width + k * slot_width for k in range(1, h.scoop_slots))]
    return [
        top,
        *suv_cubes.both_sides([cheek]),
        box(-h.scoop_half_width, h.dome_top_y, opening_z - opening_depth,
            h.scoop_half_width, h.dome_top_y + h.scoop_height, opening_z, "resin"),
        *dividers,
    ]


def hood_detail_cubes():
    h = DIMS.hood
    side_x = DIMS.chassis.body_half_width
    latch_z = h.front_z - 1.8
    return [
        box(side_x - 0.1, h.top_y - 1.6, latch_z - 0.4,
            side_x + 0.25, h.top_y - 0.1, latch_z + 0.4, "resin"),
        box(side_x - 1.5, h.top_y, latch_z - 0.3,
            side_x - 0.2, h.top_y + 0.2, latch_z + 0.3, "resin"),
        turned(box(1, h.top_y + 0.3, h.rear_z + 0.6,
                   9.5, h.top_y + 0.6, h.rear_z + 0.9, "grille"),
               (1, h.top_y + 0.3, h.rear_z + 0.75), (0, -8, 0)),
    ]


def hood_lower_side_cubes():
    # The hood's lower sides, cut along the front arch, outside the liners. They reach back to the front
    # door's hinge: with the front arch moved forward, its flare no longer hides the gap under the cowl.
    return arch_cut(DIMS.arch.liner_x, DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.arch.top_y, DIMS.cabin.front_door_hinge_z, DIMS.hood.front_z, DIMS.wheels.front_axle_z, "body")


def cowl_side_cubes():
    return [box(DIMS.arch.liner_x, DIMS.arch.top_y, DIMS.cabin.front_door_hinge_z, DIMS.chassis.body_half_width, DIMS.hood.top_y, DIMS.hood.rear_z, "body")]
