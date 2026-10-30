"""Generate the folding camp table's model and wood-grain texture."""

import argparse
import json
import math
import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")
texel_reader = texture_io.texel_reader

SIZE = 64
GEOMETRY = "models/entity/yasu_ride/camp_table.geo.json"
TEXTURE = "textures/entity/yasu_ride/camp_table.png"


def face(x, y, w=4, h=4):
    return {"uv": [x, y], "uv_size": [w, h]}


def cube(origin, size, swatch, rotation=None):
    result = {"origin": origin, "size": size, "uv": {side: face(*swatch) for side in ("north", "south", "east", "west", "up", "down")}}
    if rotation:
        result["pivot"], result["rotation"] = list(rotation[0]), rotation[1]
    return result


def geometry():
    top = cube([-15, 11.5, -6], [30, 0.75, 12], (0, 32))
    top["uv"]["up"] = face(0, 0, 60, 24)
    top["uv"]["down"] = face(0, 0, 60, 24)
    parts = [top]
    for z in (-4.7, 4.7):
        parts.append(cube([-13, 10.7, z - 0.4], [26, 0.8, 0.8], (0, 36)))
    for x in (-12.5, 12.5):
        for angle in (-34, 34):
            parts.append(cube([x - 0.5, -0.7, -0.5], [1, 12.4, 1], (0, 36), ((x, 5.5, 0), [angle, 0, 0])))
        parts.append(cube([x - 0.7, 5.4, -0.7], [1.4, 1.4, 1.4], (4, 36)))
        for z in (-3.6, 3.6):
            parts.append(cube([x - 0.75, 0, z - 0.6], [1.5, 0.7, 1.2], (4, 36)))
    return {"format_version": "1.12.0", "minecraft:geometry": [{"description": {"identifier": "geometry.yasu_ride.camp_table", "texture_width": SIZE, "texture_height": SIZE, "visible_bounds_width": 2.5, "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.5, 0]}, "bones": [{"name": "root", "pivot": [0, 0, 0], "cubes": parts}]}]}


def pixels():
    data = bytearray()
    for y in range(SIZE):
        for x in range(SIZE):
            if y < 24:
                grain = 7 * math.sin(y * 0.8 + x * 0.12) + 3 * math.sin(y * 2.1 - x * 0.08)
                fleck = -20 if (x * 31 + y * 17) % 107 == 0 else 0
                color = (int(205 + grain + fleck), int(162 + grain + fleck), int(111 + grain + fleck), 255)
            elif y < 36:
                color = (184, 137, 88, 255)
            else:
                color = (26, 27, 28, 255) if x < 4 else (44, 45, 46, 255)
            data.extend(color)
    return bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    geo = args.resource_pack / GEOMETRY
    texture = args.resource_pack / TEXTURE
    out = texture_io.Outputs(args.check)
    out.json(geo, json.dumps(geometry(), separators=(",", ":")) + "\n")
    out.png(texture, SIZE, SIZE, texel_reader(SIZE, pixels()), compress_level=9)
    out.finish("camp table model or texture is stale; run pnpm model", None)


if __name__ == "__main__":
    main()
