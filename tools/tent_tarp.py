"""Build the tarp roof and poles.

Keep contributions in fly and poles; a new tarp bone would change the model contract.
"""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    w, y, t = d.half_width, d.tarp_underside, d.shell_thickness
    z0, z1 = d.tarp_front_z, d.front_z
    fly = [panel(-w, y, z0, w, y+t, z1, face("fly"))]
    angle = -math.degrees(math.atan2(w-d.tarp_top_x, y))
    # Inward thickness must not put a rotated bottom corner below the ground.
    lift = t * abs(math.sin(math.radians(angle)))
    length = (y-lift) / math.cos(math.radians(angle))
    def screen(start, stop, color, proud=0):
        # A shortened lower edge lets the seam stand proud without leaving the footprint.
        bottom = lift + (d.seam_width if proud else 0)
        return panel(w-t+proud, bottom, start, w+proud, lift+length, stop, face(color),
                     pivot=(w, lift, start), rotation=(0, 0, angle))
    fly.append(screen(z0, z1, "fly"))
    for start in (z0, z1-d.seam_width):
        fly.append(screen(start, start+d.seam_width, "seam", d.seam_proud))
        fly.append(panel(-w, y+t, start, w, y+t+d.seam_proud,
                         start+d.seam_width, face("seam")))
    for x0, x1 in ((-w, -w+d.seam_width), (w-d.seam_width, w),
                   (d.tarp_top_x-d.seam_width/2, d.tarp_top_x+d.seam_width/2)):
        fly.append(panel(x0, y+t, z0, x1, y+t+d.seam_proud, z1, face("seam")))
    pole = d.pole_thickness
    poles = [panel(w-pole, 0, z0, w, y, z0+pole, face("pole_dark")),
             panel(-w, 0, z0, -w+pole, y, z0+pole, face("pole_dark"))]
    bones = {
        "fly": {"parent": "root", "pivot": [0, 0, 0], "cubes": fly},
        "poles": {"parent": "root", "pivot": [0, 0, 0], "cubes": poles},
    }
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
