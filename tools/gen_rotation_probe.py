"""Generate the standalone dev-only rotation probe assets."""

import json
import re
import struct
import zlib
from pathlib import Path

from cube_tilt import apply_matrix, assert_axes, cube_matrix

ROOT = Path(__file__).resolve().parents[1] / "packs/yasu_ride_test_rp"
ASSEMBLIES = {"comparisons": {"owner": "rotation_probe", "cubes": 3}}
FACES = ("north", "south", "east", "west", "up", "down")
CASES = [([35, 40, 0], 1, 0), ([30, 0, 45], 2, 0), ([0, 35, -40], 2, 1)]


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def main():
    bones = [{"name": "root", "pivot": [0, 0, 0]}]
    compounds = []
    for index, (rotation, outer, inner) in enumerate(CASES):
        pivot = [-30 + index * 24, 24, 0]
        ref_pivot = [pivot[0] + 12, pivot[1], pivot[2]]
        offset = [-4, -2, -1]
        compound = {"origin": [pivot[i] + offset[i] for i in range(3)],
                    "size": [8, 4, 2], "pivot": pivot, "rotation": rotation, "uv": {face: {"uv": [0, 0], "uv_size": [1, 1]} for face in FACES}}
        compounds.append(compound)
        outer_rotation = [rotation[i] if i == outer else 0 for i in range(3)]
        inner_rotation = [rotation[i] if i == inner else 0 for i in range(3)]
        target = apply_matrix(cube_matrix(rotation), offset)
        inverse_outer = cube_matrix([-v for v in outer_rotation])
        inverse_inner = cube_matrix([-v for v in inner_rotation])
        reference_offset = apply_matrix(inverse_inner, apply_matrix(inverse_outer, target))
        reference = {"origin": [round(ref_pivot[i] + reference_offset[i], 6) for i in range(3)],
                     "size": [8, 4, 2], "pivot": ref_pivot, "rotation": inner_rotation, "uv": {face: {"uv": [24, 0], "uv_size": [1, 1]} for face in FACES}}
        bones.extend([
            {"name": f"compound_{index}", "parent": "root", "pivot": pivot, "cubes": [compound]},
            {"name": f"reference_{index}", "parent": "root", "pivot": ref_pivot,
             "rotation": outer_rotation, "cubes": [reference]},
        ])
    assert_axes([cube for bone in bones for cube in bone.get("cubes", [])],
                {"comparisons": compounds}, ASSEMBLIES)
    geo = {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride_test.rotation_probe", "texture_width": 32,
                        "texture_height": 16, "visible_bounds_width": 6, "visible_bounds_height": 4,
                        "visible_bounds_offset": [0, 1.5, 0]}, "bones": bones}]}
    encoded = json.dumps(geo, indent=2)
    encoded = re.sub(r"\[\n\s*(-?\d+(?:\.\d+)?(?:,\n\s*-?\d+(?:\.\d+)?)*)\n\s*\]",
                     lambda match: "[" + re.sub(r"\s+", " ", match.group(1)) + "]", encoded)
    output = ROOT / "models/entity/yasu_ride_test/rotation_probe.geo.json"
    output.write_text(encoded + "\n")
    rows = b"".join(b"\0" + b"".join(bytes((230, 55, 45, 255) if x < 16 else (45, 130, 240, 255))
                                     for x in range(32)) for _ in range(16))
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 16, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))
    (ROOT / "textures/entity/yasu_ride_test/rotation_probe.png").write_bytes(png)


if __name__ == "__main__":
    main()
