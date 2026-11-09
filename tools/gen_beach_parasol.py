"""Generate the cantilever beach parasol assets (issue #1426).

Model pixels use -z toward the canopy; the origin is the base center at ground.
Cell offsets assume the origin is at a block center, with y at its top face.
"""
import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
tilt = load_tool("cube_tilt")
texture_io = load_tool("texture_io")
tent = load_tool("gen_tent")

CELL_PX = 16
BASE_OFFSET = 3.25
CANOPY_TOP = 4.1875
BASE_CELLS = tuple((x, 0, z) for x in (-1, 0, 1) for z in (-1, 0, 1) if (x, z) != (-1, -1))
POLE_FOOT_CELLS = ((0, 0, 0), (0, 1, 0), (0, 2, 0), (0, 2, 1), (0, 3, 0), (0, 3, 1), (0, 4, 0))
CANOPY_Z = -BASE_OFFSET * CELL_PX
CANOPY_RADIUS = 40
CANOPY_PEAK = 65
CANOPY_EDGE = 53
ARM_TOP = 72
PANEL_STEP = 0.25
FABRIC_THICKNESS = 0.16
FABRIC_UNDERSIDE_SHADE = 0.85
SWATCH = 16
ATLAS_WIDTH = 64
ATLAS_HEIGHT = 64
GEOMETRY = "models/entity/yasu_ride/beach_parasol.geo.json"
TEXTURE = "textures/entity/yasu_ride/beach_parasol.png"
PAINTS = dict(tent.FLY_PAINTS)
PAINTS["white"] = (235, 227, 212)
PALETTE = {
    "fabric_top": (*PAINTS["white"], 255),
    "fabric_under": tent.scale(PAINTS["white"], FABRIC_UNDERSIDE_SHADE) + (255,),
    "steel": (52, 65, 67, 255),
    "steel_edge": (153, 166, 162, 255),
    "wood": (177, 105, 53, 255),
    "wood_edge": (203, 134, 77, 255),
    "black": (24, 28, 28, 255),
    "granite": (166, 168, 168, 255),
    "granite_edge": (130, 133, 134, 255),
    "seam": (161, 146, 122, 255),
    "vent": (222, 213, 196, 255),
}
SLOTS = list(PALETTE)
FABRIC_SLOTS = frozenset((0, 1))


def face(slot):
    i = SLOTS.index(slot)
    return {"uv": [i % 4 * SWATCH, i // 4 * SWATCH], "uv_size": [SWATCH, SWATCH]}


def box(lo, hi, slot):
    return panels.panel(*lo, *hi, face(slot))


def beam(a, b, width, slot, depth=None):
    """A beam in the pole's yz plane, with exactly one cube rotation."""
    assert a[0] == b[0]
    length = math.dist(a, b)
    depth = width if depth is None else depth
    cube = box((a[0]-width/2, a[1], a[2]-depth/2),
               (a[0]+width/2, a[1]+length, a[2]+depth/2), slot)
    cube.update(pivot=list(a), rotation=[-math.degrees(math.atan2(b[2]-a[2], b[1]-a[1])), 0, 0])
    return cube


def bone(name, parent="root", cubes=(), yaw=0):
    result = {"name": name, "parent": parent, "pivot": [0, CANOPY_PEAK, CANOPY_Z], "cubes": list(cubes)}
    if yaw:
        result["rotation"] = [0, yaw, 0]
    return result


def canopy_panel(radius, peak, edge, center_z=CANOPY_Z):
    lean = math.atan2(peak-edge, radius)
    cubes = []
    for row in range(math.ceil(radius/PANEL_STEP)):
        near = row * PANEL_STEP
        far = min(radius, near+PANEL_STEP)
        half = (near+far)/2 * math.tan(math.pi/8)
        cube = panels.panel(-half, peak-FABRIC_THICKNESS, center_z-far/math.cos(lean),
                            half, peak, center_z-near/math.cos(lean), face("fabric_top"),
                            (0, peak, center_z), (math.degrees(lean), 0, 0))
        cube["uv"]["down"] = face("fabric_under")
        cubes.append(cube)
    return cubes


def geometry():
    base = [box((-2.2, 0, -12), (12, 0.6, -3), "steel"),
            box((-12, 0, -3), (12, 0.6, 12), "steel"),
            box((-12, 0.6, -3), (-11.4, 2, 12), "steel"),
            box((-12, 0.6, 11.4), (12, 2, 12), "steel"),
            box((-2.2, 0.6, -8), (2.2, 5, -3.6), "steel")]
    # Four individually edged slabs per layer keep both the cross joint and layer joint visible.
    for layer in range(2):
        for x in (-11, 0.2):
            for z in (-3, 4.4):
                y = 0.7 + layer*1.35
                base.extend([box((x, y, z), (x+10.8, y+1.25, z+7), "granite_edge"),
                             box((x+0.12, y+0.25, z+0.12), (x+10.68, y+1.27, z+6.88), "granite")])
    # Eight-sided knobs avoid square black screw heads at close viewing distances.
    knobs = []
    for k, (y, z) in enumerate(((3.7, -5.8), (10.5, -4.2))):
        knobs.append({"name": f"knob_{k}", "parent": "base", "pivot": [-2.6, y, z],
                      "rotation": [0, 0, -90], "cubes": panels.disc(0.65, y, y+0.55, face("black"), bars=4, center=(-2.6, z))})
        base.append(box((-2.7, y-0.1, z-0.18), (-1.6, y+0.2, z+0.18), "black"))
    post = [beam((0, 2, -5.8), (0, 8, -5.8), 2.5, "steel"),
            beam((0, 8, -5.8), (0, 14, -3.4), 2.5, "steel")]
    pole = [beam((0, 13, -3.8), (0, 59, 14.6), 2.1, "wood"),
            beam((-0.8, 13, -3.8), (-0.8, 59, 14.6), 0.24, "wood_edge"),
            beam((0, 39, 6.6), (0, 65.5, -6), 0.65, "wood"),
            box((-2.5, 28, 1.4), (-1, 30, 3.5), "black"),
            beam((-2.7, 28.6, 2.4), (-2.7, 25.8, 3.4), 0.45, "black"),
            box((-3.5, 25.5, 3.1), (-2.4, 26, 3.8), "black")]
    arm = [beam((0, 58, 14.2), (0, 63, 16.2), 2.6, "steel"),
           beam((0, 62, 16), (0, ARM_TOP-1, CANOPY_Z), 1.8, "steel", 2.6),
           beam((0, 63.25, 16), (0, ARM_TOP, CANOPY_Z), 2, "steel_edge", 0.15),
           beam((0, ARM_TOP, CANOPY_Z), (0, CANOPY_PEAK-1, CANOPY_Z), 1, "steel")]
    bones = [{"name": "root", "pivot": [0, 0, 0]}, bone("base", cubes=base),
             bone("post", cubes=post), bone("pole", cubes=pole), bone("arm", cubes=arm), bone("canopy"), *knobs]
    for k in range(8):
        bones.append(bone(f"panel_{k}", "canopy", canopy_panel(CANOPY_RADIUS, CANOPY_PEAK, CANOPY_EDGE), k*45))
    bones.append(bone("ribs", "canopy"))
    vertex = CANOPY_RADIUS/math.cos(math.pi/8)
    for k in range(8):
        rib = [beam((0, 64.5, CANOPY_Z), (0, 52.6, CANOPY_Z-vertex), 0.48, "wood"),
               beam((0, 48.7, CANOPY_Z), (0, 56, CANOPY_Z-vertex*0.72), 0.3, "wood_edge"),
               beam((0, 65.13, CANOPY_Z), (0, 53.13, CANOPY_Z-vertex), 0.15, "seam"),
               box((-0.4, 52.4, CANOPY_Z-vertex-0.4), (0.4, 53.2, CANOPY_Z-vertex+0.4), "steel")]
        bones.append(bone(f"rib_{k}", "ribs", rib, 22.5+k*45))
    for k in range(8):
        cap = canopy_panel(5, CANOPY_TOP*CELL_PX, 65.9)
        for cube in cap:
            cube["uv"] = {side: face("vent") for side in panels.CUBE_SIDES}
        bones.append(bone(f"vent_panel_{k}", "vent", cap, k*45))
    vent = []
    vent.extend(panels.panel_ring(3.4, 65, 65.7, face("black"), sides=8, thickness=0.3, center=(0, CANOPY_Z)))
    bones.append(bone("vent", "canopy", vent))
    hub = panels.disc(1.5, 48, 49.3, face("steel"), bars=8, center=(0, CANOPY_Z))
    hub.append(beam((0, 49, CANOPY_Z), (0, 64.8, CANOPY_Z), 0.7, "steel"))
    bones.append(bone("hub", "canopy", hub))
    return tent.rounded({"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.beach_parasol", "texture_width": ATLAS_WIDTH,
                        "texture_height": ATLAS_HEIGHT, "visible_bounds_width": 8,
                        "visible_bounds_height": 5, "visible_bounds_offset": [0, 2.5, -2.5]},
        "bones": bones}]})


def validate(bones):
    for part in bones:
        for cube in part.get("cubes", []):
            tilt.assert_axes([cube], {})
            for uv in cube["uv"].values():
                assert uv["uv_size"] == [SWATCH, SWATCH]
                u, v = uv["uv"]
                slot = u//SWATCH + 4*(v//SWATCH)
                if slot in FABRIC_SLOTS and not (part["name"].startswith("panel_") and part["parent"] == "canopy"):
                    raise ValueError(f"{part['name']} uses a fabric paint slot outside a canopy panel")


def texture_path(paint):
    return TEXTURE if paint == "white" else TEXTURE.replace(".png", f"_{paint}.png")


def pixel(paint, x, y):
    slot = y//SWATCH*4+x//SWATCH
    if slot >= len(SLOTS):
        return (0, 0, 0, 0)
    name = SLOTS[slot]
    if name.startswith("fabric_"):
        return tent.scale(PAINTS[paint], 1 if name == "fabric_top" else FABRIC_UNDERSIDE_SHADE) + (255,)
    color = PALETTE[name]
    # Deterministic mottling stays identical across paints, including every granite texel.
    if name == "granite":
        delta = ((x*17+y*31+x*y*7) % 13-6)*3
        return tuple(max(0, min(255, c+delta)) for c in color[:3]) + (255,)
    return color


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document = geometry()
    validate(document["minecraft:geometry"][0]["bones"])
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, document, separators=(",", ":"))
    for paint in PAINTS:
        out.png(args.resource_pack / texture_path(paint), ATLAS_WIDTH, ATLAS_HEIGHT,
                lambda x, y, paint=paint: pixel(paint, x, y), compress_level=9)
    out.finish("Beach parasol outputs are stale. Run pnpm model:", "beach parasol model and textures are up to date")


if __name__ == "__main__":
    main()
