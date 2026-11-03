"""Generate a ground tent with a trapezoid body, flat ridge, and left tarp screen.

    python3 -I tools/gen_tent.py <resource pack> [--check]

The rear-wall middle cell anchors the entity (ADR 0130). Local cells use x left,
depth behind the tarp front, and layer above ground. Model pixels are
(16*x, 16*layer, -16*(8-depth)), with +/-8 around each cell center.
The footprint is seven by nine cells; the body spans depths 3..8 and the tarp 0..2.
The ridge is three layers high. The cell-laying changes belong to part 4/6 of #1222;
this generator changes only assets, including the mesh entrance and inner bedroom.
Straight body slopes meet a flat ridge; dark seams outline both ends and the door head.
The caramel tarp joins the ridge with an inverted triangular screen on model -x, two front poles,
and an open right side. Existing flap and fixture bones remain valid. The sixteen paints
recolor only fly, fly_dark, seam, and skirt; both tan tarp slots stay fixed (ADR 0031, 0076).
--check compares parsed JSON and decoded pixels, independent of formatting and compression.
"""
import argparse
import json
import math
import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")
DIMS = load_tool("tent_dims").DIMS
tent_body = load_tool("tent_body")
tent_entrance = load_tool("tent_entrance")
tent_tarp = load_tool("tent_tarp")
tent_inner = load_tool("tent_inner")

GEOMETRY = "models/entity/yasu_ride/tent.geo.json"
TEXTURE = "textures/entity/yasu_ride/tent.png"
IDENTIFIER = "geometry.yasu_ride.tent"
ATLAS_WIDTH = 16
ATLAS_HEIGHT = 32
SWATCH = 4


def scale(color, factor):
    return tuple(max(0, min(255, math.floor(c * factor + 0.5))) for c in color)


PALETTE = {
    "fly": (154, 132, 120, 255), "fly_dark": scale((154, 132, 120), 136 / 176) + (255,),
    "inner": (236, 234, 226, 255), "inner_shade": (204, 202, 194, 255),
    "pole": (170, 174, 180, 255), "pole_dark": (120, 124, 130, 255),
    "strap": (24, 24, 24, 255), "ring": (196, 198, 202, 255),
    "hook": (240, 240, 236, 255), "glass": (226, 222, 206, 0),
    "mattress": (64, 86, 120, 255), "mattress_edge": (44, 60, 86, 255),
    "mesh": (32, 34, 32, 255), "mesh_frame": (76, 70, 60, 255),
    "zip": (20, 20, 18, 255), "inner_floor": (154, 148, 132, 255),
    "seam": scale((154, 132, 120), 0.6) + (255,),
    "tarp_top": (176, 135, 90, 255), "tarp_under": (198, 164, 122, 255),
    "skirt": scale((154, 132, 120), 1.12) + (255,),
}
SLOTS = list(PALETTE)
# The fly color of each paint, in PAINTS order (src/domain/shared/paint.ts). khaki is the
# taupe body fly above; the others copy ACCENT_BASES in tools/gen_camper.py, since tools
# run with python3 -I and cannot import each other.
FLY_PAINTS = {
    "khaki": (154, 132, 120),
    "green": (62, 96, 56),
    "red": (128, 22, 26),
    "white": (222, 222, 216),
    "light_gray": (156, 156, 152),
    "gray": (92, 94, 98),
    "black": (34, 34, 36),
    "orange": (190, 92, 28),
    "yellow": (214, 178, 44),
    "lime": (112, 160, 42),
    "cyan": (30, 118, 124),
    "light_blue": (92, 150, 204),
    "blue": (40, 58, 128),
    "purple": (94, 46, 128),
    "magenta": (160, 52, 140),
    "pink": (214, 132, 162),
}
# Brightness of each fly slot relative to the khaki base, so seams stay darker in every paint.
FLY_SHADES = {"fly": 1.0, "fly_dark": 136 / 176, "seam": 0.6, "skirt": 1.12}
FLY_SLOTS = frozenset(SLOTS.index(key) for key in FLY_SHADES)
# Each flap's opening, roll pivot, parent bone, and paint. The bedroom door uses
# both inner and inner_shade in tent_inner.
FLAPS = {**tent_entrance.FLAPS, **tent_inner.FLAPS}


def face(color):
    i = SLOTS.index(color)
    return {"uv": [SWATCH * (i % SWATCH), SWATCH * (i // SWATCH)], "uv_size": [SWATCH, SWATCH]}


def box(x0, y0, z0, x1, y1, z1, color, pivot=None, rotation=None):
    cube = {
        "origin": [x0, y0, z0],
        "size": [x1 - x0, y1 - y0, z1 - z0],
        "uv": {f: face(color) for f in ("north", "south", "east", "west", "up", "down")},
    }
    if rotation is not None:
        cube["pivot"] = list(pivot)
        cube["rotation"] = list(rotation)
    return cube


def rounded(value):
    """Drop floating-point noise and normalize negative zero before writing."""
    if isinstance(value, float):
        value = round(value, 3) + 0.0
        return int(value) if value.is_integer() else value
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def game_rotate(point, pivot, rotation):
    """Turn a point the way the game turns a cube: x and z the other way from render_preview.py's
    rotate(), as its game_turn() does (ADR 0051, 0058)."""
    x, y, z = (point[i] - pivot[i] for i in range(3))
    rx, _, rz = (math.radians(a) for a in rotation)
    y, z = y * math.cos(rx) + z * math.sin(rx), -y * math.sin(rx) + z * math.cos(rx)
    x, y = x * math.cos(rz) + y * math.sin(rz), -x * math.sin(rz) + y * math.cos(rz)
    return (x + pivot[0], y + pivot[1], z + pivot[2])


def corners(cube):
    (x, y, z), (w, h, d) = cube["origin"], cube["size"]
    pts = [(x + i * w, y + j * h, z + k * d) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
    if "rotation" in cube:
        # Only x and z turns are modeled; a y turn would make every bounds check silently wrong.
        assert cube["rotation"][1] == 0, cube
        pts = [game_rotate(p, cube["pivot"], cube["rotation"]) for p in pts]
    return pts


def assemble(d=DIMS):
    bones = {}
    for builder in (tent_body, tent_entrance, tent_tarp, tent_inner):
        for name, contribution in builder.build(d, face)["bones"].items():
            if name in bones:
                bone = bones[name]
                assert bone["parent"] == contribution["parent"], name
                assert bone["pivot"] == contribution["pivot"], name
                bone["cubes"].extend(contribution["cubes"])
            else:
                bones[name] = {"name": name, **contribution}
    order = ("fly", "inner", "poles", "strap", "lantern", "flap_front", "flap_left",
             "flap_right", "flap_bedroom", "mattress_0", "mattress_1", "lantern_glass")
    assert bones.keys() == set(order)
    return [{"name": "root", "pivot": [0, 0, 0]}, *(bones[name] for name in order)]


def geometry():
    return rounded({
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": IDENTIFIER, "texture_width": 16, "texture_height": ATLAS_HEIGHT,
                "visible_bounds_width": 10, "visible_bounds_height": 5,
                "visible_bounds_offset": [0, 2.5, -4],
            },
            "bones": assemble(),
        }],
    })


def validate(parts):
    """Reject bounds, interior intrusions, flap bounds, and paint ownership before writing."""
    errors = []
    rooms = [(-34, 0.5, -69, 34, 44, -52), (-34, 0.5, -40, 34, 35, -10),
             (-46, 0, -136, DIMS.half_width-DIMS.pole_thickness, 32, -90)]
    def inside(b, outer):
        return all(b[i] >= outer[i] - 0.002 and b[i+3] <= outer[i+3] + 0.002 for i in range(3))
    def overlaps(b, room):
        return all(b[i] < room[i+3] - 0.002 and b[i+3] > room[i] + 0.002 for i in range(3))
    for part in parts:
        name = part["name"]
        for cube in part.get("cubes", []):
            points = corners(cube)
            b = tuple(min(p[i] for p in points) for i in range(3)) + tuple(max(p[i] for p in points) for i in range(3))
            if not inside(b, (-56, 0, -136, 56, 64, 8)):
                errors.append(f"{name} outside model bounds: {b}")
            if name != "flap_front" and overlaps(b, (-24, 0, -90, 24, 35, -80)):
                errors.append(f"{name} blocks the entrance: {b}")
            for i, room in enumerate(rooms):
                if not overlaps(b, room):
                    continue
                if i == 1 and name in ("mattress_0", "mattress_1"):
                    continue
                if i == 0 and name in ("lantern", "lantern_glass") and inside(b, (-8, 32, -72, 8, 48, -56)):
                    continue
                errors.append(f"{name} intersects interior {i}: {b}")
            if name in FLAPS and not inside(b, FLAPS[name][0]):
                errors.append(f"{name} leaves its opening")
            if name == "lantern_glass" and not inside(b, (-8, 32, -72, 8, 48, -56)):
                errors.append("lantern_glass leaves its column")
            for face_uv in cube["uv"].values():
                if face_uv["uv_size"] != [SWATCH, SWATCH]:
                    errors.append(f"{name} has a face wider than one swatch")
                u, v = face_uv["uv"]
                slot = int(u // 4 + 4 * (v // 4))
                if slot in FLY_SLOTS and name not in ("fly", "flap_front", "flap_left", "flap_right"):
                    errors.append(f"{name} uses a fly paint slot")
                if name == "flap_bedroom" and slot not in (2, 3):
                    errors.append("bedroom flap uses a non-inner slot")
                if (name == "lantern_glass") != (slot == SLOTS.index("glass")):
                    errors.append(f"{name} breaks the lantern glass slot")
    if errors:
        sys.exit("\n".join(errors))


def paint_palette(paint):
    """Khaki keeps its fixed palette; other paints replace only fly swatches."""
    colors = dict(PALETTE)
    if paint != "khaki":
        for slot, shade in FLY_SHADES.items():
            colors[slot] = scale(FLY_PAINTS[paint], shade) + (255,)
    return colors


def texture_path(paint):
    return TEXTURE if paint == "khaki" else TEXTURE.replace("tent.png", f"tent_{paint}.png")


def texture_pixels(paint="khaki"):
    colors = paint_palette(paint)
    slot = lambda x, y: (y // SWATCH) * SWATCH + x // SWATCH  # noqa: E731
    return bytes(
        c
        for y in range(ATLAS_HEIGHT)
        for x in range(ATLAS_WIDTH)
        for c in (colors[SLOTS[slot(x, y)]] if slot(x, y) < len(SLOTS) else (0, 0, 0, 0))
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    geo_path = args.resource_pack / GEOMETRY
    textures = {paint: args.resource_pack / texture_path(paint) for paint in FLY_PAINTS}
    document = geometry()
    validate(document["minecraft:geometry"][0]["bones"])
    out = texture_io.Outputs(args.check, report_writes=True)

    out.json(geo_path, json.dumps(document, separators=(",", ":")) + "\n")
    for paint, path in textures.items():
        out.png(path, ATLAS_WIDTH, ATLAS_HEIGHT, texture_io.texel_reader(ATLAS_WIDTH, texture_pixels(paint)), compress_level=9)
    out.finish("Tent outputs are out of date with tools/gen_tent.py. Run `pnpm model` and commit the result:", "tent model and textures are up to date")


if __name__ == "__main__":
    main()
