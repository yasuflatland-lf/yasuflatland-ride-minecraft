"""Generate the plain-lidded cast-iron Dutch oven and its PBR atlas."""

import argparse
import itertools
import json
import math
import struct
import sys
import zlib
from pathlib import Path

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


def disc(radius, y0, y1, slot):
    # Three strips make an octagonal silhouette without intersecting rotations.
    shoulder = radius * 0.42
    return [
        box(-shoulder, y0, -radius, shoulder, y1, -shoulder, slot),
        box(-radius, y0, -shoulder, radius, y1, shoulder, slot),
        box(-shoulder, y0, shoulder, shoulder, y1, radius, slot),
    ]


def ring(radius, y0, y1, slot):
    cubes = []
    for i in range(8):
        angle = i * 45
        cubes.append(box(-radius * 0.42, y0, -radius, radius * 0.42, y1, -radius + 0.45,
                         slot, (0, 0, 0), (0, angle, 0)))
    return cubes


def geometry():
    body = disc(3.2, 0, 0.5, 0)
    for radius, y0, y1 in ((3.5, 0.5, 1.5), (4, 1.5, 2.8), (4.5, 2.8, 4.2)):
        body += ring(radius, y0, y1, 0)
    body += ring(4.6, 4.2, 4.5, 1)
    # Open slots through both side lugs are geometry gaps, not painted holes.
    for x0, x1 in ((-5.4, -4), (4, 5.4)):
        body += [box(x0, 3.1, -1.4, x1, 3.4, 1.4, 0),
                 box(x0, 4.4, -1.4, x1, 4.7, 1.4, 1),
                 box(x0, 3.4, -1.4, x1, 4.4, -1, 0),
                 box(x0, 3.4, 1, x1, 4.4, 1.4, 0)]
    lid = disc(4.8, 4.7, 5.6, 0)
    for x in (-1.2, 1.2):
        lid.append(box(x - 0.4, 5.6, -0.4, x + 0.4, 6.5, 0.4, 0))
    lid.append(box(-1.6, 6.5, -0.4, 1.6, 6.9, 0.4, 1))
    bail = []
    # A segmented half ellipse joins the side lugs with a single-axis wire arc.
    for i in range(12):
        a, b = math.pi * i / 12, math.pi * (i + 1) / 12
        x0, y0 = 5 * math.cos(a), 4.1 + 4.6 * math.sin(a)
        x1, y1 = 5 * math.cos(b), 4.1 + 4.6 * math.sin(b)
        length = math.hypot(x1 - x0, y1 - y0)
        bail.append(box(x0, y0 - 0.175, -0.175, x0 + length, y0 + 0.175, 0.175, 2,
                        (x0, y0, 0), (0, 0, math.degrees(math.atan2(y1 - y0, x1 - x0)))))
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
            for uv in cube["uv"].values():
                assert all(0 <= v and v + size <= SIZE for v, size in zip(uv["uv"], uv["uv_size"]))
            pivot = cube.get("pivot", [0, 0, 0])
            for corner in itertools.product(*[(v, v + size) for v, size in zip(cube["origin"], cube["size"])]):
                x, y, z = [v - p for v, p in zip(corner, pivot)]
                for axis, degrees in enumerate(rotation):
                    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
                    if axis == 0: y, z = y * c - z * s, y * s + z * c
                    if axis == 1: x, z = x * c + z * s, -x * s + z * c
                    if axis == 2: x, y = x * c - y * s, x * s + y * c
                point = [x + pivot[0], y + pivot[1], z + pivot[2]]
                assert -6 <= point[0] <= 6 and -6 <= point[2] <= 6 and 0 <= point[1] <= 10, point
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
