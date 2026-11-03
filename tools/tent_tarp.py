"""Join the body ridge to two front poles and an inverted triangular -x screen.

Keep contributions in fly and poles; a new tarp bone would change the model contract.
"""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel
body = load_tool("tent_body")


def fabric(cube, face, inner_side):
    # The underside stays lighter even when a dye recolors the body fly.
    cube["uv"] = {side: face("tarp_under" if side == inner_side else "tarp_top")
                  for side in cube["uv"]}
    return cube


def roof(d: Dims, face):
    rear = body.ends(d, d.ridge_height)[0]
    depth = rear-d.tarp_front_z
    slope = (d.ridge_height-d.tarp_front_height)/depth
    angle = math.atan(slope)
    sine, cosine = math.sin(angle), math.cos(angle)

    def band(z0, z1, x0, x1, seam=False):
        y = d.tarp_front_height+slope*(z0-d.tarp_front_z)
        proud = min(d.seam_proud, (d.ridge_height-y)/4) if seam else 0
        length = (z1-z0)/cosine+d.band_overlap
        # The raised binding must terminate below the shared ridge ceiling too.
        length = min(length, (d.ridge_height-y-proud*cosine)/sine)
        start = proud*math.tan(angle) if z0 == d.tarp_front_z else 0
        cube = panel(x0, y-d.shell_thickness+proud, z0+start, x1, y+proud, z0+length,
                     face("seam" if seam else "tarp_top"),
                     pivot=(x0, y, z0), rotation=(math.degrees(angle), 0, 0))
        return cube if seam else fabric(cube, face, "down")

    result = []
    for offset in range(math.ceil(depth)):
        z0, z1 = d.tarp_front_z+offset, min(d.tarp_front_z+offset+1, rear)
        w = d.half_width-d.lean_width*(depth if z1 == rear else offset)/depth
        result.append(band(z0, z1, -w, w))
        for x0, x1 in ((-w, -w+d.seam_width), (w-d.seam_width, w)):
            result.append(band(z0, z1, x0, x1, True))
    result.append(band(d.tarp_front_z, d.tarp_front_z+d.seam_width,
                       -d.half_width, d.half_width, True))
    return result


def screen_plane(d: Dims):
    front_run = d.front_z-d.tarp_front_z
    c = d.lean_width/(d.ridge_height*front_run/d.tarp_front_height+d.lean_depth)
    b = c*front_run/d.tarp_front_height
    return b, c


def screen_limits(d: Dims, z):
    rear = body.ends(d, d.ridge_height)[0]
    top = d.tarp_front_height+(d.ridge_height-d.tarp_front_height)*(z-d.tarp_front_z)/(rear-d.tarp_front_z)
    if z <= d.front_z:
        bottom = d.tarp_front_height*(d.front_z-z)/(d.front_z-d.tarp_front_z)
    else:
        bottom = d.ridge_height*(z-d.front_z)/d.lean_depth
    return bottom, top


def screen(d: Dims, face):
    b, c = screen_plane(d)
    angle = math.atan(b)
    sine, cosine = math.sin(angle), math.cos(angle)
    rear = body.ends(d, d.ridge_height)[0]

    def piece(z0, z1, y0, y1, seam=False):
        center_z = (z0+z1)/2
        x = -d.half_width+b*y0+c*(center_z-d.front_z)
        # Inset fabric at the boundary so its binding can stand proud without x < -56.
        x = max(x, -d.half_width)+(0 if seam else d.seam_proud)
        proud = min(d.seam_proud, (x+d.half_width)/cosine) if seam else 0
        lift = max(0, (d.shell_thickness-proud)*sine-y0)
        y = y0+lift
        x += b*lift
        length = min((y1-y0)/cosine+d.band_overlap,
                     (d.ridge_height-y-proud*sine)/cosine)
        cube = panel(x-proud, y, z0, x+d.shell_thickness-proud, y+length, z1,
                     face("seam" if seam else "tarp_top"),
                     pivot=(x, y, z0), rotation=(0, 0, math.degrees(angle)))
        return cube if seam else fabric(cube, face, "east")

    result = []
    for offset in range(0, math.ceil(rear-d.tarp_front_z), d.tarp_column_depth):
        z0 = d.tarp_front_z+offset
        z1 = min(z0+d.tarp_column_depth+d.band_overlap, rear)
        # Center sampling limits edge steps to half a column; the apex still touches ground.
        bottom, top = screen_limits(d, (z0+z1)/2)
        if z0 <= d.front_z <= z1:
            bottom = 0
        # Coplanar y bands can merge, except across clearance heights: their large
        # bounding boxes would otherwise falsely intersect the open room or doorway.
        cuts = [bottom]
        for height in (32, d.door_height):
            if height == 32 and z0 >= d.front_z-2:
                continue
            if height == d.door_height and not (z0 < d.front_z+8 and z1 > d.front_z-2):
                continue
            boundary = height+d.shell_thickness*sine
            if bottom < boundary < top:
                cuts.append(boundary)
        cuts.append(top)
        for start, stop in zip(cuts, cuts[1:]):
            result.append(piece(z0, z1, start, stop))
        result.append(piece(z0, z1, max(bottom, top-d.seam_width), top, True))
        if z0 < d.front_z:
            result.append(piece(z0, z1, bottom, min(top, bottom+d.seam_width), True))
    return result


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    fly = roof(d, face) + screen(d, face)
    w, pole, z = d.half_width, d.pole_thickness, d.tarp_front_z
    poles = [panel(w-pole, 0, z, w, d.tarp_front_height, z+pole, face("pole_dark")),
             panel(-w, 0, z, -w+pole, d.tarp_front_height, z+pole, face("pole_dark"))]
    bones = {
        "fly": {"parent": "root", "pivot": [0, 0, 0], "cubes": fly},
        "poles": {"parent": "root", "pivot": [0, 0, 0], "cubes": poles},
    }
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
