"""Build the inner tent, bedroom flap, and mattresses."""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel
body = load_tool("tent_body")


def flaps(d: Dims):
    w, h, z, t = d.inner_door_half_width, d.wall_height, d.inner_front_z, d.inner_wall_thickness
    return {"flap_bedroom": ((-w, 0, z-t, w, h, z), (0, h, z-t/2), "inner", None)}


FLAPS = flaps(dims.DIMS)


def door_width(d: Dims, y):
    return d.inner_door_half_width - (d.inner_door_half_width-d.inner_door_top_half_width)*y/d.wall_height


def rear_window_edge(d: Dims, row):
    inset = max(0, d.rear_window_corner-min(row-d.rear_window_bottom, d.rear_window_top-row-1))
    return d.rear_window_half_width-inset


def rear_window(d: Dims, face):
    w, bottom, top = d.rear_window_half_width, d.rear_window_bottom, d.rear_window_top
    z, rim, corner = d.inner_rear_z-d.inner_wall_thickness, d.bedroom_rim_width, d.rear_window_corner
    cubes = []
    # Stepped chamfers round the zip window without changing the atlas or material.
    for y in range(bottom, top):
        edge = rear_window_edge(d, y)
        color = "mesh_frame" if y in (bottom, top-1) else "mesh"
        if color == "mesh_frame":
            cubes.append(panel(-edge, y, z-0.3, edge, y+1, z-0.1, face(color)))
        else:
            for x0, x1 in ((-edge, -edge+rim), (edge-rim, edge)):
                cubes.append(panel(x0, y, z-0.3, x1, y+1, z-0.1, face("mesh_frame")))
            if (y-bottom) % d.mesh_spacing == 0:
                cubes.append(panel(-edge+rim, y, z-0.3, edge-rim, y+d.mesh_width, z-0.1, face("mesh")))
    for x in range(-w+corner, w-corner+1, d.mesh_spacing):
        cubes.append(panel(x, bottom+1, z-0.3, x+d.mesh_width, top-1, z-0.1, face("mesh")))
    cubes.append(panel(-rim/2, bottom+1, z-0.4, rim/2, top-1, z-0.3, face("zip")))
    return cubes


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    w, h, t = d.inner_half_width, d.inner_height, d.inner_wall_thickness
    z0, z1 = d.inner_front_z, d.inner_rear_z
    top_width = w-d.inner_lean
    angle = math.degrees(math.atan2(d.inner_lean, h))
    length = math.hypot(d.inner_lean, h)
    inner = []
    for side in (-1, 1):
        x = side*w
        lo, hi = (-t, 0) if side > 0 else (0, t)
        # Lift the inner thickness off the floor, as for the outer shell's side bands.
        lift = t*math.sin(math.radians(angle))
        for y in range(0, h, d.band_height):
            top = min(y+d.band_height, h)
            rear = min(z1-t, body.ends(d, top)[1]-d.shell_thickness-d.seam_width)
            start = y/math.cos(math.radians(angle))
            stop = min(top/math.cos(math.radians(angle)), length-t*math.tan(math.radians(angle)))
            inner.append(panel(x+lo, lift+start, z0, x+hi, lift+stop, rear,
                               face("inner"), pivot=(x, lift, z0), rotation=(0, 0, -side*angle)))
    inner += [panel(-w, 0, z0, w, d.inner_floor_thickness, z1, face("inner_floor")),
              panel(-top_width, h, z0, top_width, h+d.inner_roof_thickness,
                    min(z1-t, body.ends(d, h+d.inner_roof_thickness)[1]-d.shell_thickness-d.seam_width), face("inner_shade"))]
    bedroom_flap = []
    for y in range(0, h, d.band_height):
        top = min(y+d.band_height, h)
        width = w-d.inner_lean*y/h
        # Short courses keep both end walls within the sloping side walls.
        if y < d.wall_height:
            door = door_width(d, y)
            for x0, x1 in ((-width, -door), (door, width)):
                inner.append(panel(x0, y, z0, x1, top, z0+t, face("inner")))
            rim = d.bedroom_rim_width
            bedroom_flap += [panel(-door+rim, y, z0-t, door-rim, top, z0, face("inner")),
                             panel(-door, y, z0-t, -door+rim, top, z0, face("inner_shade")),
                             panel(door-rim, y, z0-t, door, top, z0, face("inner_shade"))]
        else:
            inner.append(panel(-width, y, z0, width, top, z0+t, face("inner")))
        rear = min(z1, body.ends(d, top)[1]-d.shell_thickness-0.25)
        # The rear mesh pane needs an aperture too; keep the wall outside its stepped rim.
        if d.rear_window_bottom <= y and top <= d.rear_window_top:
            for row in range(y, top):
                edge = rear_window_edge(d, row)
                for x0, x1 in ((-width, -edge), (edge, width)):
                    inner.append(panel(x0, row, rear-t, x1, row+1, rear, face("inner")))
        else:
            inner.append(panel(-width, y, rear-t, width, top, rear, face("inner")))
    inner += rear_window(d, face)
    _, pivot, parent, _ = flaps(d)["flap_bedroom"]
    bones = {
        "inner": {"parent": "root", "pivot": [0, 0, 0], "cubes": inner},
        "flap_bedroom": {"parent": parent, "pivot": list(pivot), "cubes": bedroom_flap},
    }
    for i, x in enumerate(d.mattress_x):
        cubes = [panel(x-d.mattress_half_width, 0, d.mattress_front_z,
                       x+d.mattress_half_width, d.mattress_edge_height, d.mattress_rear_z, face("mattress_edge")),
                 panel(x-d.mattress_half_width, d.mattress_edge_height, d.mattress_front_z,
                       x+d.mattress_half_width, d.mattress_height, d.mattress_rear_z, face("mattress"))]
        bones[f"mattress_{i}"] = {"parent": "root", "pivot": [x, 0, (d.mattress_front_z+d.mattress_rear_z)/2],
                                 "cubes": cubes}
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
