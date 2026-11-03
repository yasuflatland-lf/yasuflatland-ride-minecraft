"""Build the tarp roof, bindings, and poles.

Keep contributions in fly and poles; a new tarp bone would change the model contract.
"""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    # x rotation slopes the tarp's top from (y60,z-135) to (y40,z-184).
    length = math.hypot(d.tarp_run, d.tarp_rise)
    fly = [panel(-d.tarp_half_width, d.tarp_top_y-d.shell_thickness, d.front_z-length,
                 d.tarp_half_width, d.tarp_top_y, d.front_z, face("fly"),
                 pivot=(0, d.tarp_top_y, d.front_z),
                 rotation=(math.degrees(math.atan2(d.tarp_rise, d.tarp_run)), 0, 0))]
    # Bindings remain in the fly's two paint slots. The side ones stand 0.1 px proud of the
    # lowest arch segments so their outer faces do not share a plane.
    outer_x = d.half_width + d.shell_thickness + d.binding_proud
    top = d.wall_height + d.binding_height
    fly += [panel(-d.door_half_width, d.wall_height, d.front_z,
                  d.door_half_width, top, d.front_z+d.shell_thickness, face("fly_dark")),
            panel(d.half_width, d.wall_height, d.side_gap_front_z,
                  outer_x, top, d.side_gap_rear_z, face("fly_dark")),
            panel(-outer_x, d.wall_height, d.side_gap_front_z,
                  -d.half_width, top, d.side_gap_rear_z, face("fly_dark"))]
    z = d.front_z - d.tarp_run
    height = d.tarp_top_y - d.tarp_rise
    x, t = d.tarp_pole_inner_x, d.pole_thickness
    poles = [panel(x, 0, z, x+t, height, z+t, face("pole_dark")),
             panel(-x-t, 0, z, -x, height, z+t, face("pole_dark"))]
    bones = {
        "fly": {"parent": "root", "pivot": [0, 0, 0], "cubes": fly},
        "poles": {"parent": "root", "pivot": [0, 0, 0], "cubes": poles},
    }
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
