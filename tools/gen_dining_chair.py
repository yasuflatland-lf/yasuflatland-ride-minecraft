"""Generate the photo-based black woven Dining Chair (ADR 0240).

Units are pixels, 16 per block; the ground footprint centre is the origin,
with the front at -z (ADR 0009). --check compares JSON and decoded texels.
"""

import argparse
import math
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
tilt = load_tool("cube_tilt")
wicker = load_tool("wicker")
texture_io = load_tool("texture_io")

GEOMETRY = "models/entity/yasu_ride/dining_chair.geo.json"
TEXTURE = "textures/entity/yasu_ride/dining_chair.png"
IDENTIFIER = "geometry.yasu_ride.dining_chair"
SEAT_TOP = 7.2
BACK_PIVOT = (0, 8.7, 3.15)
BACK_RECLINE = -10
TILE_SIZE = 128
TEXTURE_WIDTH = 144
STEEL = (44, 44, 46, 255)
ASSEMBLIES = {"back": {"owner": "gen_dining_chair", "cubes": 3}}


def face(woven):
    return {"uv": [0, 0] if woven else [128, 0],
            "uv_size": [128, 128] if woven else [16, 16]}


def box(x0, y0, z0, x1, y1, z1, woven=False, pivot=None, rotation=None):
    return panels.panel(x0, y0, z0, x1, y1, z1, face(woven), pivot, rotation)


def tube(x, start, end, width=0.6):
    """A steel tube in a side plane; its centre line joins the measured endpoints."""
    y0, z0 = start
    y1, z1 = end
    length = math.hypot(y1 - y0, z1 - z0)
    angle = math.degrees(math.atan2(y1 - y0, z1 - z0))
    return box(x - width / 2, y0 - width / 2, z0,
               x + width / 2, y0 + width / 2, z0 + length,
               pivot=(x, y0, z0), rotation=(angle, 0, 0))


def back():
    # Wings wrap forward around the sitter before the whole back reclines.
    parts = [box(-3.2, 8.7, 3.15, 3.2, 12.7, 3.7, True)]
    for side in (-1, 1):
        x0, x1 = (3.15, 4.45) if side == 1 else (-4.45, -3.15)
        parts.append(box(x0, 8.7, 3.15, x1, 12.7, 3.7, True,
                         pivot=(side * 3.15, 8.7, 3.15), rotation=(0, side * 35, 0)))
    return tilt.tilt_assembly(parts, BACK_PIVOT, "x", BACK_RECLINE,
                              assembly="back", assemblies=ASSEMBLIES)


def cubes():
    parts = [box(-4.2, 6.3, -4.4, 4.2, SEAT_TOP, 4.2, True)]
    for side in (-1, 1):
        x, ax = side * 4.4, side * 4.95
        parts.extend([
            box(x - 0.25, 0, -4.45, x + 0.25, 6.4, -3.95),
            tube(x, (0.15, 4.2), (6.6, 3.7), 0.5),
            box(x - 0.3, 5.95, -4.4, x + 0.3, 6.45, 3.9),
            # The front post bows outward above the seat so the arms stand clear of the back.
            box(min(x, ax) - 0.25, 6.0, -4.45, max(x, ax) + 0.25, 6.5, -3.95),
            box(ax - 0.25, 6.0, -4.45, ax + 0.25, 10.2, -3.95),
            box(min(x, ax) - 0.25, 5.95, 3.7, max(x, ax) + 0.25, 6.45, 4.2),
            tube(ax, (10.2, -4.2), (12.1, 3.8), 0.55),
            tube(ax, (9.9, -4.85), (11.2, 3.1), 0.55),
            tube(ax, (9.87, -5.02), (9.9, -4.85), 0.32),
            tube(ax, (6.45, 3.95), (12.1, 3.8), 0.45),
        ])
    for z in (-4.15, 3.85):
        parts.append(box(-4.15, 5.95, z - 0.25, 4.15, 6.4, z + 0.25))
    woven_back = back()
    parts.extend(woven_back)
    tilt.assert_axes(parts, {"back": woven_back}, ASSEMBLIES)
    return parts


def validate(parts):
    lo, hi = tilt.bounds(parts)
    if any(a < b - 1e-6 for a, b in zip(lo, (-5.4, 0, -5.2))) or any(
            a > b + 1e-6 for a, b in zip(hi, (5.4, 13, 5.2))):
        raise ValueError(f"Dining Chair exceeds its bounds: {lo}, {hi}")
    centre = next(c for c in parts if c.get("rotation") and c["uv"]["north"] == face(True))
    points = tilt.corners(centre)
    if points[2][2] <= points[0][2]:
        raise ValueError("The back must lean toward +z")


def geometry():
    parts = cubes()
    validate(parts)
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": IDENTIFIER, "texture_width": TEXTURE_WIDTH,
                        "texture_height": TILE_SIZE, "visible_bounds_width": 2,
                        "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.5, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0], "cubes": parts}],
    }]}


def texture_pixels():
    # The closeup shows many narrow horizontal ribbons across the back.
    tile = wicker.weave_tile(replace(wicker.PALETTE_BLACK, columns=12, rows=24), TILE_SIZE, seed=1465)
    return [row + [STEEL] * 16 for row in tile]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry())
    pixels = texture_pixels()
    out.png(args.resource_pack / TEXTURE, TEXTURE_WIDTH, TILE_SIZE, lambda x, y: pixels[y][x])
    out.finish("Dining Chair outputs are stale; run `pnpm model`:",
               "Dining Chair model and texture are up to date")


if __name__ == "__main__":
    main()
