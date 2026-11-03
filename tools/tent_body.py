"""Build the ground tent's trapezoid panels, seam frames, and hanging fixtures."""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel


def half_width(d: Dims, y):
    if y <= d.eave_height:
        return d.half_width - d.eave_lean * y / d.eave_height
    return d.half_width - d.eave_lean - (d.lean-d.eave_lean) * (y-d.eave_height) / (d.ridge_height-d.eave_height)


def ends(d: Dims, y):
    inset = d.lean * y / d.ridge_height
    return d.front_z + inset, d.rear_z - inset


def side_band(d: Dims, face, side, y0, y1, z0, z1, color="fly", proud=0):
    x0, x1 = half_width(d, y0), half_width(d, y1)
    angle = -side * math.degrees(math.atan2(x0-x1, y1-y0))
    thickness = d.shell_thickness
    # Inward thickness lowers a rotated corner; lift the first band off the ground.
    lift = max(0, thickness * abs(math.sin(math.radians(angle))) - y0)
    pivot = (side*x0, y0+lift, z0)
    lo, hi = (-thickness+proud, proud) if side > 0 else (-proud, thickness-proud)
    return panel(pivot[0]+lo, pivot[1], z0, pivot[0]+hi,
                 pivot[1]+math.hypot(x0-x1, y1-y0), z1, face(color),
                 pivot=pivot, rotation=(0, 0, angle))


def end_band(d: Dims, face, front, y0, y1, x0, x1, color="fly", proud=0):
    z = ends(d, y0)[0 if front else 1]
    angle = (-1 if front else 1) * math.degrees(math.atan2(d.lean, d.ridge_height))
    thickness = d.shell_thickness
    # Trim only ground and door-head bands; trimming every band leaves slits between them.
    lift = thickness * abs(math.sin(math.radians(angle)))
    bottom = lift / math.cos(math.radians(angle)) if y0 == 0 or (front and y0 == d.door_height) else 0
    pivot = (x0, y0, z)
    lo, hi = (-proud, thickness-proud) if front else (-thickness+proud, proud)
    return panel(x0, y0+bottom, z+lo, x1,
                 y0+(y1-y0)/math.cos(math.radians(angle)), z+hi, face(color),
                 pivot=pivot, rotation=(angle, 0, 0))


def shell(d: Dims, face):
    fly = []
    for y0 in range(0, d.ridge_height, d.band_height):
        y1 = min(y0+d.band_height, d.ridge_height)
        z0, z1 = ends(d, y0)
        for side in (-1, 1):
            fly.append(side_band(d, face, side, y0, y1, z0, z1))
        w = half_width(d, y0)
        fly.append(end_band(d, face, False, y0, y1, -w, w))
        # Split the band at the door head so no front material enters the opening.
        if y0 < d.door_height:
            for x0, x1 in ((-w, -d.door_half_width), (d.door_half_width, w)):
                fly.append(end_band(d, face, True, y0, min(y1, d.door_height), x0, x1))
        if y1 > d.door_height:
            fly.append(end_band(d, face, True, max(y0, d.door_height), y1, -w, w))
    w = half_width(d, d.ridge_height)
    z0, z1 = ends(d, d.ridge_height)
    fly.append(panel(-w, d.ridge_height-d.shell_thickness, z0,
                     w, d.ridge_height, z1, face("fly")))
    return fly


def seams(d: Dims, face):
    result = []
    # Frames follow the stepped face edges; a small normal offset avoids z-fighting.
    for y0 in range(0, d.ridge_height, d.band_height):
        y1 = min(y0+d.band_height, d.ridge_height-d.seam_proud)
        z0, z1 = ends(d, y0)
        for side in (-1, 1):
            for start in (z0, z1-d.seam_width):
                result.append(side_band(d, face, side, max(y0, d.shell_thickness), y1, start, start+d.seam_width,
                                        "seam", d.seam_proud))
    for y in (d.eave_height, d.ridge_height):
        z0, z1 = ends(d, y)
        for side in (-1, 1):
            result.append(side_band(d, face, side, y-d.seam_width, y-d.seam_proud,
                                    z0, z1, "seam", d.seam_proud))
    w = half_width(d, d.ridge_height)
    z0, z1 = ends(d, d.ridge_height)
    for start in (z0, z1-d.seam_width):
        result.append(panel(-w, d.ridge_height, start, w, d.ridge_height+d.seam_proud,
                            start+d.seam_width, face("seam")))
    return result


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    fly = shell(d, face) + seams(d, face)
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
        "strap": {"parent": "root", "pivot": [0, 0, 0], "cubes": strap},
        "lantern": {"parent": "root", "pivot": list(d.lantern_pivot), "cubes": lantern},
        "lantern_glass": {"parent": "lantern", "pivot": list(d.glass_pivot), "cubes": glass},
    }
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
