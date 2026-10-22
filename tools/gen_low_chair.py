"""Generate the low chair's entity model and texture (ADR 0121).

    python3 -I tools/gen_low_chair.py <resource pack>          write the files
    python3 -I tools/gen_low_chair.py <resource pack> --check  fail if any file is stale

A low folding camp chair: a brown canvas sling seat and a tall canvas back on a silver aluminium
frame, with wooden armrests, rubber feet, an X brace under the seat at the front and a larger one
across the back. Units are pixels (16 per block). The origin is the middle of the footprint on the
ground, and the front is -z (ADR 0009). The texture is 16 x 16 with one 4 x 4 swatch per color, like
the camping gear atlas. --check compares parsed JSON and decoded pixels, because Biome reformats the
geometry and zlib builds do not all compress identically.
"""

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

GEOMETRY = "models/entity/yasu_ride/low_chair.geo.json"
TEXTURE = "textures/entity/yasu_ride/low_chair.png"
IDENTIFIER = "geometry.yasu_ride.low_chair"
ATLAS_SIZE = 16
SWATCH = 4

# Measured from the reference photos of issue #464, in the brown and silver of the chair
PALETTE = {
    "canvas": (122, 86, 54, 255),
    "canvas_dark": (84, 58, 36, 255),
    "alu": (198, 201, 206, 255),
    "alu_shade": (156, 160, 166, 255),
    "rubber": (26, 26, 26, 255),
    "wood": (214, 178, 128, 255),
    "wood_end": (184, 146, 98, 255),
}
SLOTS = list(PALETTE)

# The model must stay inside these bounds: about 0.8 block wide, a back no taller than a block and a
# pixel, and no deeper than one block, so the 0.75-wide collision box of low_chair.se.json fits it
# whichever way the chair faces (ADR 0121).
MAX_HALF_WIDTH = 6.5
MAX_HEIGHT = 17
MAX_HALF_DEPTH = 8

SEAT_TOP = 6  # the sling's top, which tests/packs/lowChair.test.ts compares with the rideable seat
BACK_PIVOT = (0, SEAT_TOP, 3.5)
# A negative x rotation leans a part that rises from its pivot back toward +z in game (the steering
# column pin in tests/tools/renderPreview.test.ts); validate() checks the sign.
BACK_RECLINE = -12


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


def mirrored(x0, x1, *rest, **kw):
    """The same box on the left (-x) and the right (+x) side."""
    y0, z0, y1, z1, color = rest
    return [box(-x1, y0, z0, -x0, y1, z1, color, **kw), box(x0, y0, z0, x1, y1, z1, color, **kw)]


def bar(center, length, angle, color):
    """A 0.6 px brace of `length` along x, turned about z by `angle` around its middle."""
    cx, cy, cz = center
    h = 0.3
    return box(cx - length / 2, cy - h, cz - h, cx + length / 2, cy + h, cz + h, color, pivot=center, rotation=(0, 0, angle))


def back(x0, y0, z0, x1, y1, z1, color):
    return box(x0, y0, z0, x1, y1, z1, color, pivot=BACK_PIVOT, rotation=(BACK_RECLINE, 0, 0))


def cubes():
    parts = []
    # Rubber feet under the four legs
    for z0, z1 in ((-4.7, -3.3), (2.8, 4.2)):
        parts += mirrored(4.3, 5.7, 0, z0, 0.6, z1, "rubber")
    # Straight legs at the corners, up to the armrests
    for z0, z1 in ((-4.5, -3.5), (3, 4)):
        parts += mirrored(4.5, 5.5, 0.6, z0, 9, z1, "alu")
    # Seat frame: a rail along each side and a cross bar at the front and the back
    parts += mirrored(3.5, 4.5, 4, -3.5, 5, 3, "alu")
    parts.append(box(-4.5, 4, -4.5, 4.5, 5, -3.5, "alu"))
    parts.append(box(-4.5, 4, 3, 4.5, 5, 4, "alu"))
    # Sling seat, its front edge bound, with a seam down the middle
    parts.append(box(-4, 5, -4, 4, SEAT_TOP, 3.5, "canvas"))
    parts.append(box(-4.1, 5, -4.3, 4.1, 6.2, -3.8, "canvas_dark"))
    parts.append(box(-0.3, SEAT_TOP, -3.8, 0.3, 6.1, 3.3, "canvas_dark"))
    # Reclined back: canvas, bound at the top and the sides, on two uprights
    parts.append(back(-4, 6, 3.5, 4, 16, 4.5, "canvas"))
    parts.append(back(-4.1, 15.2, 3.4, 4.1, 16.2, 4.6, "canvas_dark"))
    parts += [back(-4.1, 6.2, 3.4, -3.6, 15.2, 4.6, "canvas_dark"), back(3.6, 6.2, 3.4, 4.1, 15.2, 4.6, "canvas_dark")]
    parts += [back(-5.1, 5, 3.6, -4.1, 16.5, 4.4, "alu"), back(4.1, 5, 3.6, 5.1, 16.5, 4.4, "alu")]
    # Folding X braces: a small one between the front legs below the seat, a large one across the back
    parts += [bar((0, 2.5, -4), 10.4, a, "alu_shade") for a in (17, -17)]
    parts += [bar((0, 4.5, 4.3), 12.2, a, "alu_shade") for a in (35, -35)]
    # Wooden armrests on the side frames, a little past the front legs, with a darker end grain
    parts += mirrored(4, 6, 9, -5, 10, 4, "wood")
    parts += mirrored(4, 6, 9, -5.5, 10, -5, "wood_end")
    return parts


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


def geometry():
    return rounded({
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": IDENTIFIER,
                "texture_width": ATLAS_SIZE,
                "texture_height": ATLAS_SIZE,
                "visible_bounds_width": 2,
                "visible_bounds_height": 2,
                "visible_bounds_offset": [0, 0.5, 0],
            },
            "bones": [{"name": "root", "pivot": [0, 0, 0], "cubes": cubes()}],
        }],
    })


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


def validate(parts):
    """Stop before writing anything when the model leaves its bounds or the back leans forward."""
    errors = []
    pts = [p for c in parts for p in corners(c)]
    xs, ys, zs = zip(*pts)
    if min(xs) < -MAX_HALF_WIDTH or max(xs) > MAX_HALF_WIDTH:
        errors.append(f"x spans {min(xs):.2f}..{max(xs):.2f}, outside +-{MAX_HALF_WIDTH}")
    if min(ys) < 0 or max(ys) > MAX_HEIGHT:
        errors.append(f"y spans {min(ys):.2f}..{max(ys):.2f}, outside 0..{MAX_HEIGHT}")
    if min(zs) < -MAX_HALF_DEPTH or max(zs) > MAX_HALF_DEPTH:
        errors.append(f"z spans {min(zs):.2f}..{max(zs):.2f}, outside +-{MAX_HALF_DEPTH}")
    canvas = next(c for c in parts if c.get("rotation") and c["uv"]["north"] == face("canvas"))
    top = game_rotate((0, canvas["origin"][1] + canvas["size"][1], canvas["origin"][2]), canvas["pivot"], canvas["rotation"])
    base = game_rotate((0, canvas["origin"][1], canvas["origin"][2]), canvas["pivot"], canvas["rotation"])
    if top[2] <= base[2]:
        errors.append("the back leans toward the front (-z); it must recline toward +z")
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
    parts = cubes()
    validate(parts)
    geo_path, texture_path = args.resource_pack / GEOMETRY, args.resource_pack / TEXTURE
    document = geometry()
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
        sys.exit(f"{', '.join(stale)} out of date with tools/gen_low_chair.py. Run `pnpm model` and commit the result.")
    print("low chair model and texture are up to date")


if __name__ == "__main__":
    main()
