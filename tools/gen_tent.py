"""Generate a two-room tunnel tent with no brand logo or product name (ADR 0009, 0130).

    python3 -I tools/gen_tent.py <resource pack>
    python3 -I tools/gen_tent.py <resource pack> --check

Front is -z. Local cells use x left, z forward, layer 0 on the ground; model pixels
are (16*x, 16*layer, -16*z), with +/-8 around each cell center. The entity occupies
(0, 0, 0), the middle rear-wall cell. Frame depth is 11-z; footprint x -3..3, z 0..11.
Rear/front walls: x -2..2, z 0/8, layers 0..2. Sides: x +/-3, z 1..7, layers 0..2.
Bedroom: x -2..2, z 1..2; inner panel: z 3; front room: z 4..7, all layers 0..2.
Flaps: front (0,8), left (3,5), right (-3,5), bedroom (0,3), layers 0..1.
Mattresses: x +/-1, z 1..2, layer 0, 9 px high. Wall corners at (+/-3,0/8) are unlaid.
Ceilings: x -2..2, z 1..7, layer 3, and z 9..11, layer 2 over the open tarp.
The lantern cell (0,4,3) is above its hanging shade; tarp poles have no cells.
There are 87 wall cells (8 flap), 50 ceiling cells, 137 laid cells, 336 clear cells,
and 84 ground cells. This generator adds no cell-laying behavior.
Each paint writes its own texture: tent.png for khaki (variant 0), tent_<paint>.png for the
others, recoloring only the fly slots 0 and 1 (ADR 0031, 0076).
Parts are built by tent_body, tent_entrance, tent_tarp, and tent_inner using tent_dims.
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
ATLAS_SIZE = 16
SWATCH = 4
PALETTE = {
    "fly": (176, 140, 98, 255), "fly_dark": (136, 104, 68, 255),
    "inner": (236, 234, 226, 255), "inner_shade": (204, 202, 194, 255),
    "pole": (170, 174, 180, 255), "pole_dark": (120, 124, 130, 255),
    "strap": (24, 24, 24, 255), "ring": (196, 198, 202, 255),
    "hook": (240, 240, 236, 255), "glass": (226, 222, 206, 0),
    "mattress": (64, 86, 120, 255), "mattress_edge": (44, 60, 86, 255),
}
SLOTS = list(PALETTE)
# The fly color of each paint, in PAINTS order (src/domain/shared/paint.ts). khaki is the
# tan-brown fly above; the others copy ACCENT_BASES in tools/gen_camper.py, since tools
# run with python3 -I and cannot import each other.
FLY_PAINTS = {
    "khaki": (176, 140, 98),
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
FLY_SHADES = {"fly": 1.0, "fly_dark": 136 / 176}
# Each flap's opening, roll pivot, parent bone, and paint. The bedroom D-door uses
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
                "identifier": IDENTIFIER, "texture_width": 16, "texture_height": 16,
                "visible_bounds_width": 13, "visible_bounds_height": 5,
                "visible_bounds_offset": [0, 2.5, -5.5],
            },
            "bones": assemble(),
        }],
    })


def validate(parts):
    """Reject bounds, interior intrusions, flap bounds, and paint ownership before writing."""
    errors = []
    rooms = [(-40, 0, -120, 40, 48, -56), (-40, 0, -40, 40, 48, -8),
             (-40, 0, -184, 40, 32, -136)]
    def inside(b, outer):
        return all(b[i] >= outer[i] - 0.002 and b[i+3] <= outer[i+3] + 0.002 for i in range(3))
    def overlaps(b, room):
        return all(b[i] < room[i+3] - 0.002 and b[i+3] > room[i] + 0.002 for i in range(3))
    for part in parts:
        name = part["name"]
        for cube in part.get("cubes", []):
            points = corners(cube)
            b = tuple(min(p[i] for p in points) for i in range(3)) + tuple(max(p[i] for p in points) for i in range(3))
            if not inside(b, (-56, 0, -184, 56, 72, 8)):
                errors.append(f"{name} outside model bounds: {b}")
            for i, room in enumerate(rooms):
                if not overlaps(b, room):
                    continue
                if i == 1 and name in ("mattress_0", "mattress_1"):
                    continue
                if i == 0 and name in ("lantern", "lantern_glass") and inside(b, (-8, 32, -72, 8, 69, -56)):
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
                if slot in (0, 1) and name not in ("fly", "flap_front", "flap_left", "flap_right"):
                    errors.append(f"{name} uses a fly paint slot")
                if name == "flap_bedroom" and slot not in (2, 3):
                    errors.append("bedroom flap uses a non-inner slot")
                if (name == "lantern_glass") != (slot == SLOTS.index("glass")):
                    errors.append(f"{name} breaks the lantern glass slot")
    if errors:
        sys.exit("\n".join(errors))


def scale(color, factor):
    return tuple(max(0, min(255, math.floor(c * factor + 0.5))) for c in color)


def paint_palette(paint):
    """The palette for a paint: khaki keeps PALETTE, so tent.png stays as it was."""
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
        for y in range(ATLAS_SIZE)
        for x in range(ATLAS_SIZE)
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
        out.png(path, ATLAS_SIZE, ATLAS_SIZE, texture_io.texel_reader(ATLAS_SIZE, texture_pixels(paint)), compress_level=9)
    out.finish("Tent outputs are out of date with tools/gen_tent.py. Run `pnpm model` and commit the result:", "tent model and textures are up to date")


if __name__ == "__main__":
    main()
