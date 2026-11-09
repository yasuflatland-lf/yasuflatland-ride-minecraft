"""Generate the teak Beach Chair, with a hinged backrest and folding steel prop.

The origin is ground level at the boundary between the two occupied cells.
-z is the foot end; +z is the head end. Dimensions are model pixels (16 per block).
"""
import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
tilt = load_tool("cube_tilt")
texture_io = load_tool("texture_io")
TOP_PX = 7
TABLE_TOP_PX = 16
TABLE_SLAT_BOTTOM = TABLE_TOP_PX - 0.8
TABLE_RAIL_BOTTOM = TABLE_SLAT_BOTTOM - 1.6
HALF = (6, 16)
BED_OUTLINE = (-6, 6, -16, 16)
SEAT_OFFSET = (0, TOP_PX / 16, 2 / 16)
HINGE = (0, TOP_PX, 3)
BACKREST_ANGLE = 37
BACKREST_LENGTH = 12.8
BACKREST_SLAT_COUNT = 12
BACKREST_SLAT_GAP = 0.18
BACKREST_SLAT_WIDTH = (11.16 - (BACKREST_SLAT_COUNT - 1) * BACKREST_SLAT_GAP) / BACKREST_SLAT_COUNT
REAR_RAIL_BOTTOM = 5.1
REAR_RAIL_TOP = 6.2
REAR_RAIL_WIDTH = 1
PROP_ATTACHMENT = 0.4
PROP_PIVOT = (0, (REAR_RAIL_BOTTOM + REAR_RAIL_TOP) / 2, 15.4)
PROP_START = (0,
              TOP_PX - 0.06 * math.cos(math.radians(BACKREST_ANGLE))
              + BACKREST_LENGTH * PROP_ATTACHMENT * math.sin(math.radians(BACKREST_ANGLE)),
              HINGE[2] + BACKREST_LENGTH * PROP_ATTACHMENT * math.cos(math.radians(BACKREST_ANGLE))
              + 0.06 * math.sin(math.radians(BACKREST_ANGLE)))
PROP_ANGLE = math.degrees(math.atan2(PROP_START[1] - PROP_PIVOT[1], PROP_PIVOT[2] - PROP_START[2]))
PROP_LENGTH = math.hypot(PROP_START[1] - PROP_PIVOT[1], PROP_PIVOT[2] - PROP_START[2])
PROP_WIDTH = 0.25
PROP_THICKNESS = 0.12
PALETTE = ((166, 119, 74), (190, 148, 100), (211, 179, 132), (238, 242, 240), (190, 148, 100))
SLAT_COUNT = 10
SLAT_WIDTH = 0.72
SLAT_GAP = 0.44
SLAT_BOTTOM = TOP_PX - 0.8
LEG_SIZE = 2
RAIL_WIDTH = 1.5
BAND_START = -12.3
BAND_END = -7.8
FINGER_WIDTH = 0.18
PALE_SLAT_WIDTH = 0.5
BACKREST_BOTTOM = TOP_PX - 0.06
NOTCH_SIZE = 0.36
MAIN_RAIL_BOTTOM = 4.6
FOOT_RAIL_BOTTOM = 5.1
GEOMETRY = "models/entity/yasu_ride/beach_chair.geo.json"
TEXTURE = "textures/entity/yasu_ride/beach_chair.png"


def box(lo, hi, slot=0):
    return panels.panel(*lo, *hi, {"uv": [slot * 16, 0], "uv_size": [16, 16]})


def geometry():
    frame = []
    # The foot extension nests one pixel inside the main rails, leaving their
    # end grain exposed beyond the pale interlocking fingers.
    for x, start, end, bottom in ((-5, -16, -7.8, FOOT_RAIL_BOTTOM),
                                   (3.5, -16, -7.8, FOOT_RAIL_BOTTOM),
                                   (-6, -7.4, 3, MAIN_RAIL_BOTTOM),
                                   (4.5, -7.4, 3, MAIN_RAIL_BOTTOM)):
        frame.append(box((x, bottom, start), (x + RAIL_WIDTH, SLAT_BOTTOM, end)))
    for half, start in ((5, -16), (6, -7.4), (6, 1), (6, 14)):
        for x in (-half, half - LEG_SIZE):
            frame.append(box((x, 0, start), (x + LEG_SIZE, SLAT_BOTTOM, start + LEG_SIZE)))
    frame.append(box((-5, FOOT_RAIL_BOTTOM, -16), (5, SLAT_BOTTOM, -15)))
    for x in (-6, 6 - REAR_RAIL_WIDTH):
        frame.append(box((x, REAR_RAIL_BOTTOM, 3), (x + REAR_RAIL_WIDTH, REAR_RAIL_TOP, 16)))
    for x in (-5.58, 5.08):
        frame.append(box((x, SLAT_BOTTOM, 2), (x + 0.5, BACKREST_BOTTOM, 3)))
    frame.append(box((-6, REAR_RAIL_BOTTOM, 15), (6, REAR_RAIL_TOP, 16)))
    backrest = []
    slats_half = (SLAT_COUNT * SLAT_WIDTH + (SLAT_COUNT - 1) * SLAT_GAP) / 2
    for k in range(SLAT_COUNT):
        x = -slats_half + k * (SLAT_WIDTH + SLAT_GAP)
        pale_inset = (SLAT_WIDTH - PALE_SLAT_WIDTH) / 2
        frame.append(box((x + pale_inset, BACKREST_BOTTOM, BAND_START),
                         (x + pale_inset + PALE_SLAT_WIDTH, TOP_PX, BAND_END), 2))

    # Offset foot fingers interleave without closing the lengthwise air gaps.
    for k in range(SLAT_COUNT - 1):
        x = -slats_half + (k + 0.5) * (SLAT_WIDTH + SLAT_GAP)
        frame.append(box((x, SLAT_BOTTOM, -16), (x + SLAT_WIDTH, TOP_PX, BAND_START), 1))
        finger_x = x + (SLAT_WIDTH - FINGER_WIDTH) / 2
        frame.append(box((finger_x, BACKREST_BOTTOM, BAND_START),
                         (finger_x + FINGER_WIDTH, TOP_PX, BAND_END), 2))
    for k in range(BACKREST_SLAT_COUNT):
        x = -slats_half + k * (BACKREST_SLAT_WIDTH + BACKREST_SLAT_GAP)
        frame.append(box((x, SLAT_BOTTOM, BAND_END),
                         (x + BACKREST_SLAT_WIDTH, TOP_PX, HINGE[2]), 1))
        backrest.append(box((x, BACKREST_BOTTOM, HINGE[2]),
                            (x + BACKREST_SLAT_WIDTH, TOP_PX, HINGE[2] + BACKREST_LENGTH), 1))
    # Only the head crossbar remains; its hooked ends lean down toward +z.
    crossbar = box((-5.8, 6.35, 15), (5.8, BACKREST_BOTTOM, 15.65))
    backrest.extend(tilt.tilt_assembly([crossbar], (0, BACKREST_BOTTOM, 15), "x", -20))
    # A separate flat strip on each side joins the underside to the rail midpoint.
    prop = [box((x, PROP_PIVOT[1] - PROP_THICKNESS / 2, PROP_PIVOT[2] - PROP_LENGTH),
                (x + PROP_WIDTH, PROP_PIVOT[1] + PROP_THICKNESS / 2, PROP_PIVOT[2]), 3)
            for x in (-5.3, 5.05)]
    prop = tilt.tilt_assembly(prop, PROP_PIVOT, "x", -PROP_ANGLE)
    table_frame = []
    for x in (-6, 6 - LEG_SIZE):
        for z in (-16, 16 - LEG_SIZE):
            table_frame.append(box((x, 0, z), (x + LEG_SIZE, TABLE_SLAT_BOTTOM, z + LEG_SIZE)))
    for x in (-6, 6 - RAIL_WIDTH):
        table_frame.append(box((x, TABLE_RAIL_BOTTOM, -16),
                               (x + RAIL_WIDTH, TABLE_SLAT_BOTTOM, 16)))
    for z in (-16, 15):
        table_frame.append(box((-6, TABLE_RAIL_BOTTOM, z), (6, TABLE_SLAT_BOTTOM, z + 1)))
    # Adjacent slats share edges: wood grain marks joints without grooves or air gaps.
    # Nine true square holes sit between the ten slat centre lines at z=0.
    centres = [-slats_half + k * (SLAT_WIDTH + SLAT_GAP) + SLAT_WIDTH / 2
               for k in range(SLAT_COUNT)]
    joints = [(a + b) / 2 for a, b in zip(centres, centres[1:])]
    edges = [-6] + joints + [6]
    table_top = []
    for left, right in zip(edges, edges[1:]):
        table_top.extend([box((left, TABLE_SLAT_BOTTOM, -16), (right, TABLE_TOP_PX, -NOTCH_SIZE / 2), 4),
                          box((left, TABLE_SLAT_BOTTOM, NOTCH_SIZE / 2), (right, TABLE_TOP_PX, 16), 4)])
    cursor = -6
    for x in joints:
        table_top.append(box((cursor, TABLE_SLAT_BOTTOM, -NOTCH_SIZE / 2),
                             (x - NOTCH_SIZE / 2, TABLE_TOP_PX, NOTCH_SIZE / 2), 4))
        cursor = x + NOTCH_SIZE / 2
    table_top.append(box((cursor, TABLE_SLAT_BOTTOM, -NOTCH_SIZE / 2), (6, TABLE_TOP_PX, NOTCH_SIZE / 2), 4))
    bones = [{"name": "root", "pivot": [0, 0, 0]},
             {"name": "chair_form", "parent": "root", "pivot": [0, 0, 0]},
             {"name": "frame", "parent": "chair_form", "pivot": [0, 0, 0], "cubes": frame},
             {"name": "backrest", "parent": "chair_form", "pivot": list(HINGE),
              "rotation": [BACKREST_ANGLE, 0, 0], "cubes": backrest},
             {"name": "prop", "parent": "chair_form", "pivot": list(PROP_PIVOT), "cubes": prop},
             {"name": "table_form", "parent": "root", "pivot": [0, 0, 0], "cubes": table_frame},
             {"name": "table_top", "parent": "table_form", "pivot": [0, 0, 0], "cubes": table_top}]
    for bone in bones:
        tilt.assert_axes(bone.get("cubes", []), {})
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.beach_chair", "texture_width": 80,
                        "texture_height": 16, "visible_bounds_width": 2.5,
                        "visible_bounds_height": 2, "visible_bounds_offset": [0, 1, 0]},
        "bones": bones}]}


def pixel(x, y):
    slot = x // 16
    color = PALETTE[slot]
    # Fine, deterministic grain follows the long axis on the slat faces.
    grain = ((x * 13 + (y // 6) * 7) % 9 - 4) if slot < 3 or slot == 4 else 0
    # A narrow wood-coloured edge marks each closed table slat joint.
    joint = -10 if slot == 4 and x % 16 == 0 else 0
    return tuple(c + grain + joint for c in color) + (255,)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry(), separators=(",", ":"))
    out.png(args.resource_pack / TEXTURE, 80, 16, pixel, compress_level=9)
    out.finish("Beach Chair outputs are stale. Run pnpm model:", "Beach Chair model and texture are up to date")


if __name__ == "__main__":
    main()
