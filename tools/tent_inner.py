"""Build the inner tent, bedroom flap, and mattresses."""
import math
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel


def flaps(d: Dims):
    w, h, z, t = d.inner_door_half_width, d.wall_height, d.inner_front_z, d.inner_wall_thickness
    return {"flap_bedroom": ((-w, 0, z-t, w, h, z), (0, h, z-t/2), "inner", None)}


FLAPS = flaps(dims.DIMS)


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    w, h, t = d.inner_half_width, d.inner_height, d.inner_wall_thickness
    z0, z1, door = d.inner_front_z, d.inner_rear_z, d.inner_door_half_width
    inner = [
        panel(w-t, 0, z0, w, h, z1, face("inner")),
        panel(-w, 0, z0, -w+t, h, z1, face("inner")),
        panel(-w+t, 0, z1-t, w-t, h, z1, face("inner")),
        panel(-w, h, z0, w, h+d.inner_roof_thickness, z1, face("inner_shade")),
        panel(-w, 0, z0, -door, h, z0+t, face("inner")),
        panel(door, 0, z0, w, h, z0+t, face("inner")),
        panel(-door, d.wall_height, z0, door, h, z0+t, face("inner")),
    ]
    # The D-door has a straight edge at -x and a rounded edge at +x (the tent's left; the
    # right side seen from the front room). Its corner infill belongs to the fixed inner
    # panel, not to the rolling flap. The shaded rim takes over the row's last 0.5 px, so
    # the two paints never share a face.
    bedroom_flap = [panel(-door, 0, z0-t, 0, d.wall_height, z0, face("inner"))]
    half_height = d.wall_height / 2
    for y in range(0, d.wall_height, d.strip_width):
        edge = max(abs(y - half_height), abs(y + d.strip_width - half_height))
        width = door * math.sqrt(1 - (edge / half_height) ** 2)
        if width:
            rim = max(0, width - d.bedroom_rim_width)
            if rim:
                bedroom_flap.append(panel(0, y, z0-t, rim, y+d.strip_width, z0, face("inner")))
            bedroom_flap.append(panel(rim, y, z0-t, width, y+d.strip_width, z0, face("inner_shade")))
        if width < door:
            inner.append(panel(width, y, z0, door, y+d.strip_width, z0+t, face("inner")))
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
