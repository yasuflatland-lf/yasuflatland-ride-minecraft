"""Generate the plain panel-built Noga Chair (ADR 0169).

Units are pixels; front is -z and ground is y=0. --check compares parsed geometry
and decoded pixels so formatting and PNG compression do not affect freshness.
"""
import argparse
import itertools
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
SEAT_STRIPS = 8
HUB = (0, 3.8, 0)
FRONT = (5.1, 6.8, -5.6)
BACK_PIVOT = (0, 4, 0.8)
RECLINE_DEGREES = -34
ASSEMBLIES = {"back_sling": {"owner": "noga_chair", "cubes": 33},
              **{f"{kind}_{end}{side}": {"owner": "noga_chair", "cubes": 1}
                 for kind in ("leg", "frame") for end in ("f", "b") for side in ("l", "r")}}


def face(color):
    i = SLOTS.index(color)
    return {"uv": [SWATCH * (i % SWATCH), SWATCH * (i // SWATCH)], "uv_size": [SWATCH, SWATCH]}


def box(x0, y0, z0, x1, y1, z1, color, pivot=None, rotation=None):
    return panels.panel(x0, y0, z0, x1, y1, z1, face(color), pivot, rotation)


def seat_point(t):
    return (6.8 - 2.8*(0.9*t + 0.1*t*t), -5.6 + 5.6*t)


def top_center(cube):
    points = corners(cube)
    return tuple(sum(points[i][a] for i in (2, 3, 6, 7))/4 for a in range(3))


def pole(start, end, name, members):
    dx, dy, dz = (end[i]-start[i] for i in range(3))
    length = math.sqrt(dx*dx+dy*dy+dz*dz)
    cube = box(start[0]-0.375, start[1], start[2]-0.375,
               start[0]+0.375, start[1]+length, start[2]+0.375,
               "aluminium", start, (0, 0, math.degrees(math.atan2(dx, math.hypot(dy, dz)))))
    members[name] = tilt.tilt_assembly([cube], start, "x",
                                     -math.degrees(math.atan2(dz, dy)), name, ASSEMBLIES)
    return members[name][0]


def cubes_and_assemblies():
    parts, members = [], {}
    for i in range(SEAT_STRIPS):
        y0, z0 = seat_point(i/SEAT_STRIPS)
        y1, z1 = seat_point((i+1)/SEAT_STRIPS)
        length = math.hypot(y1-y0, z1-z0)
        # The overlap hides cracks at bends; top faces meet on the measured sag curve.
        parts.append(box(-5.15, y0-0.22, z0-0.025, 5.15, y0, z0+length+0.025,
                         "fabric", (0, y0, z0),
                         (math.degrees(math.atan2(y1-y0, z1-z0)), 0, 0)))
    back = []
    for i in range(11):
        angle = -22 + i*4.4
        a = math.radians(angle)
        cx, cz = 13.6*math.sin(a), 0.8-13.6*(1-math.cos(a))
        # The shallow arc leaves room behind the reclined sling within the cell.
        height = 11.4
        def strip(y0, y1, color, depth):
            return box(cx-0.58, y0, cz-depth/2, cx+0.58, y1, cz+depth/2,
                       color, (cx, 4, cz), (0, angle, 0))
        back += [strip(4, 4+height, "fabric", 0.3),
                 strip(4+height-0.15, 4+height+0.17, "binding", 0.4),
                 box(cx-0.58, 4+height-0.65, cz+0.16,
                     cx+0.58, 4+height-0.58, cz+0.18, "seam",
                     (cx, 4, cz), (0, angle, 0))]
    members["back_sling"] = tilt.tilt_assembly(back, BACK_PIVOT, "x", RECLINE_DEGREES,
                                               "back_sling", ASSEMBLIES)
    parts += members["back_sling"]
    # Three short facets round the V into the back instead of leaving a hard crease.
    joint = [(4, 0), (3.9, 0.35), (4, 0.75), (4.5, 1.5)]
    for (y0, z0), (y1, z1) in zip(joint, joint[1:]):
        parts.append(box(-5.14, y0-0.22, z0-0.025,
                         5.14, y0, z0+math.hypot(y1-y0, z1-z0)+0.025,
                         "fabric", (0, y0, z0),
                         (math.degrees(math.atan2(y1-y0, z1-z0)), 0, 0)))
    # The wing's long edge joins the front corner directly to the outer back rim.
    rear = (5.1, 14.05, 6.4)
    theta = math.atan2(rear[1]-FRONT[1], rear[2]-FRONT[2])
    length = math.hypot(rear[1]-FRONT[1], rear[2]-FRONT[2])
    for side in (-1, 1):
        for i in range(32):
            d = length*(i+0.5)/32
            y, z = FRONT[1]+d*math.sin(theta), FRONT[2]+d*math.cos(theta)
            # Intersect the inward rim normal with the two lower triangle edges.
            depths = []
            for (ey0, ez0), (ey1, ez1) in [((6.8, -5.6), (4, 0)), ((4, 0), (14.05, 6.4))]:
                slope = (ey1-ey0)/(ez1-ez0)
                depths.append((y-ey0-slope*(z-ez0))/(math.cos(theta)+slope*math.sin(theta)))
            depth = max(0.1, min(depths))
            # Alternating the outer faces by 0.01 avoids coplanar overlap flicker.
            x = side*(5.1 + (i % 2)*0.01)
            bands = [(y-depth-0.06, y)]
            if side == 1 and 7 <= i <= 13:
                bands = [(y-depth-0.06, y-depth+0.15), (y-depth+0.85, y)]
            for low, high in bands:
                parts.append(box(x-0.17, low, z-length/64-0.025,
                                 x+0.17, high, z+length/64+0.025, "fabric",
                                 (x, y, z), (math.degrees(theta), 0, 0)))
        parts.append(box(side*5.1-0.22, FRONT[1]-0.16, FRONT[2],
                         side*5.1+0.22, FRONT[1]+0.06, FRONT[2]+length,
                         "binding", (side*5.1, FRONT[1], FRONT[2]),
                         (math.degrees(theta), 0, 0)))
    parts.append(box(-5.35, 6.58, -5.75, 5.35, 6.83, -5.42, "binding"))
    # Broad upper panels and narrower lower facets give the hanging pocket a rounded bottom.
    parts += [box(-4.4, 2, 2.1, 4.4, 4.15, 4.8, "fabric"),
              box(-4, 1.55, 2.3, 4, 2.1, 4.6, "fabric"),
              box(-3.5, 1.3, 2.55, 3.5, 1.65, 4.35, "fabric")]
    for side in (-1, 1):
        parts.append(box(side*4.15-0.3, 1.6, 2.25, side*4.15+0.3, 2.4, 4.65,
                         "fabric", (side*4.15, 2.4, 3.45), (0, 0, side*30)))
    # The flap hinges at the rear and opens toward the sitter, with its zip at the front lip.
    parts += [box(-4.45, 3.94, 1.9, 4.45, 4.16, 4.85, "lining",
                  (0, 4.16, 4.85), (8, 0, 0)),
              box(-4.2, 4.13, 1.88, 4.2, 4.23, 2.02, "zipper",
                  (0, 4.16, 4.85), (8, 0, 0)),
              box(3.5, 3.8, 1.82, 3.7, 4.22, 1.87, "zipper")]
    parts += [box(-1.2, 3.25, -0.5, 1.2, 4.55, 3.15, "hub"),
              box(-1.8, 3.24, 0.25, 1.8, 4.54, 1.4, "hub")]
    for side, lr in ((-1, "l"), (1, "r")):
        start = (side*0.8, HUB[1], HUB[2])
        parts.append(pole(start, (side*FRONT[0], FRONT[1], FRONT[2]), f"frame_f{lr}", members))
        parts.append(pole((side*0.8, 3.8, 2.8), (side*5.1, 14.05, 7.55),
                          f"frame_b{lr}", members))
        for depth, fb in ((-1, "f"), (1, "b")):
            foot = (side*5, 0.55, depth*4.5)
            parts.append(pole(foot, (side*0.8, 4.35, 0), f"leg_{fb}{lr}", members))
            parts.append(box(foot[0]-0.48, 0, foot[2]-0.48,
                             foot[0]+0.48, 0.65, foot[2]+0.48, "rubber"))
    return parts, members


def cubes():
    return cubes_and_assemblies()[0]


def corners(cube):
    """The eight corners in (x, y, z) bit order, so indices 0, 1, 4, and 5 are the bottom ones."""
    origin, size = cube["origin"], cube["size"]
    pivot = cube.get("pivot", [0, 0, 0])
    matrix = tilt.cube_matrix(cube.get("rotation", [0, 0, 0]))
    points = []
    for bits in itertools.product((0, 1), repeat=3):
        offset = [origin[a] + bits[a]*size[a] - pivot[a] for a in range(3)]
        turned = [sum(matrix[a][b]*offset[b] for b in range(3)) for a in range(3)]
        points.append(tuple(pivot[a] + turned[a] for a in range(3)))
    return points


def surface_z(cube, x, y):
    """Rear intersection of a +z ray with the actual transformed strip volume."""
    matrix = tilt.cube_matrix(cube.get("rotation", [0, 0, 0]))
    pivot = cube.get("pivot", [0, 0, 0])
    offset = (x-pivot[0], y-pivot[1], -pivot[2])
    low, high = -math.inf, math.inf
    for axis in range(3):
        base = pivot[axis] + sum(matrix[j][axis]*offset[j] for j in range(3))
        direction = matrix[2][axis]
        a, b = cube["origin"][axis], cube["origin"][axis]+cube["size"][axis]
        if abs(direction) < 1e-9:
            if not a-1e-9 <= base <= b+1e-9:
                return None
        else:
            near, far = sorted(((a-base)/direction, (b-base)/direction))
            low, high = max(low, near), min(high, far)
    return high if high >= low else None


def pole_samples(cube):
    points = corners(cube)
    # Sample both edges and the middle across the entire pole, including its front surface.
    for step in range(41):
        t = step/40
        for u, v in itertools.product((0, 0.5, 1), repeat=2):
            bottom = [sum(points[i][a]*w for i, w in
                          ((0, (1-u)*(1-v)), (1, (1-u)*v), (4, u*(1-v)), (5, u*v))) for a in range(3)]
            top = [sum(points[i][a]*w for i, w in
                       ((2, (1-u)*(1-v)), (3, (1-u)*v), (6, u*(1-v)), (7, u*v))) for a in range(3)]
            yield t, tuple(bottom[a]*(1-t)+top[a]*t for a in range(3))


def validate(parts, members):
    tilt.assert_axes(parts, members, ASSEMBLIES)
    assert len(parts) < 250, "cube budget exceeded"
    for point in [p for cube in parts for p in corners(cube)]:
        assert -7.5 <= point[0] <= 7.5 and 0 <= point[1] <= 16 and -8 <= point[2] <= 8, f"outside cell: {point}"
    seats = [c for c in parts if c["size"][0] == 10.3]
    front = max(p[1] for p in corners(seats[0]))
    joint = [c for c in parts if abs(c["size"][0]-10.28) < 1e-6]
    rear = min(corners(c)[i][1] for c in seats+joint for i in (2,3,6,7))
    assert 6 <= front <= 7.5 and 3.5 <= rear <= 4.8, (front, rear)
    assert front-rear >= 2.5, "seat must drop into the rear joint"
    a = top_center(members["frame_fl"][0])
    c = top_center(members["frame_bl"][0])
    u, v = [(p[1]-HUB[1], p[2]-HUB[2]) for p in (a, c)]
    angle = math.degrees(math.acos(sum(x*y for x,y in zip(u,v))/(math.hypot(*u)*math.hypot(*v))))
    assert 95 <= angle <= 115, f"frame triangle angle: {angle}"
    assert 25 <= math.degrees(math.atan2(u[0], -u[1])) <= 40
    assert 25 <= math.degrees(math.atan2(v[1], v[0])) <= 40
    sling = members["back_sling"]
    rim = [c for c in sling if c["uv"]["north"] == face("binding")]
    assert max(p[1] for c in rim for p in corners(c)) == max(p[1] for c in sling for p in corners(c)), "bound rim must be highest"
    for cube in sling:
        points = corners(cube)
        assert sum(points[i][2] for i in (2,3,6,7)) > sum(points[i][2] for i in (0,1,4,5)), "back must lean toward +z"
    fabric = [c for c in sling if c["uv"]["north"] == face("fabric")]
    for name in ("frame_bl", "frame_br"):
        checks = 0
        for t, (x, y, z) in pole_samples(members[name][0]):
            surfaces = [s for strip in fabric if (s := surface_z(strip, x, y)) is not None]
            if surfaces and t < 0.95:
                clearance = z-max(surfaces)
                assert clearance >= 0.3, f"{name} crosses sling: clearance={clearance} at {(x,y,z)}"
                checks += 1
        assert checks >= 150, f"{name}: insufficient sling overlap sampled ({checks})"
    for name in ("leg_fl", "leg_fr", "leg_bl", "leg_br"):
        cube = members[name][0]
        end = top_center(cube)
        start = cube["pivot"]
        angle = math.degrees(math.atan2(abs(end[2]-start[2]), end[1]-start[1]))
        assert 40 <= angle <= 50, f"{name}: side angle {angle}"
    feet = [c for c in parts if c["uv"]["north"] == face("rubber")]
    assert len(feet) == 4
    for foot in feet:
        center = top_center(foot)
        assert abs(abs(center[0])-5) < 1e-6 and abs(abs(center[2])-4.5) < 1e-6, "feet must spread wide"
        assert min(p[1] for p in corners(foot)) == 0, "rubber foot must touch ground"
    assert sum(top_center(c)[2] < HUB[2] for c in feet) == 2
    assert sum(top_center(c)[2] > HUB[2] for c in feet) == 2


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
    validate(*cubes_and_assemblies())
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
