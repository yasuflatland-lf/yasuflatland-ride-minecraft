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
# The whole-photo frame is about 9 px deep against a 280 px front leg;
# retain the established tabletop and hosting surface dimensions.
PANEL_HALF = 7.1
PANEL_BOTTOM = 11.65
RIM_BOTTOM = 11.65
# Whole-photo top corners (34,83), (284,66), (410,107), (136,128).
# A perspective square fit gives azimuth 23.62 degrees, not the leg-derived
# azimuth: the bent legs are not reliable camera calibration landmarks.
REF_VIEW_AZIMUTH = 23.62
DIAGONAL_PROJECTION = math.cos(math.radians(REF_VIEW_AZIMUTH)) + math.sin(math.radians(REF_VIEW_AZIMUTH))
# Measured on daining_table_whole.png: the outer legs meet the top 55..90 px
# inside its 348 px projected corners; the midpoint sets the leg tops.
REF_TOP_SPAN = 348
REF_TOP_OVERHANG = (55 + 90) / 2
LEG_TOP_OFFSET = TOP_HALF * (1 - 2 * REF_TOP_OVERHANG / REF_TOP_SPAN)
# Ring outer width and foot spread on daining_table_whole.png, as fractions
# of the projected tabletop width.
REF_RING_TOP_RATIO = 0.49
REF_FOOT_TOP_RATIO = 0.81
LEG_FOOT_OFFSET = TOP_HALF * REF_FOOT_TOP_RATIO
RING_OUTER_RADIUS = TOP_HALF * DIAGONAL_PROJECTION * REF_RING_TOP_RATIO
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
# The close-up foreground waist is 320/742 down the exposed leg. With
# the wider ring and top occlusion, y=5.60 approximates that projected fraction;
# the ring is about 45 percent of the physical leg height above the floor.
RING_Y = 5.60
RING_HALF = REF_RING_TUBE * CLOSEUP_SCALE / 2
RING_RADIUS = RING_OUTER_RADIUS - RING_HALF
# Each kink meets the ring centerline at a diagonal of its circular plan.
LEG_WAIST = RING_RADIUS / math.sqrt(2)
# The close-up black tip is about 20 px across versus a 25.4 px tube end.
FOOT_CAP_WIDTH_RATIO = 20 / REF_FOOT_DIAMETER
FOOT_CAP_HEIGHT = REF_CAP_HEIGHT * CLOSEUP_SCALE
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
APRON_DEPTH = (2 / 9) * (TOP_PX - RIM_BOTTOM)
APRON_CORNER_DROP = (2 / 9) * (TOP_PX - RIM_BOTTOM)
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
