"""Keep the outer flap bones valid until the entrance panels are rebuilt."""
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel
body = load_tool("tent_body")


def flaps(d: Dims):
    w, h, t = d.door_half_width, d.door_height, d.shell_thickness
    x0, x1 = body.half_width(d, d.window_top)-t, body.half_width(d, d.window_bottom)+d.seam_proud
    z0, z1 = d.window_front_z, d.window_rear_z
    return {
        "flap_front": ((-w, 0, d.front_z-t, w, h, d.front_z),
                       (0, h, d.front_z-t/2), "fly", "fly"),
        "flap_left": ((x0, d.window_bottom-t, z0, x1, d.window_top+t, z1),
                       (d.window_pivot_x, d.window_top, (z0+z1)/2), "fly", "fly"),
        "flap_right": ((-x1, d.window_bottom-t, z0, -x0, d.window_top+t, z1),
                       (-d.window_pivot_x, d.window_top, (z0+z1)/2), "fly", "fly"),
    }


FLAPS = flaps(dims.DIMS)


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    bones = {}
    for name, (bounds, pivot, parent, color) in flaps(d).items():
        if name == "flap_front":
            cubes = [panel(*bounds, face(color))]
        else:
            side = 1 if name == "flap_left" else -1
            cubes = [body.side_band(d, face, side, d.window_bottom, d.window_top,
                                    d.window_front_z, d.window_rear_z, color, d.seam_proud)]
        bones[name] = {"parent": parent, "pivot": list(pivot), "cubes": cubes}
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
