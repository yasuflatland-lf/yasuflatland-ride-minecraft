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
--check compares parsed JSON and decoded pixels, independent of formatting and compression.
"""
import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

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
        pts = [game_rotate(p, cube["pivot"], cube["rotation"]) for p in pts]
    return pts


def arch(z0, z1, thickness, color, outward=True):
    """Chord segments follow the half ellipse; the shell grows outward, poles inward."""
    result = []
    for i in range(32):
        a, b = math.pi * i / 32, math.pi * (i + 1) / 32
        x0, y0 = 52 * math.cos(a), 32 + 39 * math.sin(a)
        x1, y1 = 52 * math.cos(b), 32 + 39 * math.sin(b)
        dx, dy = x0 - x1, y0 - y1
        length = math.hypot(dx, dy)
        angle = -math.degrees(math.atan2(dy, dx))
        low, high = (0, thickness) if outward else (-thickness, 0)
        result.append(box(x1, y1 + low, z0, x1 + length, y1 + high, z1,
                          color, pivot=(x1, y1, z0), rotation=(0, 0, angle)))
    return result


def end_panel(z0, z1, door):
    result = []
    if door:
        result += [box(-52, 0, z0, -8, 32, z1, "fly"),
                   box(8, 0, z0, 52, 32, z1, "fly")]
    else:
        result.append(box(-52, 0, z0, 52, 32, z1, "fly"))
    # Narrow vertical strips follow the elliptical end without extending past the fly.
    for x in range(-52, 52):
        edge = max(abs(x), abs(x + 1))
        top = 32 + 39 * math.sqrt(1 - (edge / 52) ** 2)
        if top > 32:
            result.append(box(x, 32, z0, x + 1, top, z1, "fly"))
    return result


def parts():
    fly = arch(-135, 8, 1, "fly")
    for x0, x1 in ((52, 53), (-53, -52)):
        fly += [box(x0, 0, -135, x1, 32, -88, "fly"),
                box(x0, 0, -72, x1, 32, 8, "fly")]
    fly += end_panel(7, 8, False) + end_panel(-135, -134, True)
    # x rotation slopes the tarp's top from (y60,z-135) to (y40,z-184).
    length = math.hypot(49, 20)
    fly.append(box(-41, 59, -135-length, 41, 60, -135, "fly",
                   pivot=(0, 60, -135), rotation=(math.degrees(math.atan2(20, 49)), 0, 0)))
    # Bindings remain in the fly's two paint slots.
    fly += [box(-8, 32, -135, 8, 33, -134, "fly_dark"),
            box(52, 32, -88, 53, 33, -72, "fly_dark"),
            box(-53, 32, -88, -52, 33, -72, "fly_dark")]
    inner = [
        box(40, 0, -55, 41, 48, -7, "inner"),
        box(-41, 0, -55, -40, 48, -7, "inner"),
        box(-40, 0, -8, 40, 48, -7, "inner"),
        box(-41, 48, -55, 41, 50, -7, "inner_shade"),
        box(-41, 0, -55, -8, 48, -54, "inner"),
        box(8, 0, -55, 41, 48, -54, "inner"),
        box(-8, 32, -55, 8, 48, -54, "inner"),
    ]
    # The D-door has a straight left edge and a rounded right edge. Its corner
    # infill belongs to the fixed inner panel, not to the rolling flap.
    bedroom_flap = [box(-8, 0, -56, 0, 32, -55, "inner")]
    for y in range(32):
        edge = max(abs(y - 16), abs(y + 1 - 16))
        width = 8 * math.sqrt(1 - (edge / 16) ** 2)
        if width:
            bedroom_flap.append(box(0, y, -56, width, y+1, -55, "inner"))
            bedroom_flap.append(box(max(0, width-0.5), y, -56, width, y+1, -55.75, "inner_shade"))
        if width < 8:
            inner.append(box(width, y, -55, 8, y+1, -54, "inner"))
    poles = []
    for z0, z1 in ((-134, -132.5), (-58, -56.5), (4, 5.5)):
        poles += arch(z0, z1, 1.5, "pole", outward=False)
        poles += [box(50.5, 0, z0, 52, 32, z1, "pole"),
                  box(-52, 0, z0, -50.5, 32, z1, "pole")]
    poles += [box(40, 0, -184, 41.5, 40, -182.5, "pole_dark"),
              box(-41.5, 0, -184, -40, 40, -182.5, "pole_dark")]
    strap = [box(-1, 69, -134, 1, 70, 4, "strap")]
    for z in range(-132, 5, 24):
        # Four strips leave the center of each 2 px silver ring open.
        strap += [box(-1, 68.75, z-1, -0.6, 69.25, z+1, "ring"),
                  box(0.6, 68.75, z-1, 1, 69.25, z+1, "ring"),
                  box(-0.6, 68.75, z-1, 0.6, 69.25, z-0.6, "ring"),
                  box(-0.6, 68.75, z+0.6, 0.6, 69.25, z+1, "ring")]
    lantern = [box(-0.5, 44, -64.5, 0.5, 69, -63.5, "hook"),
               box(-3, 44, -67, 3, 45, -61, "hook")]
    # Stepped circular cross-section gives the milky shade a round silhouette.
    glass = []
    for x in range(-4, 4):
        radius = math.sqrt(16 - max(abs(x), abs(x+1)) ** 2)
        if radius:
            glass.append(box(x, 36, -64-radius, x+1, 44, -64+radius, "glass"))
    def bone(name, cubes, pivot=(0, 0, 0), parent="root"):
        return {"name": name, "parent": parent, "pivot": list(pivot), "cubes": cubes}
    result = [{"name": "root", "pivot": [0, 0, 0]},
              bone("fly", fly), bone("inner", inner), bone("poles", poles), bone("strap", strap),
              bone("lantern", lantern, (0, 69, -64))]
    for name, bounds, pivot, parent, color in (
        ("flap_front", (-8, 0, -136, 8, 32, -135), (0, 32, -135.5), "fly", "fly"),
        ("flap_left", (53, 0, -88, 54, 32, -72), (53.5, 32, -80), "fly", "fly"),
        ("flap_right", (-54, 0, -88, -53, 32, -72), (-53.5, 32, -80), "fly", "fly"),
        ("flap_bedroom", (-8, 0, -56, 8, 32, -55), (0, 32, -55.5), "inner", "inner_shade"),
    ):
        result.append(bone(name, bedroom_flap if name == "flap_bedroom" else [box(*bounds, color)], pivot, parent))
    for i, x in enumerate((16, -16)):
        result.append(bone(f"mattress_{i}", [
            box(x-7, 0, -39, x+7, 8, -9, "mattress_edge"),
            box(x-7, 8, -39, x+7, 9, -9, "mattress"),
        ], (x, 0, -24)))
    result.append(bone("lantern_glass", glass, (0, 40, -64), "lantern"))
    return result


def geometry():
    return rounded({
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": IDENTIFIER, "texture_width": 16, "texture_height": 16,
                "visible_bounds_width": 13, "visible_bounds_height": 5,
                "visible_bounds_offset": [0, 2.5, -5.5],
            },
            "bones": parts(),
        }],
    })


def validate(parts):
    """Reject bounds, interior intrusions, flap bounds, and paint ownership before writing."""
    errors = []
    rooms = [(-40, 0, -120, 40, 48, -56), (-40, 0, -40, 40, 48, -8),
             (-40, 0, -184, 40, 32, -136)]
    openings = {
        "flap_front": (-8, 0, -136, 8, 32, -135),
        "flap_left": (53, 0, -88, 54, 32, -72),
        "flap_right": (-54, 0, -88, -53, 32, -72),
        "flap_bedroom": (-8, 0, -56, 8, 32, -55),
    }
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
            if name in openings and not inside(b, openings[name]):
                errors.append(f"{name} leaves its opening")
            if name == "lantern_glass" and not inside(b, (-8, 32, -72, 8, 48, -56)):
                errors.append("lantern_glass leaves its column")
            for face_uv in cube["uv"].values():
                u, v = face_uv["uv"]
                slot = int(u // 4 + 4 * (v // 4))
                if slot in (0, 1) and name not in ("fly", "flap_front", "flap_left", "flap_right"):
                    errors.append(f"{name} uses a fly paint slot")
                if name == "flap_bedroom" and slot not in (2, 3):
                    errors.append("bedroom flap uses a non-inner slot")
    if errors:
        sys.exit("\n".join(errors))


def texture_pixels():
    slot = lambda x, y: (y // SWATCH) * SWATCH + x // SWATCH  # noqa: E731
    return bytes(
        c
        for y in range(ATLAS_SIZE)
        for x in range(ATLAS_SIZE)
        for c in (PALETTE[SLOTS[slot(x, y)]] if slot(x, y) < len(SLOTS) else (0, 0, 0, 0))
    )

def write_png(path, size, pixels):
    stride = size * 4
    raw = b"".join(b"\x00" + pixels[y * stride : (y + 1) * stride] for y in range(size))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def read_png(path, size):
    """Decode a PNG this script wrote: 8-bit RGBA, size x size, every row unfiltered."""
    data = path.read_bytes()
    pos, idat = 8, b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        if kind == b"IHDR" and data[pos + 8 : pos + 18] != struct.pack(">IIBB", size, size, 8, 6):
            raise ValueError("not a 16 x 16 RGBA PNG")
        if kind == b"IDAT":
            idat += data[pos + 8 : pos + 8 + length]
        pos += length + 12
    raw = zlib.decompress(idat)
    stride = size * 4
    rows = [raw[y * (stride + 1) : (y + 1) * (stride + 1)] for y in range(size)]
    if any(len(row) != stride + 1 or row[0] != 0 for row in rows):
        raise ValueError("rows are not unfiltered")
    return b"".join(row[1:] for row in rows)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    geo_path, texture_path = args.resource_pack / GEOMETRY, args.resource_pack / TEXTURE
    document = geometry()
    validate(document["minecraft:geometry"][0]["bones"])
    if not args.check:
        geo_path.parent.mkdir(parents=True, exist_ok=True)
        geo_path.write_text(json.dumps(document, separators=(",", ":")) + "\n")
        print(f"wrote {geo_path}")
        texture_path.parent.mkdir(parents=True, exist_ok=True)
        write_png(texture_path, ATLAS_SIZE, texture_pixels())
        print(f"wrote {texture_path}")
        return
    stale = []
    try:
        if json.loads(geo_path.read_text()) != document:
            stale.append(str(geo_path))
    except (OSError, ValueError) as e:
        stale.append(f"{geo_path} ({e})")
    try:
        if read_png(texture_path, ATLAS_SIZE) != texture_pixels():
            stale.append(str(texture_path))
    except (OSError, ValueError, struct.error, zlib.error) as e:
        stale.append(f"{texture_path} ({e})")
    if stale:
        sys.exit(f"{', '.join(stale)} out of date with tools/gen_tent.py. Run `pnpm model` and commit the result.")
    print("tent model and texture are up to date")

if __name__ == "__main__":
    main()
