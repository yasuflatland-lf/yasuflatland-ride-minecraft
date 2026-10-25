"""Generate the stainless folding fire pit, its PBR maps, and texture set."""

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

SIZE = 32
SWATCH = 8
GEOMETRY = "models/entity/yasu_ride/fire_pit.geo.json"
TEXTURE = "textures/entity/yasu_ride/fire_pit.png"
MER = "textures/entity/yasu_ride/fire_pit_mer.png"
TEXTURE_SET = "textures/entity/yasu_ride/fire_pit.texture_set.json"

# The first seven swatches are stainless steel: bright outer panels have a
# mirror-smooth MER roughness of zero, while the heat-exposed basin is duller.
PALETTE = [
    ((207, 214, 218), (255, 0, 0)),
    ((154, 163, 169), (255, 0, 8)),
    ((238, 242, 244), (255, 0, 0)),
    ((83, 92, 99), (255, 0, 20)),
    ((116, 123, 127), (245, 0, 36)),
    ((62, 61, 58), (130, 0, 155)),
    ((222, 227, 229), (255, 0, 6)),
    ((37, 39, 41), (0, 0, 220)),
    ((255, 186, 40), (0, 255, 255)),
    ((255, 105, 18), (0, 255, 255)),
    ((235, 58, 14), (0, 230, 255)),
    ((99, 32, 17), (0, 180, 255)),
    ((0, 0, 0), (0, 0, 255)),
    ((0, 0, 0), (0, 0, 255)),
    ((0, 0, 0), (0, 0, 255)),
    ((0, 0, 0), (0, 0, 255)),
]


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


def geometry():
    frame = []
    # Two folding A frames, a lower rack, and a suspended shallow fire bowl.
    for x, angle in ((-6.3, 7), (6.3, -7)):
        for z in (-5.1, 5.1):
            frame.append(box(x - 0.45, 0, z - 0.45, x + 0.45, 15.5, z + 0.45, 0, (x, 0, z), (0, 0, angle)))
            frame.append(box(x - 0.65, 0, z - 0.65, x + 0.65, 0.7, z + 0.65, 7))
    for z in (-5.1, 5.1):
        frame.append(box(-6.8, 3, z - 0.35, 6.8, 3.7, z + 0.35, 1))
        frame.append(box(-6.6, 11.2, z - 0.35, 6.6, 11.9, z + 0.35, 2))
    # The shallow lower shelf is visible below the bowl from the side.
    frame.append(box(-5.5, 3.6, -4.5, 5.5, 3.85, 4.5, 1))
    frame.append(box(-5.7, 3.6, -4.7, 5.7, 4.1, -4.2, 2))
    frame.append(box(-5.7, 3.6, 4.2, 5.7, 4.1, 4.7, 2))
    # Bright rolled lips and faceted sloping walls surround a dark hot basin.
    frame.append(box(-4.9, 7.6, -4.9, 4.9, 7.9, 4.9, 5))
    for width, y0, y1, slot in ((3.7, 7.8, 8.9, 4), (4.5, 8.9, 10.1, 1), (5.3, 10.1, 11.4, 0)):
        frame.append(box(-width, y0, -width, width, y1, -width + 0.45, slot))
        frame.append(box(-width, y0, width - 0.45, width, y1, width, slot))
        frame.append(box(-width, y0, -width, -width + 0.45, y1, width, slot))
        frame.append(box(width - 0.45, y0, -width, width, y1, width, slot))
    for z in (-5.5, 5.5):
        frame.append(box(-5.7, 11.4, z - 0.28, 5.7, 11.9, z + 0.28, 2))
    for x in (-5.5, 5.5):
        frame.append(box(x - 0.28, 11.4, -5.5, x + 0.28, 11.9, 5.5, 2))
    for x in (-3, 0, 3):
        frame.append(box(x - 0.15, 8, -3.4, x + 0.15, 8.15, 3.4, 3))
    # A small perforated wind plate and rear handle echo the supplied photos.
    frame.append(box(-4.6, 9.3, -5.5, 4.6, 10.2, -5.25, 6))
    for x in (-3.3, -1.1, 1.1, 3.3):
        frame.append(box(x - 0.12, 9.55, -5.75, x + 0.12, 9.8, -5.15, 3))
    frame.append(box(-1.8, 11.3, 5.6, 1.8, 11.65, 6.3, 2))
    embers = [
        box(-2.6, 8.1, -1.7, 2.6, 8.45, 1.7, 11),
        box(-1.7, 8.45, -0.7, 1.7, 8.75, 0.7, 9),
        box(-0.65, 8.75, -0.4, 0.65, 9.05, 0.4, 8),
    ]
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry.yasu_ride.fire_pit",
                "texture_width": SIZE,
                "texture_height": SIZE,
                "visible_bounds_width": 2,
                "visible_bounds_height": 2,
                "visible_bounds_offset": [0, 0.5, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 0, 0], "cubes": frame, "locators": {"flame": [0, 9, 0]}},
                {"name": "embers", "parent": "root", "pivot": [0, 0, 0], "cubes": embers},
            ],
        }],
    }


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
    set_doc = {"format_version": "1.16.100", "minecraft:texture_set": {"color": "fire_pit", "metalness_emissive_roughness": "fire_pit_mer"}}
    if args.check:
        if json.loads(geo.read_text()) != doc or json.loads(texture_set.read_text()) != set_doc or read_png(color) != pixels() or read_png(mer) != pixels(True):
            sys.exit("fire pit model, PBR maps, or texture set is stale; run pnpm model")
        return
    geo.parent.mkdir(parents=True, exist_ok=True)
    color.parent.mkdir(parents=True, exist_ok=True)
    geo.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    texture_set.write_text(json.dumps(set_doc, separators=(",", ":")) + "\n")
    write_png(color, pixels())
    write_png(mer, pixels(True))


if __name__ == "__main__":
    main()
