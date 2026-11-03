"""Build a tan tarp roof and tapered inward screen with sparse seam bindings.

Keep contributions in fly and poles; a new tarp bone would change the model contract.
"""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel


def fabric(cube, face, inner_side):
    # The underside stays lighter even when a dye recolors the body fly.
    cube["uv"] = {side: face("tarp_under" if side == inner_side else "tarp_top")
                  for side in cube["uv"]}
    return cube


def screen(d: Dims, face):
    result = []
    rise, run = d.tarp_underside, d.half_width-d.tarp_foot_x
    angle = math.atan2(run, rise)
    sine, cosine = math.sin(angle), math.cos(angle)
    z0 = d.tarp_front_z
    depth = d.front_z-z0

    def band(y0, y1, start, stop, proud=0):
        # A proud outer corner would dip below ground; lift only the first seam band.
        lift = max(0, proud*sine-y0)
        x, y = d.tarp_foot_x+run*(y0+lift)/rise, y0+lift
        length = (y1-y)/cosine
        # Trim the uppermost proud corner to keep the roof's outer bound at x 56.
        if sine:
            length = min(length, (d.half_width-x-proud*cosine)/sine)
        cube = panel(x-d.shell_thickness+proud, y, start, x+proud, y+length, stop,
                     face("seam" if proud else "tarp_top"),
                     pivot=(x, y, start), rotation=(0, 0, math.degrees(angle)))
        return cube if proud else fabric(cube, face, "west")

    for y0 in range(0, rise, d.band_height):
        y1 = min(y0+d.band_height, rise)
        # Lower-edge sampling preserves the short ground foot; the last row meets the roof.
        rear = z0+d.tarp_foot_depth+(depth-d.tarp_foot_depth)*(y1 if y1 == rise else y0)/rise
        result.append(band(y0, y1, z0, rear))
        diagonal = z0+d.tarp_foot_depth/2+(depth-d.tarp_foot_depth/2)*y0/rise
        start = min(diagonal, rear-d.seam_width)
        for start in (start, rear-d.seam_width):
            result.append(band(y0, y1, start, start+d.seam_width, d.seam_proud))
    return result


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    w, y, t = d.half_width, d.tarp_underside, d.shell_thickness
    z0, z1 = d.tarp_front_z, d.front_z
    fly = [fabric(panel(-w, y, z0, w, y+t, z1, face("tarp_top")), face, "down")]
    fly.extend(screen(d, face))
    fly.append(panel(w-d.seam_width, y+t, z0, w, y+t+d.seam_proud, z1, face("seam")))
    pole = d.pole_thickness
    poles = [panel(d.tarp_foot_x-pole, 0, z0, d.tarp_foot_x, y, z0+pole, face("pole_dark")),
             panel(-w, 0, z0, -w+pole, y, z0+pole, face("pole_dark"))]
    bones = {
        "fly": {"parent": "root", "pivot": [0, 0, 0], "cubes": fly},
        "poles": {"parent": "root", "pivot": [0, 0, 0], "cubes": poles},
    }
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
