"""Generate the plain-lidded cast-iron Dutch oven and its PBR atlas."""

import argparse
import itertools
import json
import math
import struct
import sys
import zlib
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
r4 = panels.r4


def panel_ring(radius, y0, y1, slot, **kwargs):
    return panels.panel_ring(radius, y0, y1, face(slot), **kwargs)


def disc(radius, y0, y1, slot):
    return panels.disc(radius, y0, y1, face(slot))

SIZE = 32
SWATCH = 8
GEOMETRY = "models/entity/yasu_ride/dutch_oven.geo.json"
TEXTURE = "textures/entity/yasu_ride/dutch_oven.png"
MER = "textures/entity/yasu_ride/dutch_oven_mer.png"
TEXTURE_SET = "textures/entity/yasu_ride/dutch_oven.texture_set.json"
PALETTE = [
    ((29, 30, 31), (0, 0, 200)),
    ((53, 54, 55), (0, 0, 200)),
    ((204, 213, 220), (255, 0, 12)),
    ((61, 35, 20), (0, 0, 100)),
    ((218, 191, 140), (0, 0, 200)),
    ((105, 110, 115), (0, 0, 200)),
    ((235, 222, 192), (0, 0, 200)),
    ((187, 38, 23), (0, 0, 160)),
    ((24, 26, 17), (0, 0, 180)),
    ((48, 100, 34), (0, 0, 200)),
    ((137, 91, 47), (0, 0, 200)),
    ((224, 208, 169), (0, 0, 100)),
] + [((0, 0, 0), (0, 0, 255))] * 4


def face(slot):
    return {"uv": [SWATCH * (slot % 4), SWATCH * (slot // 4)], "uv_size": [SWATCH, SWATCH]}


def box(x0, y0, z0, x1, y1, z1, slot, pivot=None, rotation=None):
    cube = {
        "origin": [x0, y0, z0],
        "size": [x1 - x0, y1 - y0, z1 - z0],
        "uv": {side: face(slot) for side in ("north", "south", "east", "west", "up", "down")},
    }
    if rotation is not None:
        cube["pivot"] = list(pivot)
        cube["rotation"] = list(rotation)
    return cube


FOOTPRINT = 6
LUG_Y = (4.2, 4.5)
LUG_HOLE_X = 5.0


def strip(cx, cz, length, width, direction, y0, y1, slot):
    """A flat panel centred on (cx, cz) whose long side points `direction` degrees from +x toward +z."""
    return box(r4(cx - length / 2), y0, r4(cz - width / 2), r4(cx + length / 2), y1, r4(cz + width / 2),
               slot, (r4(cx), 0, r4(cz)), (0, r4(-direction), 0))


def slanted(cx, cy, length, width, angle, z0, z1, slot):
    """A panel in the x-y plane turned `angle` degrees counterclockwise about Z only (in game)."""
    return box(r4(cx - length / 2), r4(cy - width / 2), z0, r4(cx + length / 2), r4(cy + width / 2), z1,
               slot, (r4(cx), r4(cy), 0), (0, 0, r4(-angle)))


def tilted(cy, cz, length, width, angle, x0, x1, slot):
    """A panel along x turned about X only."""
    return box(x0, r4(cy - length / 2), r4(cz - width / 2), x1, r4(cy + length / 2), r4(cz + width / 2),
               slot, (0, r4(cy), r4(cz)), (r4(-angle), 0, 0))


def lug(side):
    """A flat eye plate with a rounded end and an oval hole ringed by short panels.

    Built for the +x side and mirrored by `side`; Y-rotations flip sign with the mirror.
    """
    y0, y1 = LUG_Y
    hx, hr_x, hr_z = LUG_HOLE_X, 0.25, 0.5
    end = hx + 0.6
    m = lambda x0, x1: (r4(min(side * x0, side * x1)), r4(max(side * x0, side * x1)))
    cubes = []
    for (xa, xb), (za, zb) in (((4.3, hx - hr_x), (-1.4, 1.4)), ((hx + hr_x, end), (-hr_z, hr_z)),
                              ((hx - hr_x, hx + hr_x - 0.05), (hr_z, 1.4)),
                              ((hx - hr_x, hx + hr_x - 0.05), (-1.4, -hr_z)),
                              ((hx + hr_x - 0.05, end), (hr_z, 1.0)), ((hx + hr_x - 0.05, end), (-1.0, -hr_z))):
        a, b = m(xa, xb)
        cubes.append(box(a, y0, za, b, y1, zb, 0))
    corner = hx + hr_x - 0.05
    for sz in (1, -1):
        for phi in (15, 45, 75):
            d = math.radians(phi)
            cubes.append(strip(side * (corner + 0.2 * math.cos(d)), sz * (1.0 + 0.2 * math.sin(d)), 0.4, 0.2,
                               (180 - phi if side < 0 else phi) * sz, y0, y1 + 0.01, 0))
    steps = 10
    for k in range(steps):
        t = 2 * math.pi * (k + 0.5) / steps
        px, pz = hr_x * math.cos(t), hr_z * math.sin(t)
        nx, nz = math.cos(t) / hr_x, math.sin(t) / hr_z
        norm = math.hypot(nx, nz)
        c = (side * (hx + px + 0.12 * nx / norm), pz + 0.12 * nz / norm)
        tx, tz = -hr_x * math.sin(t), hr_z * math.cos(t)
        edge = math.hypot(tx, tz) * 2 * math.pi / steps + 0.08
        direction = math.degrees(math.atan2(tz, side * tx))
        cubes.append(strip(c[0], c[1], edge, 0.24, direction, y0, y1 + 0.02, 0))
    return cubes


def bail_ring(side):
    return panel_ring(0.28, 4.5, 4.7, 2, sides=8, thickness=0.1, center=(side * LUG_HOLE_X, 0))


def lid_handle():
    cubes = []
    for side in (1, -1):
        post = sorted((side * 0.8, side * 1.6))
        cubes.append(box(post[0], 5.6, -0.4, post[1], 6.5, 0.4, 0))
        flare = slanted(side * 1.76, 5.74, 0.45, 0.14, 45 * side, -0.4, 0.4, 0)
        cubes.append(flare)
        cubes.append(slanted(side * 0.64, 5.74, 0.45, 0.14, -45 * side, -0.4, 0.4, 0))
        cubes.append(slanted(side * 1.294, 6.594, 0.57, 0.3, -45 * side, -0.4, 0.4, 1))
        lo, hi = sorted((side * 1.2, side * 1.4))
        cubes.append(box(lo, 6.5, -0.4, hi, 6.7, 0.4, 1))
    cubes.append(box(-1.2, 6.5, -0.4, 1.2, 6.75, 0.4, 1))
    cubes.append(box(-1.2, 6.75, -0.25, 1.2, 6.9, 0.25, 1))
    for sz in (1, -1):
        cubes.append(tilted(6.825, sz * 0.325, 0.22, 0.12, -45 * sz, -1.2, 1.2, 1))
    return cubes


BODY_PROFILE = ((3.5, 0.5, 1.5), (4, 1.5, 2.8), (4.5, 2.8, 4.2))
WIRE = 0.35
BAIL_SEGMENTS = 18


def geometry():
    body = disc(3.2, 0, 0.5, 0)
    for radius, y0, y1 in BODY_PROFILE:
        body += panel_ring(radius, y0, y1, 0)
    body += panel_ring(4.6, 4.2, 4.5, 1)
    # The oval holes are geometry gaps ringed by panels, not painted holes.
    body += lug(1) + lug(-1)
    lid = panel_ring(4.8, 4.7, 5.6, 0) + disc(4.8, 5.3, 5.6, 0)
    lid += lid_handle()
    bail = []
    # A half ellipse of short wire segments joins the side lugs; each segment
    # turns about Z only and overlaps the next by the wire thickness.
    for i in range(BAIL_SEGMENTS):
        a, b = math.pi * i / BAIL_SEGMENTS, math.pi * (i + 1) / BAIL_SEGMENTS
        x0, y0 = 5 * math.cos(a), 4.1 + 4.6 * math.sin(a)
        x1, y1 = 5 * math.cos(b), 4.1 + 4.6 * math.sin(b)
        length = math.hypot(x1 - x0, y1 - y0)
        bail.append(box(r4(x0 - WIRE / 2), r4(y0 - WIRE / 2), r4(-WIRE / 2),
                        r4(x0 + length + WIRE / 2), r4(y0 + WIRE / 2), r4(WIRE / 2), 2,
                        (r4(x0), r4(y0), 0), (0, 0, r4(-math.degrees(math.atan2(y1 - y0, x1 - x0))))))
    bail += bail_ring(1) + bail_ring(-1)
    food = disc(4.1, 3.8, 4, 3)
    food += [box(-2.8, 4, -1.3, 0.7, 4.35, 0.2, 10),
             box(-2.6, 4.35, -1.1, 0.5, 4.6, 0, 4)]
    for x, z in ((1.8, -1.5), (-0.7, 1.5)):
        food += [box(x - 0.7, 4, z - 0.6, x + 0.7, 4.2, z + 0.6, 5),
                 box(x - 0.5, 4.2, z - 0.4, x + 0.5, 4.35, z + 0.4, 6),
                 box(x - 0.7, 4.25, z + 0.45, x + 0.7, 4.5, z + 0.65, 5,
                     (x, 4.25, z + 0.45), (-30, 0, 0))]
    for x, z in ((-2.5, 1.2), (2, 1.5), (0.2, -2.5)):
        food.append(box(x - 0.45, 4, z - 0.45, x + 0.45, 4.7, z + 0.45, 7))
    for x, z in ((2.8, 0), (-1.5, -2.5)):
        food.append(box(x - 0.3, 4, z - 0.25, x + 0.3, 4.4, z + 0.25, 8))
    for x, z in ((0, 0.7), (1, -0.6), (-2, 2), (2.6, -2)):
        food.append(box(x - 0.2, 4, z - 0.25, x + 0.2, 4.25, z + 0.25, 9))
    bubbles = [box(x, 4.05, z, x + 0.5, 4.55, z + 0.5, 11)
               for x, z in ((-3, -0.5), (1, 2.5), (2.5, -1), (-0.5, -1.8), (-1, 2.5))]
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.dutch_oven", "texture_width": SIZE,
                        "texture_height": SIZE, "visible_bounds_width": 1.5,
                        "visible_bounds_height": 1.5, "visible_bounds_offset": [0, 0.3, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0]}] + [
            {"name": name, "parent": "food" if name == "bubbles" else "root",
             "pivot": [0, 0, 0], "cubes": cubes}
            for name, cubes in (("body", body), ("lid", lid), ("bail", bail), ("food", food), ("bubbles", bubbles))],
    }]}


def validate(doc):
    bones = doc["minecraft:geometry"][0]["bones"]
    bounds = {}
    for bone in bones:
        points = []
        for cube in bone.get("cubes", []):
            rotation = cube.get("rotation", [0, 0, 0])
            assert sum(v != 0 for v in rotation) <= 1, "two-axis cube rotation"
            handle = bone["name"] == "lid" and cube["origin"][1] >= 5.5
            if bone["name"] in ("body", "lid") and not handle:
                assert rotation[0] == 0 and rotation[2] == 0, "wall panel not Y-only"
            if bone["name"] == "bail":
                assert rotation[0] == 0, "bail wire or ring turned about X"
            assert 0 < len(bone["cubes"]) <= 255
            for uv in cube["uv"].values():
                assert all(0 <= v and v + size <= SIZE for v, size in zip(uv["uv"], uv["uv_size"]))
            pivot = cube.get("pivot", [0, 0, 0])
            for corner in itertools.product(*[(v, v + size) for v, size in zip(cube["origin"], cube["size"])]):
                x, y, z = [v - p for v, p in zip(corner, pivot)]
                # In game x and z rotations turn the other way from the usual maths (ADR 0051).
                for axis, degrees in enumerate((-rotation[0], rotation[1], -rotation[2])):
                    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
                    if axis == 0: y, z = y * c - z * s, y * s + z * c
                    if axis == 1: x, z = x * c + z * s, -x * s + z * c
                    if axis == 2: x, y = x * c - y * s, x * s + y * c
                point = [x + pivot[0], y + pivot[1], z + pivot[2]]
                assert -FOOTPRINT <= point[0] <= FOOTPRINT and -FOOTPRINT <= point[2] <= FOOTPRINT and 0 <= point[1] <= 10, point
                points.append(point)
        if points: bounds[bone["name"]] = (min(p[1] for p in points), max(p[1] for p in points))
    assert bounds["food"][1] <= bounds["lid"][0], "lid intersects food"


def pixels(mer=False):
    out = bytearray()
    for y in range(SIZE):
        for x in range(SIZE):
            color, material = PALETTE[(y // SWATCH) * 4 + x // SWATCH]
            if mer:
                out.extend((*material, 255))
            else:
                streak = round(3 * math.sin(x * 1.5 + y * 0.2)) if y < 16 else 0
                out.extend((*(max(0, min(255, c + streak)) for c in color), 255))
    return bytes(out)


def write_png(path, data):
    stride = SIZE * 4
    raw = b"".join(b"\x00" + data[y * stride : (y + 1) * stride] for y in range(SIZE))

    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def read_png(path):
    data = path.read_bytes()
    pos, compressed = 8, b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        if data[pos + 4 : pos + 8] == b"IDAT":
            compressed += data[pos + 8 : pos + 8 + length]
        pos += length + 12
    raw = zlib.decompress(compressed)
    stride = SIZE * 4
    return b"".join(raw[y * (stride + 1) + 1 : (y + 1) * (stride + 1)] for y in range(SIZE))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = args.resource_pack
    geo = root / GEOMETRY
    color = root / TEXTURE
    mer = root / MER
    texture_set = root / TEXTURE_SET
    doc = geometry()
    validate(doc)
    set_doc = {"format_version": "1.16.100", "minecraft:texture_set": {"color": "dutch_oven", "metalness_emissive_roughness": "dutch_oven_mer"}}
    if args.check:
        if json.loads(geo.read_text()) != doc or json.loads(texture_set.read_text()) != set_doc or read_png(color) != pixels() or read_png(mer) != pixels(True):
            sys.exit("Dutch oven model, PBR maps, or texture set is stale; run pnpm model")
        return
    geo.parent.mkdir(parents=True, exist_ok=True)
    color.parent.mkdir(parents=True, exist_ok=True)
    geo.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    texture_set.write_text(json.dumps(set_doc, separators=(",", ":")) + "\n")
    write_png(color, pixels())
    write_png(mer, pixels(True))


if __name__ == "__main__":
    main()
