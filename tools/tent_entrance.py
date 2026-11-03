"""Build the front end panel and the three outer flaps."""
from typing import Callable

from tool_loader import load_tool

dims = load_tool("tent_dims")
Dims, Part = dims.Dims, dims.Part
panel = load_tool("panels").panel
end_panel = load_tool("tent_body").end_panel


def flaps(d: Dims):
    w, h, t = d.door_half_width, d.wall_height, d.shell_thickness
    x = d.half_width + t
    z0, z1 = d.side_gap_front_z, d.side_gap_rear_z
    return {
        "flap_front": ((-w, 0, d.front_z-t, w, h, d.front_z),
                       (0, h, d.front_z-t/2), "fly", "fly"),
        "flap_left": ((x, 0, z0, x+t, h, z1), (x+t/2, h, (z0+z1)/2), "fly", "fly"),
        "flap_right": ((-x-t, 0, z0, -x, h, z1), (-x-t/2, h, (z0+z1)/2), "fly", "fly"),
    }


FLAPS = flaps(dims.DIMS)


def build(d: Dims, face: Callable[[str], dict]) -> Part:
    bones = {"fly": {"parent": "root", "pivot": [0, 0, 0], "cubes":
                     end_panel(d, face, d.front_z, d.front_z + d.shell_thickness, True)}}
    for name, (bounds, pivot, parent, color) in flaps(d).items():
        bones[name] = {"parent": parent, "pivot": list(pivot), "cubes": [panel(*bounds, face(color))]}
    return {"cubes": [cube for bone in bones.values() for cube in bone["cubes"]], "bones": bones}
