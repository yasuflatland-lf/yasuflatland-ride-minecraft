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
# The folded table is a low coffee table at bed height: only hosted lanterns and
# ovens stand on it, so it does not need to reach a block top (ADR 0238).
TABLE_TOP_PX = TOP_PX
HALF = (6, 16)
BED_OUTLINE = (-6, 6, -16, 16)
SEAT_OFFSET = (0, TOP_PX / 16, 2 / 16)
HINGE = (0, TOP_PX, 5.5)
BACKREST_ANGLE = 37
# The flat backrest ends at the head edge during the fold, so it stays inside z = 16.
BACKREST_LENGTH = 10.5
SLAT_COUNT = 13
SLAT_WIDTH = 0.52
SLAT_GAP = 0.36
SLATS_HALF = (SLAT_COUNT * SLAT_WIDTH + (SLAT_COUNT - 1) * SLAT_GAP) / 2
BACKREST_SLAT_COUNT = SLAT_COUNT
BACKREST_SLAT_WIDTH = SLAT_WIDTH
BACKREST_SLAT_GAP = SLAT_GAP
BACKREST_THICKNESS = 0.06
LEG_SIZE = 1.15
MAIN_RAIL_THICKNESS = 0.4
MAIN_RAIL_BOTTOM = 5.65
MAIN_RAIL_START = -9
# The main rails run past the hinge; the short open rear frame starts where they end.
MAIN_RAIL_END = 10.5
# The folded table is as long as the main bed but centred on the entity origin,
# so the tabletop host needs no centre offset.
TABLE_LENGTH = HINGE[2] - MAIN_RAIL_START
TABLE_Z_MIN = -TABLE_LENGTH / 2
TABLE_Z_MAX = TABLE_LENGTH / 2
TABLE_Z_CENTER = 0
EXTENSION_HALF_WIDTH = 5.3
EXTENSION_RAIL_THICKNESS = 0.4
EXTENSION_RAIL_BOTTOM = 5.65
EXTENSION_RAIL_TOP = 6.82
EXTENSION_END_START = -15.6
EXTENSION_END_DEPTH = 0.5
EXTENSION_LEG_SIZE = LEG_SIZE
REAR_RAIL_BOTTOM = 5.65
REAR_RAIL_TOP = 6.82
REAR_RAIL_WIDTH = 0.4
REAR_LEG_SIZE = LEG_SIZE
REAR_END_START = 15.4
PAD_HEIGHT = 0.2
PAD_INSET = 0.08
PAD_SLOT = 5
JOINT_SEAM = 0.018
TABLE_SLAT_THICKNESS = 0.18
TABLE_SLAT_BOTTOM = TABLE_TOP_PX - TABLE_SLAT_THICKNESS
TABLE_APRON_DEPTH = 1.6
TABLE_RAIL_BOTTOM = TABLE_SLAT_BOTTOM - TABLE_APRON_DEPTH
TABLE_RAIL_THICKNESS = 0.4
PROP_ATTACHMENT = 0.4
PROP_PIVOT = (0, (REAR_RAIL_BOTTOM + REAR_RAIL_TOP) / 2, REAR_END_START)
PROP_START = (0,
              TOP_PX - BACKREST_THICKNESS * math.cos(math.radians(BACKREST_ANGLE))
              + BACKREST_LENGTH * PROP_ATTACHMENT * math.sin(math.radians(BACKREST_ANGLE)),
              HINGE[2] + BACKREST_LENGTH * PROP_ATTACHMENT * math.cos(math.radians(BACKREST_ANGLE))
              + BACKREST_THICKNESS * math.sin(math.radians(BACKREST_ANGLE)))
PROP_ANGLE = math.degrees(math.atan2(PROP_START[1] - PROP_PIVOT[1], PROP_PIVOT[2] - PROP_START[2]))
PROP_LENGTH = math.hypot(PROP_START[1] - PROP_PIVOT[1], PROP_PIVOT[2] - PROP_START[2])
PROP_WIDTH = 0.12
PROP_THICKNESS = 0.08
# Colours sampled from the studio reference photo and divided by the preview's face
# shading (1.0 up, 0.6 to 0.8 sides), so rendered faces match the photo means:
# honey-brown legs, yellow-tan slat tops, the cream junction band, steel, the
# mid-brown table top, near-black pads, the dark slat walls seen down the gaps,
# darker end grain, and the lighter, less red apron rails.
PALETTE = ((236, 172, 126), (240, 212, 178), (252, 240, 214), (206, 210, 210), (196, 156, 116),
           (34, 26, 21), (70, 44, 26), (190, 138, 96), (255, 202, 158))
GAP_SLOT = 6
END_GRAIN_SLOT = 7
RAIL_SLOT = 8
TEXTURE_WIDTH = len(PALETTE) * 16
# Rows 0-15 hold grain running along v and rows 16-31 grain running along u, so
# each face picks the copy whose lines follow its longer side.
TEXTURE_HEIGHT = 32
# Deep slats make the gaps between them read as dark slots rather than hairlines.
SLAT_BOTTOM = TOP_PX - 0.55
BAND_START = -11.5
BAND_END = -9
FINGER_WIDTH = 0.16
PALE_SLAT_WIDTH = 0.4
BACKREST_BOTTOM = TOP_PX - BACKREST_THICKNESS
NOTCH_SIZE = 0.36
GEOMETRY = "models/entity/yasu_ride/beach_chair.geo.json"
TEXTURE = "textures/entity/yasu_ride/beach_chair.png"


def face(slot, across=False):
    return {"uv": [slot * 16, 16 if across else 0], "uv_size": [16, 16]}


FACE_AXES = {"north": (0, 1), "south": (0, 1), "east": (2, 1), "west": (2, 1), "up": (0, 2), "down": (0, 2)}


def box(lo, hi, slot=0, sides=None, ends=END_GRAIN_SLOT):
    """A cube whose long faces use slot; sides recolours the east, west, and down faces,
    and ends the two faces across its longer horizontal axis (end grain)."""
    cube = panels.panel(*lo, *hi, face(slot))
    if slot in (3, PAD_SLOT):
        return cube
    if sides is not None:
        for side in ("east", "west", "down"):
            cube["uv"][side] = face(sides)
    size = cube["size"]
    if ends is not None:
        for side in ("north", "south") if size[2] >= size[0] else ("east", "west"):
            cube["uv"][side] = face(ends)
    rail = max(size[0], size[2]) > size[1]
    for side, (u_axis, v_axis) in FACE_AXES.items():
        slot_of_face = cube["uv"][side]["uv"][0] // 16
        # Rail tops face the light like slat tops, so they share the slat-top tone;
        # the brighter rail slot only offsets the darker side shading.
        if slot_of_face == 0 and rail:
            slot_of_face = 1 if side == "up" else RAIL_SLOT
        cube["uv"][side] = face(slot_of_face, size[u_axis] > size[v_axis])
    return cube


def slat(lo, hi, slot):
    # The outermost slats show their outer side beside the rails, so it matches the frame.
    outer = max(abs(lo[0]), abs(hi[0])) > SLATS_HALF - SLAT_WIDTH / 2
    # The band's interleaved fingers sit close, so their sides keep the band colour
    # rather than the dark gap wall, and the band reads as a clean pale stripe.
    inner = 2 if slot == 2 else GAP_SLOT
    return box(lo, hi, slot, 0 if outer else inner)


def leg(x, z, size, top):
    return [box((x, PAD_HEIGHT, z), (x + size, top - JOINT_SEAM, z + size), ends=None),
            box((x, top - JOINT_SEAM, z), (x + size, top, z + size), PAD_SLOT),
            box((x + PAD_INSET, 0, z + PAD_INSET),
                (x + size - PAD_INSET, PAD_HEIGHT, z + size - PAD_INSET), PAD_SLOT)]


def geometry():
    frame = []
    # The extension clears the main rails while its slat tips overhang the end rail.
    for half, thickness, start, end, bottom, top in (
            (EXTENSION_HALF_WIDTH, EXTENSION_RAIL_THICKNESS, -HALF[1], BAND_END + LEG_SIZE,
             EXTENSION_RAIL_BOTTOM, EXTENSION_RAIL_TOP),
            (HALF[0], MAIN_RAIL_THICKNESS, MAIN_RAIL_START, MAIN_RAIL_END, MAIN_RAIL_BOTTOM, TOP_PX),
            (HALF[0], REAR_RAIL_WIDTH, MAIN_RAIL_END, HALF[1], REAR_RAIL_BOTTOM, REAR_RAIL_TOP)):
        for x in (-half, half - thickness):
            frame.append(box((x, bottom, start), (x + thickness, top, end)))
    for half, size, starts, top in (
            (HALF[0], LEG_SIZE, (MAIN_RAIL_START, MAIN_RAIL_END - LEG_SIZE), MAIN_RAIL_BOTTOM),
            (EXTENSION_HALF_WIDTH, EXTENSION_LEG_SIZE, (EXTENSION_END_START,), EXTENSION_RAIL_BOTTOM),
            (HALF[0], REAR_LEG_SIZE, (HALF[1] - REAR_LEG_SIZE,), REAR_RAIL_BOTTOM)):
        for z in starts:
            for x in (-half, half - size):
                frame.extend(leg(x, z, size, top))
    # Cross rails stop at the side rails' inner faces: a cross rail reaching the outer
    # face would z-fight with the side rail and speckle the leg joint.
    stub_inner = EXTENSION_HALF_WIDTH - EXTENSION_RAIL_THICKNESS
    frame.append(box((-stub_inner, EXTENSION_RAIL_BOTTOM, EXTENSION_END_START),
                     (stub_inner, EXTENSION_RAIL_TOP, EXTENSION_END_START + EXTENSION_END_DEPTH)))
    # The main frame's end grain closes the inset slider joint below the flush slats.
    main_inner = HALF[0] - MAIN_RAIL_THICKNESS
    frame.append(box((-main_inner, MAIN_RAIL_BOTTOM, MAIN_RAIL_START),
                     (main_inner, SLAT_BOTTOM, MAIN_RAIL_START + MAIN_RAIL_THICKNESS)))
    rear_inner = HALF[0] - REAR_RAIL_WIDTH
    frame.append(box((-rear_inner, REAR_RAIL_BOTTOM, REAR_END_START),
                     (rear_inner, REAR_RAIL_TOP, HALF[1])))
    backrest = []
    slats_half = SLATS_HALF
    for k in range(SLAT_COUNT):
        x = -slats_half + k * (SLAT_WIDTH + SLAT_GAP)
        pale_inset = (SLAT_WIDTH - PALE_SLAT_WIDTH) / 2
        frame.append(slat((x + pale_inset, SLAT_BOTTOM, BAND_START),
                         (x + pale_inset + PALE_SLAT_WIDTH, TOP_PX, BAND_END), 2))

    # Offset foot fingers interleave without closing the lengthwise air gaps.
    for k in range(SLAT_COUNT - 1):
        x = -slats_half + (k + 0.5) * (SLAT_WIDTH + SLAT_GAP)
        frame.append(slat((x, SLAT_BOTTOM, -16), (x + SLAT_WIDTH, TOP_PX, BAND_START), 1))
        finger_x = x + (SLAT_WIDTH - FINGER_WIDTH) / 2
        frame.append(slat((finger_x, SLAT_BOTTOM, BAND_START),
                         (finger_x + FINGER_WIDTH, TOP_PX, BAND_END), 2))
    for k in range(BACKREST_SLAT_COUNT):
        x = -slats_half + k * (BACKREST_SLAT_WIDTH + BACKREST_SLAT_GAP)
        frame.append(slat((x, SLAT_BOTTOM, BAND_END),
                         (x + BACKREST_SLAT_WIDTH, TOP_PX, HINGE[2]), 1))
        backrest.append(slat((x, BACKREST_BOTTOM, HINGE[2]),
                            (x + BACKREST_SLAT_WIDTH, TOP_PX, HINGE[2] + BACKREST_LENGTH), 1))
    # Only the head crossbar remains; its hooked ends lean down toward +z.
    crossbar_z = HINGE[2] + BACKREST_LENGTH - 0.8
    crossbar = box((-5.8, 6.35, crossbar_z), (5.8, BACKREST_BOTTOM, crossbar_z + 0.65))
    backrest.extend(tilt.tilt_assembly([crossbar], (0, BACKREST_BOTTOM, crossbar_z), "x", -20))
    # A separate flat strip on each side joins the underside to the rail midpoint.
    prop = [box((x, PROP_PIVOT[1] - PROP_THICKNESS / 2, PROP_PIVOT[2] - PROP_LENGTH),
                (x + PROP_WIDTH, PROP_PIVOT[1] + PROP_THICKNESS / 2, PROP_PIVOT[2]), 3)
            for x in (-HALF[0] + REAR_LEG_SIZE, HALF[0] - REAR_LEG_SIZE - PROP_WIDTH)]
    prop = tilt.tilt_assembly(prop, PROP_PIVOT, "x", -PROP_ANGLE)
    table_frame = []
    for x in (-HALF[0], HALF[0] - LEG_SIZE):
        for z in (TABLE_Z_MIN, TABLE_Z_MAX - LEG_SIZE):
            table_frame.extend(leg(x, z, LEG_SIZE, TABLE_RAIL_BOTTOM))
    for x in (-HALF[0], HALF[0] - TABLE_RAIL_THICKNESS):
        table_frame.append(box((x, TABLE_RAIL_BOTTOM, TABLE_Z_MIN),
                               (x + TABLE_RAIL_THICKNESS, TABLE_SLAT_BOTTOM, TABLE_Z_MAX)))
    for z in (TABLE_Z_MIN, TABLE_Z_MAX - TABLE_RAIL_THICKNESS):
        table_frame.append(box((-HALF[0] + TABLE_RAIL_THICKNESS, TABLE_RAIL_BOTTOM, z),
                               (HALF[0] - TABLE_RAIL_THICKNESS, TABLE_SLAT_BOTTOM, z + TABLE_RAIL_THICKNESS)))
    # Adjacent slats share edges: wood grain marks joints without grooves or air gaps.
    # True square holes sit between the slat centre lines at the table midpoint.
    centres = [-slats_half + k * (SLAT_WIDTH + SLAT_GAP) + SLAT_WIDTH / 2
               for k in range(SLAT_COUNT)]
    joints = [(a + b) / 2 for a, b in zip(centres, centres[1:])]
    edges = [-6] + joints + [6]
    table_top = []
    for left, right in zip(edges, edges[1:]):
        table_top.extend([box((left, TABLE_SLAT_BOTTOM, TABLE_Z_MIN), (right, TABLE_TOP_PX, TABLE_Z_CENTER - NOTCH_SIZE / 2), 4),
                          box((left, TABLE_SLAT_BOTTOM, TABLE_Z_CENTER + NOTCH_SIZE / 2), (right, TABLE_TOP_PX, TABLE_Z_MAX), 4)])
    cursor = -6
    for x in joints:
        table_top.append(box((cursor, TABLE_SLAT_BOTTOM, TABLE_Z_CENTER - NOTCH_SIZE / 2),
                             (x - NOTCH_SIZE / 2, TABLE_TOP_PX, TABLE_Z_CENTER + NOTCH_SIZE / 2), 4))
        cursor = x + NOTCH_SIZE / 2
    table_top.append(box((cursor, TABLE_SLAT_BOTTOM, TABLE_Z_CENTER - NOTCH_SIZE / 2), (6, TABLE_TOP_PX, TABLE_Z_CENTER + NOTCH_SIZE / 2), 4))
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
        "description": {"identifier": "geometry.yasu_ride.beach_chair", "texture_width": TEXTURE_WIDTH,
                        "texture_height": TEXTURE_HEIGHT, "visible_bounds_width": 2.5,
                        "visible_bounds_height": 2, "visible_bounds_offset": [0, 1, 0]},
        "bones": bones}]}


def pixel(x, y):
    slot, u = divmod(x, 16)
    across, v = divmod(y, 16)
    color = PALETTE[slot]
    if slot in (3, PAD_SLOT):
        return color + (255,)
    # Lines run along the board: a is the texel across the grain, b along it.
    a, b = (v, u) if across else (u, v)
    # Fine, low-contrast grain: each line keeps its own tone with an occasional
    # darker figure line and a one-texel flicker, never multi-texel patches.
    line = ((a * 37 + slot * 11) % 13 - 6) // 2
    figure = -8 if (a * 7 + slot * 3) % 11 == 0 else 0
    flicker = -2 if (a * 13 + b * 5 + slot) % 7 == 0 else 0
    # Darker arrises along each board separate slats and rails; board ends darken less.
    edge = -10 if a in (0, 15) else -4 if b in (0, 15) else 0
    shift = line + figure + flicker + edge
    if slot in (2, GAP_SLOT):
        shift //= 2
    return tuple(max(0, min(255, c + shift)) for c in color) + (255,)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry(), separators=(",", ":"))
    out.png(args.resource_pack / TEXTURE, TEXTURE_WIDTH, TEXTURE_HEIGHT, pixel, compress_level=9)
    out.finish("Beach Chair outputs are stale. Run pnpm model:", "Beach Chair model and texture are up to date")


if __name__ == "__main__":
    main()
