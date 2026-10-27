"""Generate the plain panel-built Noga Chair (ADR 0169).

Units are pixels; front is -z and ground is y=0. --check compares parsed geometry
and decoded pixels so formatting and PNG compression do not affect freshness.
"""
import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
tilt = load_tool("cube_tilt")
GEOMETRY = "models/entity/yasu_ride/noga_chair.geo.json"
TEXTURE = "textures/entity/yasu_ride/noga_chair.png"
IDENTIFIER = "geometry.yasu_ride.noga_chair"
ATLAS_SIZE = 16
SWATCH = 4
PALETTE = {
    "fabric": (115, 119, 98, 255),
    "binding": (76, 82, 65, 255),
    "lining": (143, 148, 124, 255),
    "aluminium": (31, 35, 34, 255),
    "hub": (44, 47, 44, 255),
    "rubber": (18, 21, 20, 255),
    "zipper": (170, 174, 157, 255),
    "seam": (103, 109, 89, 255),
}
SLOTS = list(PALETTE)
SEAT_TOP = 5
BACK_PIVOT = (0, SEAT_TOP, 3)
RECLINE_DEGREES = -20
# The split left wing adds one panel; each of the eleven panels also has a bound rim.
ASSEMBLIES = {"back_sling": {"owner": "noga_chair", "cubes": 27},
              **{name: {"owner": "noga_chair", "cubes": 1}
                 for name in ("leg_fl", "leg_fr", "leg_bl", "leg_br")}}


def face(color):
    i = SLOTS.index(color)
    return {"uv": [SWATCH * (i % SWATCH), SWATCH * (i // SWATCH)], "uv_size": [SWATCH, SWATCH]}


def box(x0, y0, z0, x1, y1, z1, color, pivot=None, rotation=None):
    return panels.panel(x0, y0, z0, x1, y1, z1, face(color), pivot, rotation)


def cubes_and_assemblies():
    parts = [box(-4, 4.65, -4.5, 4, SEAT_TOP, 3, "fabric")]
    # Four lifted edges meet the flat middle without a stair-step profile.
    for side in (-1, 1):
        parts.append(box(min(side*4, side*5.5), 4.65, -4.5,
                         max(side*4, side*5.5), 5, 3, "fabric",
                         (side*4, 5, 0), (0, 0, -side*15)))
    parts += [box(-5.5, 4.65, -6, 5.5, 5, -4.5, "fabric", (0, 5, -4.5), (15, 0, 0)),
              box(-5.5, 4.65, 3, 5.5, 5, 4, "fabric", (0, 5, 3), (-20, 0, 0)),
              box(-5.5, 5.2, -6.05, 5.5, 5.5, -5.7, "binding")]
    back = []
    # Tangents to a 100-degree arc: the ends curve forward around the sitter.
    for i in range(11):
        angle = -50 + i*10
        a = math.radians(angle)
        cx, cz = 7.2*math.sin(a), 3 - 7.2*(1-math.cos(a))
        def strip(y0, y1, color, depth=0.4):
            return box(cx-0.7, y0, cz-depth/2, cx+0.7, y1, cz+depth/2,
                       color, (cx, 5, cz), (0, angle, 0))
        if i == 0:
            back += [strip(5, 10.3, "fabric"), strip(12.3, 14, "fabric")]
            back.append(box(cx-0.7, 10.3, cz-0.23, cx-0.52, 12.3, cz+0.23,
                            "binding", (cx, 5, cz), (0, angle, 0)))
        else:
            back.append(strip(5, 14, "fabric"))
        back.append(strip(13.8, 14.35, "binding", 0.65))
        if i == 5:
            back.append(box(cx-0.045, 5.1, cz+0.21, cx+0.045, 13.8, cz+0.24, "seam"))
    # Endpoints keep the rear poles against the sling instead of crossing its inner face.
    for side in (-1, 1):
        start = (side*0.8, 3.2, 5.0)
        dx, dy, dz = side*4.6, 10.9, -3.5
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        pole = box(start[0]-0.35, start[1], start[2]-0.35,
                   start[0]+0.35, start[1]+length, start[2]+0.35,
                   "aluminium", start,
                   (0, 0, math.degrees(math.atan2(dx, math.hypot(dy, dz)))))
        back += tilt.tilt_assembly([pole], start, "x", -math.degrees(math.atan2(dz, dy)),
                                   "back_sling", ASSEMBLIES)
    members = {"back_sling": tilt.tilt_assembly(back, BACK_PIVOT, "x", RECLINE_DEGREES,
                                               "back_sling", ASSEMBLIES)}
    parts += members["back_sling"]
    # A bridge row follows the rear seat edge up to the curved back.
    parts.append(box(-4.8, 4.85, 2.4, 4.8, 5.25, 3.4, "fabric"))
    parts += [box(-4, 1.8, 1.8, 4, 4.5, 5.8, "binding"),
              box(-4.05, 3.55, 5.8, 4.05, 4.5, 6.05, "lining"),
              box(-3.8, 3.45, 6.06, 3.8, 3.6, 6.15, "zipper"),
              box(2.9, 3.1, 6.16, 3.15, 3.55, 6.28, "zipper")]
    parts += panels.panel_ring(1.35, 2.55, 3.65, face("hub"), sides=8, thickness=0.65)
    parts.append(box(-1, 2.55, -1, 1, 3.65, 1, "hub"))
    for side, lr in ((-1, "l"), (1, "r")):
        for depth, fb in ((-1, "f"), (1, "b")):
            foot = (side*5.8, 0.6, depth*5.7)
            dx, dy, dz = -side*5.3, 2.5, -depth*5.2
            length = math.sqrt(dx*dx+dy*dy+dz*dz)
            yz = math.hypot(dy, dz)
            pole = box(foot[0]-0.4, foot[1], foot[2]-0.4,
                       foot[0]+0.4, foot[1]+length, foot[2]+0.4, "aluminium",
                       foot, (0, 0, math.degrees(math.atan2(dx, yz))))
            name = f"leg_{fb}{lr}"
            members[name] = tilt.tilt_assembly([pole], foot, "x", -math.degrees(math.atan2(dz, dy)), name, ASSEMBLIES)
            parts += members[name]
            parts.append(box(foot[0]-0.45, 0, foot[2]-0.45, foot[0]+0.45, 0.6, foot[2]+0.45, "rubber"))
    return parts, members


def cubes():
    return cubes_and_assemblies()[0]


def corners(cube):
    matrix = tilt.cube_matrix(cube.get("rotation", [0, 0, 0]))
    pivot = cube.get("pivot", [0, 0, 0])
    return [tuple(pivot[a] + sum(matrix[a][b]*(cube["origin"][b] + bits[b]*cube["size"][b]-pivot[b]) for b in range(3)) for a in range(3))
            for bits in ((i,j,k) for i in (0,1) for j in (0,1) for k in (0,1))]


def validate(parts):
    _, members = cubes_and_assemblies()
    tilt.assert_axes(parts, members, ASSEMBLIES)
    assert len(parts) < 250, "cube budget exceeded"
    for point in [p for cube in parts for p in corners(cube)]:
        assert -7.5 <= point[0] <= 7.5 and 0 <= point[1] <= 16 and -8 <= point[2] <= 8, f"outside cell: {point}"
    seat = parts[0]
    assert 4.5 <= seat["origin"][1] + seat["size"][1] <= 5.5
    sling = members["back_sling"][:-2]
    rim = [c for c in sling if c["uv"]["north"] == face("binding")]
    assert max(p[1] for c in rim for p in corners(c)) == max(p[1] for c in sling for p in corners(c)), "bound rim must be the highest sling point"
    for cube in sling:
        points = corners(cube)
        bottom = [points[i] for i in (0,1,4,5)]
        top = [points[i] for i in (2,3,6,7)]
        assert sum(p[2] for p in top) > sum(p[2] for p in bottom), "back must lean toward +z"
        assert min(p[1] for p in top) > min(p[1] for p in bottom), "sling top must be highest"


def geometry():
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": IDENTIFIER, "texture_width": ATLAS_SIZE,
                        "texture_height": ATLAS_SIZE, "visible_bounds_width": 2,
                        "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.5, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0], "cubes": cubes()}]}]}


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
        sys.exit(f"{', '.join(stale)} out of date with tools/gen_noga_chair.py. Run `pnpm model` and commit the result.")
    print("Noga Chair model and texture are up to date")


if __name__ == "__main__":
    main()
