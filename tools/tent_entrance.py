"""Build the mesh entrance, rolling outer flaps, and interior roof details."""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel
body = load_tool("tent_body")


def flaps(d: Dims):
    w, h, t = d.door_half_width, d.door_height, d.shell_thickness
    angle = math.atan2(d.eave_lean, d.eave_height)
    proud = d.flap_proud
    x0 = body.half_width(d, d.window_top) + (proud-t)*math.cos(angle)
    x1 = body.half_width(d, d.window_bottom) + proud*math.cos(angle)
    y0 = d.window_bottom + (proud-t)*math.sin(angle)
    y1 = d.window_top + proud*math.sin(angle)
    pivot_x = body.half_width(d, d.window_top) + proud*math.cos(angle)
    z0, z1 = d.window_front_z, d.window_rear_z
    return {
        "flap_front": ((-w, 0, d.front_z, w, h, body.ends(d, h)[0]+t),
                       (0, h, body.ends(d, h)[0]), "fly", None),
        "flap_left": ((x0, y0, z0, x1, y1, z1),
                      (pivot_x, y1, (z0+z1)/2), "fly", "fly"),
        "flap_right": ((-x1, y0, z0, -x0, y1, z1),
                       (-pivot_x, y1, (z0+z1)/2), "fly", "fly"),
    }


FLAPS = flaps(dims.DIMS)


def front_door(d: Dims, face):
    w, h, rim = d.door_half_width, d.door_height, d.entrance_frame_width
    def band(x0, y0, x1, y1, color):
        return body.end_band(d, face, True, y0, y1, x0, x1, color)
    cubes = [band(-w, 0, -w+rim, h, "fly"), band(w-rim, 0, w, h, "fly"),
             band(-w+rim, 0, w-rim, rim, "fly"), band(-w+rim, h-rim, w-rim, h, "fly")]
    # The entity material ignores alpha; gaps between thin bars make the net see-through.
    for x in range(-w+d.mesh_spacing, w, d.mesh_spacing):
        if x:
            cubes.append(band(x, rim, x+d.mesh_width, h-rim, "mesh"))
    for y in range(d.mesh_spacing, h-rim, d.mesh_spacing):
        cubes.append(band(-w+rim, y, w-rim, y+d.mesh_width, "mesh"))
    cubes.append(band(-rim/2, rim, rim/2, h-rim, "zip"))
    return cubes


def entrance_frame(d: Dims, face):
    w, h, rim = d.door_half_width, d.door_height, d.entrance_frame_width
    bars = [body.end_band(d, face, True, 0, h+4, -w-rim, -w, "mesh_frame", d.seam_proud),
            body.end_band(d, face, True, 0, h+4, w, w+rim, "mesh_frame", d.seam_proud),
            body.end_band(d, face, True, h+0.3, h+rim, -w-rim, w+rim, "mesh_frame", d.seam_proud)]
    lean = -math.degrees(math.atan2(d.lean, d.ridge_height))
    # Keep the crossing extensions above the clear headroom, including rotated corners.
    for side in (-1, 1):
        x, y = side*(w+rim/2), h+3
        z = body.ends(d, y)[0]-d.seam_proud
        for diagonal in (-45, 45):
            bars.append(panel(x-0.3, y-2.5, z-0.3, x+0.3, y+2.5, z,
                              face("mesh_frame"), pivot=(x, y, z), rotation=(lean, 0, diagonal)))
    for y0, y1, proud, color in ((h+0.5, h+1.2, 1.2, "seam"),
                                (h+1.2, h+2.5, 1.6, "fly"),
                                (h+2.5, h+3.2, 1.2, "seam")):
        bars.append(body.end_band(d, face, True, y0, y1, -d.entrance_bundle_half_width,
                                  d.entrance_bundle_half_width, color, proud))
    return bars


def window(d: Dims, face, side):
    y0, y1, z0, z1 = d.window_bottom, d.window_top, d.window_front_z, d.window_rear_z
    rim = d.entrance_frame_width
    def band(bottom, top, front, rear, color):
        return body.side_band(d, face, side, bottom, top, front, rear, color, d.window_proud)
    cubes = [band(y0, y0+rim, z0, z1, "mesh_frame"),
             band(y1-rim, y1, z0, z1, "mesh_frame"),
             band(y0+rim, y1-rim, z0, z0+rim, "mesh_frame"),
             band(y0+rim, y1-rim, z1-rim, z1, "mesh_frame")]
    for y in range(y0+d.mesh_spacing, y1-rim, d.mesh_spacing):
        cubes.append(band(y, y+d.mesh_width, z0+rim, z1-rim, "mesh"))
    for z in range(z0+rim, z1-rim, d.mesh_spacing//2):
        cubes.append(band(y0+rim, y1-rim, z, z+d.mesh_width, "mesh"))
    return cubes


def roof_interior(d: Dims, face):
    cubes = []
    y0, y1 = d.eave_height+0.5, d.ridge_height-0.6
    z0, z1 = body.ends(d, y1)
    # Inset rectangles avoid the shell's tapered corners and leave the strap exposed.
    for side in (-1, 1):
        cubes.append(body.side_band(d, face, side, y0, y1, z0+1, z1-1, "fly_dark", -0.4))
    for front in (True, False):
        split = 44.5 if front else 36
        start = d.door_height+0.5 if front else y0
        if front:
            width = body.half_width(d, start)-1
            for x0, x1 in ((-width, -d.door_half_width), (d.door_half_width, width)):
                cubes.append(body.end_band(d, face, True, y0, start, x0, x1, "fly_dark", -0.4))
        for bottom, top in ((start, split), (split, y1)):
            width = body.half_width(d, top)-1
            cubes.append(body.end_band(d, face, front, bottom, top, -width, width, "fly_dark", -0.4))
    width = body.half_width(d, d.ridge_height)-1
    for x0, x1 in ((-width, -1.25), (1.25, width)):
        cubes.append(panel(x0, d.ridge_height-0.9, z0+1, x1, d.ridge_height-0.7, z1-1, face("fly_dark")))
    for y in (d.eave_height, d.ridge_height-0.8):
        z0, z1 = body.ends(d, y)
        for side in (-1, 1):
            cubes.append(body.side_band(d, face, side, y-0.5, y, z0+1, z1-1, "seam", -0.5))
        width = body.half_width(d, y)-1
        for front in (True, False):
            spans = ((-width, -d.door_half_width-1), (d.door_half_width+1, width)) if front and y < d.door_height else ((-width, width),)
            for x0, x1 in spans:
                cubes.append(body.end_band(d, face, front, y-0.5, y, x0, x1, "seam", -0.5))
    return cubes


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    fly = entrance_frame(d, face) + window(d, face, 1) + window(d, face, -1) + roof_interior(d, face)
    bones = {"fly": {"parent": "root", "pivot": [0, 0, 0], "cubes": fly}}
    for name, (_, pivot, parent, _) in flaps(d).items():
        if name == "flap_front":
            cubes = front_door(d, face)
        else:
            side = 1 if name == "flap_left" else -1
            cubes = [body.side_band(d, face, side, d.window_bottom, d.window_top,
                                    d.window_front_z, d.window_rear_z, "fly", d.flap_proud)]
        bones[name] = {"parent": parent, "pivot": list(pivot), "cubes": cubes}
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
