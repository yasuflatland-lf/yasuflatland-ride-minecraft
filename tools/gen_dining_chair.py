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
BACK_PIVOT = (0, 7.95, 3.4)
BACK_PANELS = 17
# The side photo shows the back's side edges about a quarter of the seat depth ahead of its centre.
BACK_WRAP = 2.0
BACK_RECLINE = -10
TILE_SIZE = 128
TEXTURE_WIDTH = 144
STEEL = (44, 44, 46, 255)
ASSEMBLIES = {
    "back": {"owner": "gen_dining_chair", "cubes": BACK_PANELS},
    "arms": {"owner": "gen_dining_chair", "cubes": 2},
}


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


def arm(start, end):
    dx, dy, dz = (b - a for a, b in zip(start, end))
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    yaw = math.degrees(math.atan2(dx, math.hypot(dy, dz)))
    lean = math.degrees(math.atan2(dy, dz))
    x, y, z = start
    part = box(x - 0.275, y - 0.275, z, x + 0.275, y + 0.275, z + length,
               pivot=start, rotation=(0, yaw, 0))
    return tilt.tilt_assembly([part], start, "x", lean,
                              assembly="arms", assemblies=ASSEMBLIES)[0]


def grounded(part):
    low = tilt.bounds([part])[0][1]
    part["origin"][1] -= low
    if "pivot" in part:
        part["pivot"][1] -= low
    return part


def back():
    parts = []
    step = 8.4 / BACK_PANELS
    for i in range(BACK_PANELS):
        x = -4.2 + (i + 0.5) * step
        ratio = x / 4.2
        z = 3.4 - BACK_WRAP * ratio ** 2
        top = 12.85 - 1.3 * ratio ** 2
        yaw = math.degrees(math.atan(2 * BACK_WRAP * x / 4.2 ** 2))
        width = step / math.cos(math.radians(yaw)) + 0.025
        part = box(x - width / 2, 7.95, z - 0.22,
                   x + width / 2, top, z + 0.22, True,
                   pivot=(x, 7.95, z), rotation=(0, yaw, 0))
        # Crop one continuous weave instead of repeating a whole tile per strip.
        woven = {"uv": [i * 128 / BACK_PANELS, (12.85 - top) * 128 / 4.9],
                 "uv_size": [128 / BACK_PANELS, (top - 7.95) * 128 / 4.9]}
        part["uv"] = {side: woven for side in panels.CUBE_SIDES}
        parts.append(part)
    return tilt.tilt_assembly(parts, BACK_PIVOT, "x", BACK_RECLINE,
                              assembly="back", assemblies=ASSEMBLIES)


def seat():
    parts = []
    strips = 16
    for i in range(strips):
        z0 = -4.4 + i * 8.6 / strips
        z1 = -4.4 + (i + 1) * 8.6 / strips
        half = 4.2 - 0.4 * i / (strips - 1)
        part = box(-half, SEAT_TOP - 0.4, z0, half, SEAT_TOP, z1, True)
        for side in ("up", "down"):
            part["uv"][side] = {"uv": [(4.2 - half) * 128 / 8.4, i * 128 / strips],
                                "uv_size": [half * 256 / 8.4, 128 / strips]}
        parts.append(part)
    return parts


def back_edge(part, side, top):
    points = tilt.corners(part)
    indices = (3, 7) if side == 1 else (2, 6)
    if not top:
        indices = tuple(i - 2 for i in indices)
    return tuple(sum(points[i][axis] for i in indices) / 2 for axis in range(3))


def cubes():
    parts = seat()
    woven_back = back()
    arms = []
    for side, panel in ((-1, woven_back[0]), (1, woven_back[-1])):
        bx, by, bz = back_edge(panel, side, True)
        _, _, bottom_z = back_edge(panel, side, False)
        x = side * 4.0
        post_height = 10.25 - 6.85
        front_x = side * 4.85
        post_angle = math.degrees(math.atan2(front_x - x, post_height))
        overhang = 0.3 / (bz + 4.1)
        arm_start = (front_x + (front_x - bx) * overhang,
                     10.25 - (by - 10.25) * overhang, -4.4)
        arms.append(arm(arm_start, (bx, by, bz)))
        parts.extend([
            grounded(box(x - 0.25, 0, -4.35, x + 0.25, 6.95, -3.85,
                pivot=(x, 6.95, -4.1), rotation=(0, 0, -side * 2))),
            grounded(tube(side * 3.8, (0, 4.15), (6.95, 3.7), 0.5)),
            tube(side * 3.95, (6.65, -4.2), (6.65, 3.95), 0.5),
            box(x - 0.275, 6.85, -4.375, x + 0.275,
                6.85 + math.hypot(front_x - x, post_height), -3.825,
                pivot=(x, 6.85, -4.1), rotation=(0, 0, post_angle)),
            tube(bx, (6.85, bottom_z), (by, bz), 0.4),
        ])
    for z, half in ((-4.15, 4.2), (3.85, 3.9)):
        parts.append(box(-half, 6.45, z - 0.25, half, 6.9, z + 0.25))
    parts.extend(arms)
    parts.extend(woven_back)
    tilt.assert_axes(parts, {"back": woven_back, "arms": arms}, ASSEMBLIES)
    return parts


def validate(parts):
    lo, hi = tilt.bounds(parts)
    if any(a < b - 1e-6 for a, b in zip(lo, (-5.4, 0, -5.2))) or any(
            a > b + 1e-6 for a, b in zip(hi, (5.4, 13, 5.2))):
        raise ValueError(f"Dining Chair exceeds its bounds: {lo}, {hi}")
    woven_back = parts[-BACK_PANELS:]
    arms = parts[-BACK_PANELS - 2:-BACK_PANELS]
    tilt.assert_axes(parts, {"back": woven_back, "arms": arms}, ASSEMBLIES)
    centre = tilt.corners(woven_back[BACK_PANELS // 2])
    if centre[2][2] <= centre[0][2]:
        raise ValueError("The back must lean toward +z")
    bottom, top = tilt.bounds(woven_back)
    if not 0.6 <= bottom[1] - SEAT_TOP <= 0.9:
        raise ValueError("The back must float 0.6 to 0.9 px above the seat")
    for side, part in ((-1, woven_back[0]), (1, woven_back[-1])):
        edge = back_edge(part, side, True)
        if edge[1] >= top[1] - 0.6 or edge[2] >= centre[2][2] - 0.8:
            raise ValueError("The back must arch upward and wrap forward at both sides")


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
    tile = wicker.weave_tile(replace(wicker.PALETTE_BLACK, columns=24, rows=40), TILE_SIZE, seed=1465)
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
