"""Generate the black woven Dining Table with waisted tubular legs and a round brace."""
import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
tilt = load_tool("cube_tilt")
texture_io = load_tool("texture_io")
wicker = load_tool("wicker")
# daining_table_whole.png outer top corners, clockwise from the left.
REF_TOP_CORNERS = ((34, 83), (284, 66), (410, 107), (136, 128))
# Square pinhole fit with the established azimuth: corner RMS error 0.081 px.
REF_VIEW_AZIMUTH = 23.62
REF_VIEW_ELEVATION = 9.42954
REF_CAMERA_DISTANCE_WIDTHS = 8.00566
# daining_table_whole.png floor contacts, in the same order as the corners.
REF_FLOOR_CONTACTS = ((80, 354), (270, 333), (358, 385), (154, 410))
# Joint fit of height and square foot spread through the calibrated camera.
# Coordinate RMS error is 1.74 image px; hand-picked edges limit precision.
REF_WIDTH_HEIGHT_RATIO = 1 / 0.995573
REF_FOOT_TOP_RATIO = 0.759703
TOP_PX = 12
# Round the fitted 6.027 px half-size to a model pixel; width/height error <0.5%.
TOP_HALF = round(TOP_PX * REF_WIDTH_HEIGHT_RATIO) / 2
# A 12 px square fits one 11.5 by 10 px oven or one 7.5 by 6.5 px lantern.
TOP_LIMIT = 1
# daining_table_whole.png front rim spans y=128..137; calibrated vertical
# projection at that corner gives approximately 0.030 of the table height.
REF_FRONT_RIM_Y = (128, 137)
REF_RIM_HEIGHT_RATIO = 0.030
RIM_DEPTH = TOP_PX * REF_RIM_HEIGHT_RATIO
RIM_BOTTOM = TOP_PX - RIM_DEPTH
PANEL_BOTTOM = RIM_BOTTOM
# daining_table_zoom.png front steel strip is approximately as wide as deep.
REF_RIM_WIDTH_DEPTH_RATIO = 1.0
PANEL_HALF = TOP_HALF - RIM_DEPTH * REF_RIM_WIDTH_DEPTH_RATIO
# daining_table_whole.png upper attachments sit 55..90 px inside the
# 348 px underside span; retain their mean normalized plan inset.
REF_TOP_SPAN = 348
REF_TOP_OVERHANG = (55 + 90) / 2
LEG_TOP_OFFSET = TOP_HALF * (1 - 2 * REF_TOP_OVERHANG / REF_TOP_SPAN)
LEG_FOOT_OFFSET = TOP_HALF * REF_FOOT_TOP_RATIO
# daining_table_whole.png ring centerline bounds x=133..299, y=217..253.
# Fitting a horizontal circle through the same camera gives radius/width
# 0.293337 and a drop below the top of 0.501818 tabletop widths.
REF_RING_CENTERLINE_BOUNDS = (133, 299, 217, 253)
REF_RING_DIAMETER_TOP_RATIO = 2 * 0.293337
REF_RING_DROP_TOP_RATIO = 0.501818
RING_RADIUS = TOP_HALF * REF_RING_DIAMETER_TOP_RATIO
RING_Y = TOP_PX - 2 * TOP_HALF * REF_RING_DROP_TOP_RATIO
# ref_table_legs.png perpendicular dark runs: upper tube through (342,80),
# waist through (357,330), foot through (282,800), ring through (450,389).
REF_TOP_DIAMETER = 24.1
REF_WAIST_DIAMETER = 32.1
REF_FOOT_DIAMETER = 25.4
REF_RING_TUBE = 32.0
# ref_table_legs.png front tabletop upper edge near y=40 and cap at y=811
# give the local vertical height scale for those perpendicular tube samples.
REF_CLOSEUP_TOP_Y = 40
REF_CLOSEUP_FLOOR_Y = 811
REF_CLOSEUP_HEIGHT = REF_CLOSEUP_FLOOR_Y - REF_CLOSEUP_TOP_Y
REF_LEG_HEIGHT_RATIO = REF_TOP_DIAMETER / REF_CLOSEUP_HEIGHT
LEG_TOP_WIDTH = TOP_PX * REF_LEG_HEIGHT_RATIO
LEG_WAIST_WIDTH = TOP_PX * REF_WAIST_DIAMETER / REF_CLOSEUP_HEIGHT
LEG_FOOT_WIDTH = TOP_PX * REF_FOOT_DIAMETER / REF_CLOSEUP_HEIGHT
RING_HALF = TOP_PX * REF_RING_TUBE / REF_CLOSEUP_HEIGHT / 2
RING_OUTER_RADIUS = RING_RADIUS + RING_HALF
FOOT_Y = LEG_FOOT_WIDTH / 2
PANEL_LEG_Y = RIM_BOTTOM
LEG_WAIST = RING_RADIUS / math.sqrt(2)
# ref_table_legs.png black cap is 20 px wide and rows 802..811 (10 px) tall.
REF_CAP_WIDTH = 20
REF_CAP_HEIGHT = 10
FOOT_CAP_WIDTH_RATIO = REF_CAP_WIDTH / REF_FOOT_DIAMETER
FOOT_CAP_HEIGHT = TOP_PX * REF_CAP_HEIGHT / REF_CLOSEUP_HEIGHT
TAPER_STEPS = 4
RING_SEGMENTS = 48
# Four overlapping rectangular prisms form an eight-sided tube cross-section.
TUBE_BARS = 4
# Twelve repeats resolve the checker visible in daining_table_zoom.png.
WEAVE_SIZE = 288
WEAVE_TILE = 24
TEXTURE_WIDTH = WEAVE_SIZE
TEXTURE_HEIGHT = WEAVE_SIZE + 8
STEEL = (64, 65, 68, 255)
STEEL_DARK = (52, 53, 56, 255)
FOOT_BLACK = (10, 10, 10, 255)
# Charcoal strand highlights and shaded gaps from daining_table_texture_closeup.png;
# slightly lifted for preview face lighting, without changing the shared palette.
TABLE_PALETTE = wicker.WeavePalette((55, 59, 59), (76, 81, 81), (39, 43, 43), (25, 29, 29),
                                    columns=4, rows=4)
# The whole photo has a 2..4 px apron lip below its roughly 9 px rim.
REF_APRON_RIM_RATIO = 2 / 9
APRON_DEPTH = REF_APRON_RIM_RATIO * (TOP_PX - RIM_BOTTOM)
APRON_CORNER_DROP = REF_APRON_RIM_RATIO * (TOP_PX - RIM_BOTTOM)
APRON_SEGMENTS = 6
# The top zoom shows the recessed lip at roughly one third of the rim width.
APRON_THICKNESS = (TOP_HALF - PANEL_HALF) / 3

ASSEMBLIES = {
    "legs": {"owner": "dining_table", "cubes": 4 * (TAPER_STEPS + 2) * TUBE_BARS},
    "ring": {"owner": "dining_table", "cubes": RING_SEGMENTS * TUBE_BARS},
}
GEOMETRY = "models/entity/yasu_ride/dining_table.geo.json"
TEXTURE = "textures/entity/yasu_ride/dining_table.png"


def face(u=0, v=WEAVE_SIZE, size=8):
    return {"uv": [u, v], "uv_size": [size, size]}


def box(lo, hi, swatch=None):
    return panels.panel(*lo, *hi, swatch or face())


def r4(value):
    return round(value, 4)


def tube(start, end, width, assembly, swatch=None):
    """Eight-sided tube, aligned along the measured axis without square corners."""
    dx, dy, dz = [end[i] - start[i] for i in range(3)]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    half = width / 2
    narrow = half * math.tan(math.pi / 8)
    cubes = []
    for bar in range(TUBE_BARS):
        hx, hz = half, narrow
        # Tangent segments must overlap at their outer edge too, otherwise the
        # ring shows a dark end face at every polygon corner.
        overlap = half * math.tan(math.pi / RING_SEGMENTS) if assembly == "ring" else 0.008
        cube = box((-hx, -overlap, -hz), (hx, length + overlap, hz), swatch)
        cube.update(pivot=[0, 0, 0], rotation=[0, bar * 45, math.degrees(math.atan2(dx, math.hypot(dy, dz)))])
        cube = tilt.tilt_assembly([cube], (0, 0, 0), "x", -math.degrees(math.atan2(dz, dy)),
                                  assembly=assembly, assemblies=ASSEMBLIES)[0]
        for key in ("origin", "pivot"):
            cube[key] = [r4(cube[key][i] + start[i]) for i in range(3)]
        cubes.append(cube)
    return cubes


def leg(sx, sz):
    foot = (sx * LEG_FOOT_OFFSET, FOOT_Y, sz * LEG_FOOT_OFFSET)
    waist = (sx * LEG_WAIST, RING_Y, sz * LEG_WAIST)
    top = (sx * LEG_TOP_OFFSET, PANEL_LEG_Y, sz * LEG_TOP_OFFSET)
    cubes = []
    cap_end = tuple(foot[j] + (waist[j] - foot[j]) * FOOT_CAP_HEIGHT / (RING_Y - FOOT_Y)
                    for j in range(3))
    for i in range(TAPER_STEPS):
        a, b = i / TAPER_STEPS, (i + 1) / TAPER_STEPS
        p = tuple(cap_end[j] + (waist[j] - cap_end[j]) * a for j in range(3))
        q = tuple(cap_end[j] + (waist[j] - cap_end[j]) * b for j in range(3))
        width = LEG_FOOT_WIDTH + (LEG_WAIST_WIDTH - LEG_FOOT_WIDTH) * (a + b) / 2
        cubes.extend(tube(p, q, width, "legs"))
    # One unbroken upper tube avoids the old four visible sleeve joints.
    cubes.extend(tube(waist, top, LEG_TOP_WIDTH, "legs"))
    cubes.extend(tube(foot, cap_end, LEG_FOOT_WIDTH * FOOT_CAP_WIDTH_RATIO, "legs", face(16)))
    return cubes


def ring():
    cubes = []
    for k in range(RING_SEGMENTS):
        a, b = k * math.tau / RING_SEGMENTS, (k + 1) * math.tau / RING_SEGMENTS
        start = (RING_RADIUS * math.cos(a), RING_Y, RING_RADIUS * math.sin(a))
        end = (RING_RADIUS * math.cos(b), RING_Y, RING_RADIUS * math.sin(b))
        cubes.extend(tube(start, end, 2 * RING_HALF, "ring"))
    return cubes


def apron():
    cubes = []
    for i in range(APRON_SEGMENTS):
        a = -TOP_HALF + 2 * TOP_HALF * i / APRON_SEGMENTS
        b = -TOP_HALF + 2 * TOP_HALF * (i + 1) / APRON_SEGMENTS
        depth = APRON_DEPTH + APRON_CORNER_DROP * (abs((a + b) / 2) / TOP_HALF) ** 2
        for side in (-1, 1):
            edge = side * (TOP_HALF - APRON_THICKNESS / 2)
            cubes.append(box((a, RIM_BOTTOM - depth, edge - APRON_THICKNESS / 2),
                             (b, RIM_BOTTOM, edge + APRON_THICKNESS / 2)))
            cubes.append(box((edge - APRON_THICKNESS / 2, RIM_BOTTOM - depth, a),
                             (edge + APRON_THICKNESS / 2, RIM_BOTTOM, b)))
    return cubes


def geometry():
    panel = box((-PANEL_HALF, PANEL_BOTTOM, -PANEL_HALF), (PANEL_HALF, TOP_PX, PANEL_HALF), face(8))
    panel["uv"]["up"] = face(0, 0, WEAVE_SIZE)
    rim = [box((-TOP_HALF, RIM_BOTTOM, z0), (TOP_HALF, TOP_PX, z1))
           for z0, z1 in ((-TOP_HALF, -PANEL_HALF), (PANEL_HALF, TOP_HALF))]
    rim += [box((x0, RIM_BOTTOM, -PANEL_HALF), (x1, TOP_PX, PANEL_HALF))
            for x0, x1 in ((-TOP_HALF, -PANEL_HALF), (PANEL_HALF, TOP_HALF))]
    rim += apron()
    legs = [cube for sx in (-1, 1) for sz in (-1, 1) for cube in leg(sx, sz)]
    tubes = ring()
    tilt.assert_axes([panel, *rim, *legs, *tubes], {"legs": legs, "ring": tubes}, ASSEMBLIES)
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.dining_table", "texture_width": TEXTURE_WIDTH,
                        "texture_height": TEXTURE_HEIGHT, "visible_bounds_width": 1.5,
                        "visible_bounds_height": 1.5, "visible_bounds_offset": [0, 0.5, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0]},
                  {"name": "top", "parent": "root", "pivot": [0, 0, 0], "cubes": [panel, *rim]},
                  {"name": "legs", "parent": "root", "pivot": [0, 0, 0], "cubes": legs},
                  {"name": "ring", "parent": "root", "pivot": [0, RING_Y, 0], "cubes": tubes}]}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    tile = wicker.weave_tile(TABLE_PALETTE, WEAVE_TILE)

    def pixel(x, y):
        if y < WEAVE_SIZE:
            return tile[y % WEAVE_TILE][x % WEAVE_TILE]
        return STEEL if x < 8 else STEEL_DARK if x < 16 else FOOT_BLACK
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry(), separators=(",", ":"))
    out.png(args.resource_pack / TEXTURE, TEXTURE_WIDTH, TEXTURE_HEIGHT, pixel, compress_level=9)
    out.finish("Dining Table outputs are stale. Run pnpm model:", "Dining Table model and texture are up to date")


if __name__ == "__main__":
    main()
