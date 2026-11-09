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
TOP_PX = 12
# The whole visible top, rim included, is usable: either one Dutch Oven or up to
# four Gas Lanterns in a two-by-two grid fit inside +-7.5 px (ADR 0240).
TOP_HALF = 7.5
TOP_LIMIT = 4
# Proportions measured on daining_table_whole.png: a thin woven panel in a slim
# steel frame, legs meeting the underside well inside the corners and splaying
# out to feet just inside the top's outline, joined by a ring a little above
# mid height.
PANEL_HALF = 7.1
PANEL_BOTTOM = 11.65
RIM_BOTTOM = 11.65
# Leg and ring placement from daining_table_whole.png: centers of the dark-pixel
# runs (RGB < 100), in image pixels. The top's left and right corners span
# x 35..410, so every horizontal offset is a fraction of that half diagonal,
# which is TOP_HALF * (cos + sin) of the camera azimuth. Outer legs stand on
# that same diagonal, so their offsets need no azimuth at all.
REF_WHOLE_TOP_HALF_SPAN = (410 - 35) / 2
REF_WHOLE_LEG_TOP_HALF_SPAN = (313 - 125) / 2  # Row 140, just under the top.
REF_WHOLE_LEG_BEND_HALF_SPAN = (290 - 142) / 2  # Narrowest point, rows 225..235.
REF_WHOLE_LEG_FOOT_HALF_SPAN = (357 - 81) / 2  # Left foot row 350, right foot row 383.
REF_WHOLE_INNER_LEG_TOP_SPAN = 250 - 177  # Front and back legs at row 140.
REF_WHOLE_RING_HALF_SPAN = (301 - 136) / 2  # Outer edge of the ring, row 220.
# The inner pair of legs projects by cos - sin and the outer pair by cos + sin.
REF_VIEW_AZIMUTH = 45 - math.degrees(math.atan(REF_WHOLE_INNER_LEG_TOP_SPAN / (2 * REF_WHOLE_LEG_TOP_HALF_SPAN)))
DIAGONAL_PROJECTION = math.cos(math.radians(REF_VIEW_AZIMUTH)) + math.sin(math.radians(REF_VIEW_AZIMUTH))
# A simultaneous fit to the close-up leg span and ring width contracts the
# whole-photo horizontal estimates; preserve the fixed host surface above.
LEG_PLAN_SCALE = 0.86
LEG_TOP_OFFSET = LEG_PLAN_SCALE * TOP_HALF * REF_WHOLE_LEG_TOP_HALF_SPAN / REF_WHOLE_TOP_HALF_SPAN
LEG_WAIST = LEG_PLAN_SCALE * TOP_HALF * REF_WHOLE_LEG_BEND_HALF_SPAN / REF_WHOLE_TOP_HALF_SPAN
LEG_FOOT_OFFSET = LEG_PLAN_SCALE * TOP_HALF * REF_WHOLE_LEG_FOOT_HALF_SPAN / REF_WHOLE_TOP_HALF_SPAN
RING_OUTER_RADIUS = LEG_PLAN_SCALE * TOP_HALF * DIAGONAL_PROJECTION * REF_WHOLE_RING_HALF_SPAN / REF_WHOLE_TOP_HALF_SPAN
# Perpendicular dark-pixel runs (RGB < 115) on ref_table_legs.png, at its
# native 924 by 828 resolution; the foreground tube spans rows 373..404.
REF_TOP_UNDERSIDE_Y = 65
REF_RING_CONTACT_Y = 385
REF_FOOT_Y = 807
REF_RING_OUTER_WIDTH = 677 - 215
REF_RING_OUTER_HEIGHT = 404 - 276
REF_TOP_DIAMETER = 24.1  # Normal to the axis through (342, 80), slope (14, 300).
REF_WAIST_DIAMETER = 32.1  # Same normal through (357, 330).
REF_FOOT_DIAMETER = 25.4  # Normal to the lower leg through (282, 800).
REF_RING_TUBE = 32.0  # Vertical normal through (450, 389).
REF_CAP_HEIGHT = 10  # Black run below the front tube, rows 802..811.
# Whole-photo front leg landmarks, not the more distant left leg used before.
REF_WHOLE_FRONT_TOP_Y = 130
REF_WHOLE_FRONT_RING_Y = 250
REF_WHOLE_FRONT_FOOT_Y = 410
PANEL_LEG_Y = RIM_BOTTOM
# Scale from the nearest leg's vertical span, not the ring's projected width:
# the fixed 15 by 15 by 12 model is wider than the photographed table.
# About 0.9 model px of the upper leg is hidden by the top in the matched view.
CLOSEUP_OCCLUDED_HEIGHT = 0.9
CLOSEUP_SCALE = (PANEL_LEG_Y - CLOSEUP_OCCLUDED_HEIGHT) / (REF_FOOT_Y - REF_TOP_UNDERSIDE_Y)
LEG_TOP_WIDTH = REF_TOP_DIAMETER * CLOSEUP_SCALE
LEG_WAIST_WIDTH = REF_WAIST_DIAMETER * CLOSEUP_SCALE
LEG_FOOT_WIDTH = REF_FOOT_DIAMETER * CLOSEUP_SCALE
FOOT_Y = LEG_FOOT_WIDTH / 2
# Camera projection includes the front foot's greater depth. Fitting both
# front-leg ratios (whole 120/280, close-up 320/742), including top occlusion,
# gives y=5.95: rendered ratios are 0.432 and 0.421 respectively.
RING_Y = 5.95
RING_HALF = REF_RING_TUBE * CLOSEUP_SCALE / 2
RING_RADIUS = RING_OUTER_RADIUS - RING_HALF
FOOT_CAP_HEIGHT = 1.5 * REF_CAP_HEIGHT * CLOSEUP_SCALE
TAPER_STEPS = 2
RING_SEGMENTS = 48
# Four overlapping rectangular prisms form an eight-sided tube cross-section.
TUBE_BARS = 4
# Sixteen repeats give the whole-photo top its fine square weave.
WEAVE_SIZE = 256
WEAVE_TILE = 16
TEXTURE_WIDTH = WEAVE_SIZE
TEXTURE_HEIGHT = WEAVE_SIZE + 8
STEEL = (64, 65, 68, 255)
STEEL_DARK = (52, 53, 56, 255)
FOOT_BLACK = (10, 10, 10, 255)
# Table-only neutral charcoal; other furniture retains PALETTE_BLACK.
TABLE_PALETTE = wicker.WeavePalette((40, 40, 40), (66, 66, 66), (25, 25, 25), (12, 12, 12),
                                    columns=4, rows=4)
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
    cubes.extend(tube(foot, cap_end, LEG_FOOT_WIDTH * 0.92, "legs", face(16)))
    return cubes


def ring():
    cubes = []
    for k in range(RING_SEGMENTS):
        a, b = k * math.tau / RING_SEGMENTS, (k + 1) * math.tau / RING_SEGMENTS
        start = (RING_RADIUS * math.cos(a), RING_Y, RING_RADIUS * math.sin(a))
        end = (RING_RADIUS * math.cos(b), RING_Y, RING_RADIUS * math.sin(b))
        cubes.extend(tube(start, end, 2 * RING_HALF, "ring"))
    return cubes


def geometry():
    panel = box((-PANEL_HALF, PANEL_BOTTOM, -PANEL_HALF), (PANEL_HALF, TOP_PX, PANEL_HALF), face(8))
    panel["uv"]["up"] = face(0, 0, WEAVE_SIZE)
    rim = [box((-TOP_HALF, RIM_BOTTOM, z0), (TOP_HALF, TOP_PX, z1))
           for z0, z1 in ((-TOP_HALF, -PANEL_HALF), (PANEL_HALF, TOP_HALF))]
    rim += [box((x0, RIM_BOTTOM, -PANEL_HALF), (x1, TOP_PX, PANEL_HALF))
            for x0, x1 in ((-TOP_HALF, -PANEL_HALF), (PANEL_HALF, TOP_HALF))]
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
