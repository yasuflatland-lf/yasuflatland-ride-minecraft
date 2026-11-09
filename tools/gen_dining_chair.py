"""Generate the photo-based black woven Dining Chair (ADR 0240).

Units are pixels, 16 per block; the ground footprint centre is the origin,
with the front at -z (ADR 0009). --check compares JSON and decoded texels.
"""

import argparse
import math
import sys
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
BACK_PANELS = 49
BACK_BOTTOM = 8.25
BACK_TOP = 12.85
# The side photo puts the back's lower edge on the seat's rear edge, with an open gap above the seat.
BACK_BASE_Z = 4.2
BACK_THICKNESS = 0.3
# Side photo: the back's centre line rises 345 px while running 140 px behind the seat (22 degrees);
# its side edges stand almost upright above the seat's rear corners, which gives the wedge profile.
BACK_LEAN = 22
# Front photo: the side edges sit about 0.4 px ahead of the centre at the bottom.
BACK_BOTTOM_WRAP = 0.4
# Front photo: the top edge falls 28 px of the back's 225 px height (about 1 px) from the centre to
# the corners, mostly as an even arc that rounds off into the arm tubes at the very ends.
BACK_ARCH_DROP = 0.6
BACK_CORNER_DROP = 0.4
TILE_SIZE = 128
TEXTURE_WIDTH = 144
STEEL = (38, 38, 38, 255)
TUBE_WIDTH = 0.33
ASSEMBLIES = {
    "back": {"owner": "gen_dining_chair", "cubes": BACK_PANELS},
    "arms": {"owner": "gen_dining_chair", "cubes": 10},
}


def face(woven):
    return {"uv": [0, 0] if woven else [128, 0],
            "uv_size": [128, 128] if woven else [16, 16]}


def box(x0, y0, z0, x1, y1, z1, woven=False, pivot=None, rotation=None):
    return panels.panel(x0, y0, z0, x1, y1, z1, face(woven), pivot, rotation)


def arm(start, end):
    dx, dy, dz = (b - a for a, b in zip(start, end))
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    yaw = math.degrees(math.atan2(dx, math.hypot(dy, dz)))
    lean = math.degrees(math.atan2(dy, dz))
    x, y, z = start
    half = TUBE_WIDTH / 2
    # Extend each tube into its neighbour so angled joints cannot leave a gap.
    part = box(x - half, y - half, z - half, x + half, y + half, z + length + half,
               pivot=start, rotation=(0, yaw, 0))
    return tilt.tilt_assembly([part], start, "x", lean,
                              assembly="arms", assemblies=ASSEMBLIES)[0]


def grounded(part):
    low = tilt.bounds([part])[0][1]
    part["origin"][1] -= low
    if "pivot" in part:
        part["pivot"][1] -= low
    return part


def back_top(ratio):
    return BACK_TOP - BACK_ARCH_DROP * ratio ** 2 - BACK_CORNER_DROP * ratio ** 8


def back():
    parts = []
    step = 8.4 / BACK_PANELS
    rise = BACK_TOP - BACK_BOTTOM
    overhang = rise * math.tan(math.radians(BACK_LEAN))
    for i in range(BACK_PANELS):
        x = -4.2 + (i + 0.5) * step
        ratio = x / 4.2
        z = BACK_BASE_Z - BACK_BOTTOM_WRAP * ratio ** 2
        top = back_top(ratio)
        lean = math.atan(overhang * (1 - ratio ** 2) / rise)
        # Follow the curve at mid-height, where the bottom wrap and the leaning top average out.
        yaw = math.degrees(math.atan((BACK_BOTTOM_WRAP + overhang / 2) * 2 * x / 4.2 ** 2))
        width = step / math.cos(math.radians(yaw)) + 0.04
        length = (top - BACK_BOTTOM) / math.cos(lean)
        part = box(x - width / 2, BACK_BOTTOM, z - BACK_THICKNESS / 2,
                   x + width / 2, BACK_BOTTOM + length, z + BACK_THICKNESS / 2, True,
                   pivot=(x, BACK_BOTTOM, z), rotation=(0, yaw, 0))
        # Crop one continuous weave instead of repeating a whole tile per strip.
        woven = {"uv": [i * 128 / BACK_PANELS, (BACK_TOP - top) * 128 / rise],
                 "uv_size": [128 / BACK_PANELS, (top - BACK_BOTTOM) * 128 / rise]}
        part["uv"] = {side: woven for side in panels.CUBE_SIDES}
        parts.extend(tilt.tilt_assembly([part], (x, BACK_BOTTOM, z), "x", -math.degrees(lean),
                                        assembly="back", assemblies=ASSEMBLIES))
    return parts


def seat():
    parts = []
    strips = 48
    for i in range(strips):
        z0 = -4.4 + i * 8.6 / strips
        z1 = -4.4 + (i + 1) * 8.6 / strips
        half = 4.2
        if i < 4:
            half -= 0.45 * (1 - i / 4) ** 2
        # The rear edge follows the back's curved lower edge, so the seat reaches the back everywhere.
        reach = (BACK_BASE_Z + 0.05 - (z0 + z1) / 2) / BACK_BOTTOM_WRAP
        half = min(half, 4.2 * math.sqrt(max(0.04, reach)))
        part = box(-half, SEAT_TOP - 0.3, z0, half, SEAT_TOP, z1, True)
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
        back_top = back_edge(panel, side, True)
        back_bottom = back_edge(panel, side, False)
        front = (side * 4.85, 9.9, -4.1)
        seat_joint = (side * 4.0, SEAT_TOP - 0.15, -4.1)
        arms.extend([
            arm(back_top, front),
            arm(front, seat_joint),
            grounded(arm(seat_joint, (side * 4.35, 0.18, -4.35))),
            grounded(arm(back_bottom, (side * 4.45, 0.18, 5.0))),
            arm(back_bottom, back_top),
        ])
    parts.extend(arms)
    parts.extend(woven_back)
    tilt.assert_axes(parts, {"back": woven_back, "arms": arms}, ASSEMBLIES)
    return parts


def validate(parts):
    lo, hi = tilt.bounds(parts)
    if any(a < b - 1e-6 for a, b in zip(lo, (-5.4, 0, -6.4))) or any(
            a > b + 1e-6 for a, b in zip(hi, (5.4, 13, 6.4))):
        raise ValueError(f"Dining Chair exceeds its bounds: {lo}, {hi}")
    woven_back = parts[-BACK_PANELS:]
    arms = parts[-BACK_PANELS - ASSEMBLIES["arms"]["cubes"]:-BACK_PANELS]
    tilt.assert_axes(parts, {"back": woven_back, "arms": arms}, ASSEMBLIES)
    centre = tilt.corners(woven_back[BACK_PANELS // 2])
    if centre[2][2] <= centre[0][2]:
        raise ValueError("The back must lean toward +z")
    bottom, top = tilt.bounds(woven_back)
    if not 0.95 <= bottom[1] - SEAT_TOP <= 1.15:
        raise ValueError("The back must float 0.95 to 1.15 px above the seat")
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
    palette = wicker.WeavePalette((36, 36, 36), (65, 65, 65), (22, 22, 22), (10, 10, 10),
                                  columns=16, rows=28)
    tile = wicker.weave_tile(palette, TILE_SIZE, seed=1465)
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
