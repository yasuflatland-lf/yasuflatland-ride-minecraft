"""Build the ground tent's fly shell, arch poles, and hanging fixtures."""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel


def arch(d: Dims, face, z0, z1, thickness, color, outward=True):
    """Chord segments follow the half ellipse; the shell grows outward, poles inward."""
    result = []
    for i in range(d.arch_segments):
        a, b = math.pi * i / d.arch_segments, math.pi * (i + 1) / d.arch_segments
        x0, y0 = d.half_width * math.cos(a), d.wall_height + d.arch_rise * math.sin(a)
        x1, y1 = d.half_width * math.cos(b), d.wall_height + d.arch_rise * math.sin(b)
        dx, dy = x0 - x1, y0 - y1
        length = math.hypot(dx, dy)
        angle = -math.degrees(math.atan2(dy, dx))
        low, high = (0, thickness) if outward else (-thickness, 0)
        result.append(panel(x1, y1 + low, z0, x1 + length, y1 + high, z1,
                            face(color), pivot=(x1, y1, z0), rotation=(0, 0, angle)))
    return result


def end_panel(d: Dims, face, z0, z1, door):
    result = []
    if door:
        result += [panel(-d.half_width, 0, z0, -d.door_half_width, d.wall_height, z1, face("fly")),
                   panel(d.door_half_width, 0, z0, d.half_width, d.wall_height, z1, face("fly"))]
    else:
        result.append(panel(-d.half_width, 0, z0, d.half_width, d.wall_height, z1, face("fly")))
    # Each 1 px strip reaches the arch's inner surface at its inner edge, so no slit stays open
    # under the shell; its outer corner still ends inside the 1 px shell. Over the door the
    # strips start above the binding, which would otherwise share their faces.
    for x in range(-d.half_width, d.half_width, d.strip_width):
        top = d.wall_height + d.arch_rise * math.sqrt(
            1 - (min(abs(x), abs(x + d.strip_width)) / d.half_width) ** 2)
        bottom = d.wall_height + (d.binding_height if door and -d.door_half_width <= x < d.door_half_width else 0)
        result.append(panel(x, bottom, z0, x + d.strip_width, top, z1, face("fly")))
    return result


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    fly = arch(d, face, d.front_z, d.rear_z, d.shell_thickness, "fly")
    for x0, x1 in ((d.half_width, d.half_width + d.shell_thickness),
                   (-d.half_width - d.shell_thickness, -d.half_width)):
        fly += [panel(x0, 0, d.front_z, x1, d.wall_height, d.side_gap_front_z, face("fly")),
                panel(x0, 0, d.side_gap_rear_z, x1, d.wall_height, d.rear_z, face("fly"))]
    fly += end_panel(d, face, d.rear_z - d.shell_thickness, d.rear_z, False)
    poles = []
    for z0 in d.arch_pole_z:
        z1 = z0 + d.pole_thickness
        poles += arch(d, face, z0, z1, d.pole_thickness, "pole", outward=False)
        poles += [panel(d.half_width - d.pole_thickness, 0, z0, d.half_width, d.wall_height, z1, face("pole")),
                  panel(-d.half_width, 0, z0, -d.half_width + d.pole_thickness, d.wall_height, z1, face("pole"))]
    strap = [panel(*d.strap_bounds, face("strap"))]
    for z in range(d.ring_first_z, d.ring_stop_z, d.ring_spacing):
        # Four strips leave the center of each 2 px silver ring open.
        # The side strips stand 0.05 px outside the strap so their faces do not share its plane.
        strap += [panel(-d.ring_outer_x, d.ring_bottom_y, z-d.ring_half_depth,
                        -d.ring_inner_half_width, d.ring_top_y, z+d.ring_half_depth, face("ring")),
                  panel(d.ring_inner_half_width, d.ring_bottom_y, z-d.ring_half_depth,
                        d.ring_outer_x, d.ring_top_y, z+d.ring_half_depth, face("ring")),
                  panel(-d.ring_inner_half_width, d.ring_bottom_y, z-d.ring_half_depth,
                        d.ring_inner_half_width, d.ring_top_y, z-d.ring_inner_half_width, face("ring")),
                  panel(-d.ring_inner_half_width, d.ring_bottom_y, z+d.ring_inner_half_width,
                        d.ring_inner_half_width, d.ring_top_y, z+d.ring_half_depth, face("ring"))]
    lantern = [panel(*d.lantern_hook_bounds, face("hook")),
               panel(*d.lantern_cap_bounds, face("hook"))]
    # Stepped circular cross-section gives the milky shade a round silhouette.
    glass = []
    for x in range(-d.glass_radius, d.glass_radius, d.strip_width):
        radius = math.sqrt(d.glass_radius ** 2 - max(abs(x), abs(x+d.strip_width)) ** 2)
        if radius:
            glass.append(panel(x, d.glass_bottom_y, d.glass_pivot[2]-radius,
                               x+d.strip_width, d.glass_top_y, d.glass_pivot[2]+radius, face("glass")))
    bones = {
        "fly": {"parent": "root", "pivot": [0, 0, 0], "cubes": fly},
        "poles": {"parent": "root", "pivot": [0, 0, 0], "cubes": poles},
        "strap": {"parent": "root", "pivot": [0, 0, 0], "cubes": strap},
        "lantern": {"parent": "root", "pivot": list(d.lantern_pivot), "cubes": lantern},
        "lantern_glass": {"parent": "lantern", "pivot": list(d.glass_pivot), "cubes": glass},
    }
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
