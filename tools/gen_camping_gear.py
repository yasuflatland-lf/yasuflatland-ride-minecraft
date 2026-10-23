"""Generate the camping gear block models and their shared texture atlas (ADR 0093).

    python3 -I tools/gen_camping_gear.py <resource pack> <behavior pack>          write the files
    python3 -I tools/gen_camping_gear.py <resource pack> <behavior pack> --check  fail if any file is stale

tools/camping_gear.json lists the items; SHAPES below gives each item's cubes. Units are pixels (16
per block). Every model is centered on x 0 and z 0, with its front at -z (ADR 0009). A standing item
stands on y 0; a hanging item also starts on y 0, and its slot's height lifts it to the hook (ADR
0102). The atlas is 16 x 16 with one 4 x 4 swatch per color, so mipmapping in the block atlas does
not bleed a neighbor's color into a face. --check compares parsed JSON and decoded pixels, because
Biome reformats the geometry and zlib builds do not all compress identically. It also writes the
Behavior Pack decor blocks, the items, the creative catalog, and the gear part of
item_texture.json; the decor block's face, height, and spot states are described next to
FACE_ROTATION. It also writes the pair blocks and their geometry, which draw the two items of a
shelf board or of the table in one block (PAIRS, ADR 0108), the wall cabinet's compartment
block, a pair block that also holds the ceiling up and shows its items only while its door is
open (ADR 0114), and the fridge's compartment block, which shows its items the same way (ADR
0123).
The camping gear box (BOX) is the creative group's icon and first item, and its icon entry comes
first in the generated part of item_texture.json; its item JSON and icon are written elsewhere (ADR
0093).
"""

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

LAID_TAG = "tag:yasu_ride:laid"

SPEC = Path(__file__).resolve().parent / "camping_gear.json"
MODELS = "models/blocks/yasu_ride"
ATLAS = "textures/blocks/yasu_ride/camping_gear.png"
TERRAIN = "textures/terrain_texture.json"
BLOCKS = "blocks/yasu_ride"
ITEMS = "items/yasu_ride"
CATALOG = "item_catalog/crafting_item_catalog.json"
ITEM_TEXTURES = "textures/item_texture.json"
ATLAS_KEY = "yasu_ride_camping_gear"
# Decor block states (ADR 0093). The rotation turns the gear model into the camper model's frame:
# model -z to the camper's front. In a block frame, rotation 0 faces model -z north and +90 turns
# north to west.
FACE_STATE = "yasu_ride:face"
HEIGHT_STATE = "yasu_ride:height"
FACE_ROTATION = [180, 90, 0, -90]  # index = FACE_STATE = the camper's yaw quarter
FACES = range(len(FACE_ROTATION))
HEIGHTS = range(16)  # HEIGHT_STATE, px above the cell bottom
# SPOT_STATE says where on its cell the item stands (ADR 0107): index = DECOR_SPOTS in
# src/domain/vehicle/kinds/camper/furniture.ts, as (left, forward) px from the cell middle in the
# camper's room frame. Spot 0 is the middle; 1 to 4 were the four stove burners of ADR 0107,
# 15 px high (SPOT_HEIGHTS), so only those permutations are written. No slot uses them since the
# stove got one burner in its middle (ADR 0112); they stay so a decor block an older build laid
# on a burner still draws there until the next lay clears it. tests/packs/campingGear.test.ts
# ties both to the domain.
SPOT_STATE = "yasu_ride:spot"
SPOTS = [(0, 0), (3.8, 5.4), (3.8, -5.35), (-3.3, 5.4), (-3.3, -5.35)]
SPOT_HEIGHTS = [list(HEIGHTS)] + [[15]] * (len(SPOTS) - 1)
# A shelf board or the table holds two items in its one cell, and a block's transformed geometry
# must keep at least one pixel on each axis inside its own cell: a decor block moved a cell away
# to draw the second item is rejected and renders as the fallback block (ADR 0108). So one pair
# block per furniture draws both. Its geometry has one bone per standing item per end, the item
# standing at that end, and bone_visibility shows the bone whose item the end's states name. ENDS
# are each end's (left, forward) px from the cell middle in the camper's room frame, as
# DECOR_SPOTS 5 to 8 in src/domain/vehicle/kinds/camper/furniture.ts; HEIGHTS are the heights of
# its slots. tests/packs/campingGear.test.ts ties both to the domain slots.
# A pair with a "door" is a compartment behind a storage door (ADR 0121): its "door" names how
# its boxes are laid (DOOR_BOXES), and "inside_px" is its inside height, which no standing item
# may pass.
PAIRS = {
    # No slot lays the shelf's pair block since the fridge took the shelf's place. It stays
    # defined so a block an older build laid keeps its type, which lets the next lay replace it
    # with the fridge's compartment block (ADR 0123).
    "shelf": {"ends": [(0, -3.5), (0, 3.5)], "heights": [4, 10]},
    "table": {"ends": [(3.3, 0), (-3.7, 0)], "heights": [12]},
    # A wall cabinet compartment under the ceiling, as long as a shelf board, so its ends are the
    # board's. Its items stand on the compartment floor, 3 px above the cell bottom (ADR 0114).
    # Its inside runs from its floor's top at model y 51 to its top panel at 60
    # (tools/gen_camper.py CABINET_Y).
    "cabinet": {"ends": [(0, -3.5), (0, 3.5)], "heights": [3], "door": "ceiling", "inside_px": 9},
    # A fridge compartment in a shelf cell, as long as a shelf board, so its ends are the board's.
    # Its items stand on the bottom compartment's floor, 3 px above layer 1's bottom, or on the
    # divider, 4 px above layer 2's bottom. The upper compartment is the lower one inside: from
    # the divider's top at model y 36 to the top panel at 48 (tools/gen_camper.py FRIDGE_Y,
    # ADR 0123).
    "fridge": {"ends": [(0, -3.5), (0, 3.5)], "heights": [3, 4], "door": "cell", "inside_px": 12},
}
# A compartment block's door state: its items show only while the door is open or still swinging
# shut. The cabinet's box ("ceiling") covers the compartment from its floor to the top of its
# door, 10 px, and it keeps the ceiling plate's collision at the top 3 px of the cell. Both
# boxes are given before the lift, which moves them with the items (ADR 0097, 0107); if the
# client left them in place, both would still be inside the cell and over the cabinet (ADR
# 0114). The fridge's box ("cell") has no collision, as the shelf had none, and runs from the
# compartment floor to the cell's top: given before the lift, it is the cell less the lift, so
# each height's permutation sets its own (ADR 0123).
OPEN_STATE = "yasu_ride:open"
CABINET_COMPONENT = "yasu_ride:camper_cabinet"
CABINET_BOX_PX = 10
CEILING_PLATE_PX = 3
# A block state holds at most 16 values, and an end takes 19: empty, or one of the 18 standing
# items. So an end's code, 0 for empty and 1 + the item's index among the standing items, is
# split into end<n>_page (code // PAIR_PAGE_SIZE) and end<n>_item (code % PAIR_PAGE_SIZE), as
# pairEndStates in src/infrastructure/vehicle/bedrock/identifiers.ts.
PAIR_PAGE_SIZE = 10
MAX_STATE_VALUES = 16
# BDS rejects a block whose enum state lists one value ("Block State enum array must have more
# than 1 value"), so a pair whose ends share one height, the table, has no HEIGHT_STATE and its
# permutations lift it by that height (ADR 0108).
MIN_STATE_VALUES = 2
GROUP = "yasu_ride:camping_gear"
# The box a player gets with their first camper (ADR 0093): the group's icon and first item.
BOX = "camping_gear_box"
GROUP_ICON = f"yasu_ride:{BOX}"
# Camping items that stand outside the vehicles rather than decor, listed after the gear in the
# creative group. Their item JSON and icon entry are written by hand (ADR 0122, 0130).
OUTDOOR_ITEMS = ["low_chair_item", "tent_item"]
ATLAS_SIZE = 16
SWATCH = 4
CELL_PX = 16
# 1970s motorhome colors (#347): avocado, harvest gold, burnt orange, brown, cream, and chrome
PALETTE = {
    "cream": (240, 228, 196, 255),
    "avocado": (128, 138, 52, 255),
    "harvest_gold": (222, 165, 36, 255),
    "burnt_orange": (204, 85, 20, 255),
    "brown": (128, 78, 40, 255),
    "dark_brown": (74, 46, 26, 255),
    "chrome": (205, 206, 210, 255),
    "black": (24, 24, 24, 255),
    "terracotta": (178, 96, 60, 255),
    "leaf": (70, 128, 50, 255),
    "red": (196, 40, 36, 255),
    "paper": (244, 240, 226, 255),
    "sky": (124, 172, 210, 255),
    "steel": (120, 124, 130, 255),
    "glass": (210, 228, 236, 110),
    "white": (250, 250, 248, 255),
}
SLOTS = list(PALETTE)


def face(color):
    i = SLOTS.index(color)
    return {"uv": [SWATCH * (i % SWATCH), SWATCH * (i // SWATCH)], "uv_size": [SWATCH, SWATCH]}


def box(x0, y0, z0, x1, y1, z1, color):
    return {
        "origin": [x0, y0, z0],
        "size": [x1 - x0, y1 - y0, z1 - z0],
        "uv": {f: face(color) for f in ("north", "south", "east", "west", "up", "down")},
    }


SHAPES = {
    "potted_plant": [
        box(-1.5, 0, -1.5, 1.5, 3, 1.5, "terracotta"),
        box(-2.5, 3, -2.5, 2.5, 6, 2.5, "leaf"),
        box(-1.5, 6, -1.5, 1.5, 8, 1.5, "avocado"),
    ],
    "macrame_planter": [
        box(-2.5, 0, -2.5, 2.5, 3, 2.5, "terracotta"),
        box(-2, 3, -2, 2, 5, 2, "leaf"),
        box(0.5, 0.5, -3, 1.5, 3, -2.5, "leaf"),
        box(-2.5, 3, -0.25, -2, 8.5, 0.25, "cream"),
        box(2, 3, -0.25, 2.5, 8.5, 0.25, "cream"),
        box(-0.25, 3, -2.5, 0.25, 8.5, -2, "cream"),
        box(-0.25, 3, 2, 0.25, 8.5, 2.5, "cream"),
        box(-2.5, 8.5, -0.25, 2.5, 9, 0.25, "cream"),
        box(-0.25, 8.5, -2.5, 0.25, 9, 2.5, "cream"),
        box(-0.5, 9, -0.5, 0.5, 10, 0.5, "cream"),
    ],
    "cactus_pot": [
        box(-2, 0, -2, 2, 3, 2, "harvest_gold"),
        box(-1, 3, -1, 1, 7, 1, "leaf"),
        box(1, 4, -0.5, 2, 6, 0.5, "leaf"),
    ],
    "percolator": [
        box(-2, 0, -1.5, 1, 6, 1.5, "chrome"),
        box(-1, 6, -0.5, 0, 7, 0.5, "black"),
        box(1, 1.5, -0.5, 2, 4.5, 0.5, "black"),
        box(-1, 4, -2.5, 0, 5, -1.5, "chrome"),
    ],
    "enamel_kettle": [
        box(-2.5, 0, -2, 1.5, 3, 2, "avocado"),
        box(-1.5, 3, -1.5, 0.5, 3.5, 1.5, "cream"),
        box(1.5, 1, -0.5, 2.5, 2.5, 0.5, "avocado"),
        box(-2, 4, -0.5, 1, 5, 0.5, "black"),
        box(-2, 3.5, -0.5, -1.5, 4, 0.5, "black"),
        box(0.5, 3.5, -0.5, 1, 4, 0.5, "black"),
    ],
    "saucepan": [
        box(-3, 0, -2, 1, 2.5, 2, "burnt_orange"),
        box(-2.5, 2.5, -1.5, 0.5, 3, 1.5, "chrome"),
        box(1, 2, -0.5, 3, 2.5, 0.5, "black"),
    ],
    "mug_pair": [
        box(-2, 0, -1.5, -0.5, 3, 0, "harvest_gold"),
        box(-1.5, 1, -2, -1, 2, -1.5, "harvest_gold"),
        box(0.5, 0, 0, 2, 3, 1.5, "burnt_orange"),
        box(1, 1, 1.5, 1.5, 2, 2, "burnt_orange"),
    ],
    "sugar_pot": [
        box(-1.5, 0, -1.5, 1.5, 3, 1.5, "glass"),
        box(-1, 0.5, -1, 1, 2, 1, "paper"),
        box(-1, 3, -1, 1, 3.5, 1, "chrome"),
        box(-0.5, 3.5, -0.5, 0.5, 4, 0.5, "chrome"),
    ],
    "fruit_bowl": [
        box(-2, 0, -2, 2, 1, 2, "avocado"),
        box(-3, 1, -3, 3, 2, 3, "avocado"),
        box(-2, 2, -1.5, -0.5, 3, 0, "red"),
        box(0, 2, -1, 1.5, 3, 0.5, "burnt_orange"),
        box(-1.5, 2, 0.5, 2, 2.75, 1.5, "harvest_gold"),
    ],
    "toaster": [
        box(-3, 0, -2.25, 3, 0.5, 2.25, "black"),
        box(-2.75, 0.5, -2, 2.75, 4.5, 2, "chrome"),
        box(-1.5, 4.5, -1, 1.5, 5, -0.5, "harvest_gold"),
        box(-1.5, 4.5, 0.5, 1.5, 5, 1, "harvest_gold"),
        box(2.75, 2, -0.5, 3, 3, 0.5, "steel"),
    ],
    "oil_lamp": [
        box(-2, 0, -2, 2, 1, 2, "dark_brown"),
        box(-1.5, 1, -1.5, 1.5, 3, 1.5, "harvest_gold"),
        box(-1, 3, -1, 1, 3.5, 1, "chrome"),
        box(-1, 3.5, -1, 1, 6.5, 1, "cream"),
        box(-0.75, 6.5, -0.75, 0.75, 7, 0.75, "chrome"),
    ],
    "lava_lamp": [
        box(-1.5, 0, -1.5, 1.5, 2.5, 1.5, "harvest_gold"),
        box(-1, 2.5, -1, 1, 6.5, 1, "red"),
        box(-1.25, 3.5, -0.5, 1.25, 4.5, 0.5, "burnt_orange"),
        box(-0.5, 5, -1.25, 0.5, 6, 1.25, "burnt_orange"),
        box(-0.75, 6.5, -0.75, 0.75, 8, 0.75, "harvest_gold"),
    ],
    "transistor_radio": [
        box(-3, 0, -1, 3, 3.5, 1, "burnt_orange"),
        box(-2.5, 0.5, -1.25, 0.5, 3, -1, "cream"),
        box(1, 1, -1.25, 2.5, 2.5, -1, "chrome"),
        box(-2, 3.5, -0.25, 2, 4, 0.25, "black"),
    ],
    "book_stack": [
        box(-3, 0, -2, 3, 1, 2, "avocado"),
        box(-2.5, 1, -1.75, 2.5, 2, 1.75, "burnt_orange"),
        box(-2.75, 2, -1.5, 2.25, 3, 1.5, "harvest_gold"),
    ],
    "road_map": [
        box(-3, 0, -2, 3, 0.5, 2, "paper"),
        box(-3, 0.5, -2, 0, 1, 2, "sky"),
        box(0.5, 0.5, -0.25, 3, 0.75, 0.25, "red"),
    ],
    "photo_frame": [
        box(-2, 0, 0, 2, 5, 0.5, "dark_brown"),
        box(-1.5, 2, -0.25, 1.5, 4.5, 0, "sky"),
        box(-1.5, 0.5, -0.25, 1.5, 2, 0, "leaf"),
        box(-0.5, 0, 0.5, 0.5, 3, 1.5, "dark_brown"),
    ],
    "cushion": [
        box(-3.5, 0, -3, 3.5, 1, 3, "burnt_orange"),
        box(-3.5, 1, -3, 3.5, 2, 3, "brown"),
        box(-3.5, 2, -3, 3.5, 3, 3, "burnt_orange"),
    ],
    "tissue_box": [
        box(-2.5, 0, -1.5, 2.5, 2.5, 1.5, "harvest_gold"),
        box(-1, 2.5, -0.5, 1, 3, 0.5, "white"),
    ],
    "desk_fan": [
        box(-1.5, 0, -1.5, 1.5, 0.5, 1.5, "avocado"),
        box(-0.5, 0.5, 0, 0.5, 3, 1, "steel"),
        box(-1, 3, 0, 1, 5, 1.5, "avocado"),
        box(-2, 2, -0.5, 2, 6, 0, "chrome"),
        box(-0.5, 3.5, -0.75, 0.5, 4.5, -0.5, "black"),
    ],
}


def rounded(value):
    """Drop floating-point noise and normalize negative zero before writing."""
    if isinstance(value, float):
        value = round(value, 3) + 0.0
        return int(value) if value.is_integer() else value
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def geometry(item_id, cubes):
    return rounded({
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": f"geometry.yasu_ride.{item_id}",
                "texture_width": ATLAS_SIZE,
                "texture_height": ATLAS_SIZE,
            },
            "bones": [{"name": "root", "pivot": [0, 0, 0], "cubes": cubes}],
        }],
    })


def pair_geometry(kind, spec):
    """One bone per standing item per end, its cubes moved to the end's spot in the gear model's
    frame, where the camper's left is -x and its forward -z (FACE_ROTATION). Every face is opaque,
    the glass item's too: BDS rejects material instances that mix opaque and blending render
    methods in one block ("MaterialInstances can't mix and match opaque and transparent
    materials"), and blending every item would sort their faces wrongly (ADR 0108)."""
    bones = []
    for end, (left, ahead) in enumerate(PAIRS[kind]["ends"]):
        for item in standing(spec):
            cubes = [
                {**c, "origin": [c["origin"][0] - left, c["origin"][1], c["origin"][2] - ahead]}
                for c in SHAPES[item["id"]]
            ]
            bones.append({"name": pair_bone(end, item["id"]), "pivot": [0, 0, 0], "cubes": cubes})
    return rounded({
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": f"geometry.yasu_ride.{kind}_decor_pair",
                "texture_width": ATLAS_SIZE,
                "texture_height": ATLAS_SIZE,
            },
            "bones": bones,
        }],
    })


def standing(spec):
    return [item for item in spec if not item["hanging"]]


def pair_bone(end, item_id):
    return f"end{end}_{item_id}"


def pair_pages(spec):
    return -(-(len(standing(spec)) + 1) // PAIR_PAGE_SIZE)


def bounds(cubes):
    lo = [min(c["origin"][i] for c in cubes) for i in range(3)]
    hi = [max(c["origin"][i] + c["size"][i] for c in cubes) for i in range(3)]
    return lo, hi


def y_span(item):
    """Every item's model starts on y 0; a hanging item is lifted to the hook by its slot's
    yasu_ride:height (ADR 0102)."""
    return (0, item["height_px"])


def validate(spec):
    """Stop before writing anything when a shape disagrees with its spec row."""
    errors = []
    if [item["id"] for item in spec] != list(SHAPES):
        errors.append("SHAPES must list exactly the ids of camping_gear.json, in the same order")
    for item in spec:
        if not isinstance(item["hanging"], bool):
            errors.append(f"{item['id']}: hanging must be true or false")
        cubes = SHAPES.get(item["id"], [])
        if not cubes:
            continue
        (x0, y0, z0), (x1, y1, z1) = bounds(cubes)
        w = item["width_px"]
        if (x0, x1) != (-w / 2, w / 2):
            errors.append(f"{item['id']}: x spans {x0}..{x1}, not {-w / 2}..{w / 2}")
        ylo, yhi = y_span(item)
        if (y0, y1) != (ylo, yhi):
            errors.append(f"{item['id']}: y spans {y0}..{y1}, not {ylo}..{yhi}")
        if y0 < 0 or y1 > CELL_PX:
            errors.append(f"{item['id']}: y spans {y0}..{y1}, outside the cell")
        if z0 < -8 or z1 > 8:
            errors.append(f"{item['id']}: z spans {z0}..{z1}, outside the cell")
        glass = any(c["uv"]["north"] == face("glass") for c in cubes)
        if glass != item["glass"]:
            errors.append(f"{item['id']}: glass is {item['glass']} but the glass swatch is {'used' if glass else 'unused'}")
    for kind, pair in PAIRS.items():
        for end, (left, ahead) in enumerate(pair["ends"]):
            for item in standing(spec):
                (x0, _, z0), (x1, _, z1) = bounds(SHAPES.get(item["id"], []) or [box(0, 0, 0, 0, 0, 0, "cream")])
                if x0 - left < -8 or x1 - left > 8 or z0 - ahead < -8 or z1 - ahead > 8:
                    errors.append(f"{kind} end {end}: {item['id']} leaves the cell")
    for kind, pair in PAIRS.items():
        if any(item["height_px"] > pair.get("inside_px", CELL_PX) for item in standing(spec)):
            errors.append(f"a standing item is taller than the {kind} compartment")
    if pair_pages(spec) > MAX_STATE_VALUES or PAIR_PAGE_SIZE > MAX_STATE_VALUES:
        errors.append("a pair block state holds more than 16 values")
    if pair_pages(spec) < MIN_STATE_VALUES or PAIR_PAGE_SIZE < MIN_STATE_VALUES:
        errors.append("a pair block state holds fewer than 2 values")
    if errors:
        sys.exit("\n".join(errors))


def atlas_pixels():
    return bytes(
        c
        for y in range(ATLAS_SIZE)
        for x in range(ATLAS_SIZE)
        for c in PALETTE[SLOTS[(y // SWATCH) * SWATCH + x // SWATCH]]
    )


def write_png(path, size, pixels):
    stride = size * 4
    raw = b"".join(b"\x00" + pixels[y * stride : (y + 1) * stride] for y in range(size))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def read_png(path, size):
    """Decode a PNG this script wrote: 8-bit RGBA, size x size, every row unfiltered."""
    data = path.read_bytes()
    pos, idat = 8, b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        if kind == b"IHDR" and data[pos + 8 : pos + 18] != struct.pack(">IIBB", size, size, 8, 6):
            raise ValueError("not a 16 x 16 RGBA PNG")
        if kind == b"IDAT":
            idat += data[pos + 8 : pos + 8 + length]
        pos += length + 12
    raw = zlib.decompress(idat)
    stride = size * 4
    rows = [raw[y * (stride + 1) : (y + 1) * (stride + 1)] for y in range(size)]
    if any(len(row) != stride + 1 or row[0] != 0 for row in rows):
        raise ValueError("rows are not unfiltered")
    return b"".join(row[1:] for row in rows)


def terrain():
    return {
        "resource_pack_name": "yasu_ride",
        "texture_name": "atlas.terrain",
        "texture_data": {ATLAS_KEY: {"textures": "textures/blocks/yasu_ride/camping_gear"}},
    }


def num(v):
    return int(v) if float(v).is_integer() else v


def spot_translation(face, spot):
    """The world offset in blocks of `spot` when the camper's yaw is face * 90 degrees: the
    camper's forward is (-sin yaw, cos yaw) and its left (forward z, -forward x), as in room.ts.
    The translation applies after the rotation, in world axes."""
    left, ahead = SPOTS[spot]
    yaw = math.radians(90 * face)
    fx, fz = round(-math.sin(yaw)), round(math.cos(yaw))
    lx, lz = fz, -fx
    return ((left * lx + ahead * fx) / 16, (left * lz + ahead * fz) / 16)


def selection_box(item):
    """A hanging item keeps its footprint, so the box under the hook does not catch presses
    aimed at the table below (ADR 0097). A standing item's box spans the whole cell from the
    item's base to its top, at least 1 px, so a press anywhere on the furniture top under it
    reaches the decor block (ADR 0107)."""
    y0, y1 = y_span(item)
    if item["hanging"]:
        w = item["width_px"]
        return {"origin": [num(-w / 2), num(y0), num(-w / 2)], "size": [w, num(y1 - y0), w]}
    half = CELL_PX // 2
    return {"origin": [-half, num(y0), -half], "size": [CELL_PX, num(max(1, y1 - y0)), CELL_PX]}


def decor_block(item):
    gid = item["id"]
    return {
        "format_version": "1.21.80",
        "minecraft:block": {
            "description": {
                "identifier": f"yasu_ride:{gid}_decor",
                "menu_category": {"category": "none"},
                "states": {
                    FACE_STATE: list(FACES),
                    HEIGHT_STATE: list(HEIGHTS),
                    SPOT_STATE: list(range(len(SPOTS))),
                },
            },
            "components": {
                "minecraft:geometry": f"geometry.yasu_ride.{gid}",
                "minecraft:material_instances": {
                    "*": {"texture": ATLAS_KEY, "render_method": "blend" if item["glass"] else "opaque"}
                },
                "minecraft:light_dampening": 0,
                "minecraft:destructible_by_mining": False,
                "minecraft:destructible_by_explosion": False,
                LAID_TAG: {},
                "minecraft:custom_components": ["yasu_ride:camper_decor"],
                "minecraft:collision_box": False,
                "minecraft:selection_box": selection_box(item),
            },
            "permutations": [
                {
                    "condition": (
                        f"q.block_state('{FACE_STATE}') == {face} && q.block_state('{SPOT_STATE}') == {spot}"
                        f" && q.block_state('{HEIGHT_STATE}') == {height}"
                    ),
                    "components": {
                        "minecraft:transformation": {
                            "rotation": [0, FACE_ROTATION[face], 0],
                            "translation": [num(dx), num(height / 16), num(dz)],
                        }
                    },
                }
                for face in FACES
                for spot in range(len(SPOTS))
                for dx, dz in [spot_translation(face, spot)]
                for height in SPOT_HEIGHTS[spot]
            ],
        },
    }


def pair_block(kind, spec):
    """Both items of a shelf board or the table in one block (PAIRS). Its permutations only turn
    it by the face and lift it by the height, so the items stay over its own cell. A pair with one
    height has no height state (MIN_STATE_VALUES). The selection box covers the whole cell up to
    the tallest standing item, over both items (ADR 0108). A pair with a door, a storage
    compartment, shows its items only while open and takes its door's boxes (DOOR_BOXES, ADR
    0114, 0121, 0123)."""
    ids = [item["id"] for item in standing(spec)]
    door = PAIRS[kind].get("door")
    visibility = {}
    for end in range(2):
        for code, item_id in enumerate(ids, start=1):
            page, index = divmod(code, PAIR_PAGE_SIZE)
            visibility[pair_bone(end, item_id)] = (
                (f"q.block_state('{OPEN_STATE}') == true && " if door else "")
                + f"q.block_state('yasu_ride:end{end}_page') == {page}"
                f" && q.block_state('yasu_ride:end{end}_item') == {index}"
            )
    top = max(item["height_px"] for item in standing(spec))
    half = CELL_PX // 2
    heights = PAIRS[kind]["heights"]
    height_states = {HEIGHT_STATE: heights} if len(heights) >= MIN_STATE_VALUES else {}

    def condition(face, height):
        terms = [f"q.block_state('{FACE_STATE}') == {face}"]
        if height_states:
            terms.append(f"q.block_state('{HEIGHT_STATE}') == {height}")
        return " && ".join(terms)

    return {
        "format_version": "1.21.80",
        "minecraft:block": {
            "description": {
                "identifier": f"yasu_ride:{kind}_decor_pair",
                "menu_category": {"category": "none"},
                "states": {
                    FACE_STATE: list(FACES),
                    **height_states,
                    **({OPEN_STATE: [False, True]} if door else {}),
                    **{
                        f"yasu_ride:end{end}_{part}": list(range(size))
                        for end in range(2)
                        for part, size in (("item", PAIR_PAGE_SIZE), ("page", pair_pages(spec)))
                    },
                },
            },
            "components": {
                "minecraft:geometry": {
                    "identifier": f"geometry.yasu_ride.{kind}_decor_pair",
                    "bone_visibility": visibility,
                },
                "minecraft:material_instances": {
                    "*": {"texture": ATLAS_KEY, "render_method": "opaque"},
                },
                "minecraft:light_dampening": 0,
                "minecraft:destructible_by_mining": False,
                "minecraft:destructible_by_explosion": False,
                LAID_TAG: {},
                **(DOOR_BOXES[door][0](heights[0]) if door else {
                    "minecraft:custom_components": ["yasu_ride:camper_decor"],
                    "minecraft:collision_box": False,
                    "minecraft:selection_box": {"origin": [-half, 0, -half], "size": [CELL_PX, top, CELL_PX]},
                }),
            },
            "permutations": [
                {
                    "condition": condition(face, height),
                    "components": {
                        "minecraft:transformation": {
                            "rotation": [0, FACE_ROTATION[face], 0],
                            "translation": [0, num(height / 16), 0],
                        },
                        **(DOOR_BOXES[door][1](height) if door else {}),
                    },
                }
                for face in FACES
                for height in heights
            ],
        },
    }


def ceiling_boxes(lift):
    """A compartment under the ceiling: its component and boxes, before its lift (OPEN_STATE)."""
    half = CELL_PX // 2
    return {
        "minecraft:custom_components": [CABINET_COMPONENT],
        "minecraft:collision_box": {
            "origin": [-half, CELL_PX - CEILING_PLATE_PX - lift, -half],
            "size": [CELL_PX, CEILING_PLATE_PX, CELL_PX],
        },
        "minecraft:selection_box": {"origin": [-half, 0, -half], "size": [CELL_PX, CABINET_BOX_PX, CELL_PX]},
    }


def open_cell_component(_lift):
    """A compartment without collision: its component; each permutation sets its box."""
    return {"minecraft:custom_components": [CABINET_COMPONENT], "minecraft:collision_box": False}


def floor_to_top_box(lift):
    """The selection box from the compartment floor to the cell's top once lifted by `lift`."""
    half = CELL_PX // 2
    return {"minecraft:selection_box": {"origin": [-half, 0, -half], "size": [CELL_PX, CELL_PX - lift, CELL_PX]}}


# A compartment's boxes by its PAIRS "door": the components every permutation shares, then those
# of the permutation at each height.
DOOR_BOXES = {
    "ceiling": (ceiling_boxes, lambda _height: {}),
    "cell": (open_cell_component, floor_to_top_box),
}


def gear_item(item):
    gid = item["id"]
    return {
        "format_version": "1.21.80",
        "minecraft:item": {
            "description": {"identifier": f"yasu_ride:{gid}", "menu_category": {"category": "items"}},
            "components": {
                "minecraft:icon": f"yasu_ride_{gid}",
                "minecraft:max_stack_size": 64,
                "minecraft:display_name": {"value": f"item.yasu_ride:{gid}.name"},
            },
        },
    }


def catalog(spec):
    return {
        "format_version": "1.21.60",
        "minecraft:crafting_items_catalog": {
            "categories": [
                {
                    "category_name": "items",
                    "groups": [
                        {
                            "group_identifier": {"icon": GROUP_ICON, "name": GROUP},
                            "items": [f"yasu_ride:{BOX}"]
                            + [f"yasu_ride:{item['id']}" for item in spec]
                            + [f"yasu_ride:{i}" for i in OUTDOOR_ITEMS],
                        }
                    ],
                }
            ]
        },
    }


def item_textures(current, spec):
    """Keep every other entry in its order, then the box and each gear item, in spec order (ADR 0093)."""
    owned = [BOX] + [item["id"] for item in spec]
    keys = {f"yasu_ride_{i}" for i in owned}
    data = {k: v for k, v in current["texture_data"].items() if k not in keys}
    for i in owned:
        data[f"yasu_ride_{i}"] = {"textures": f"textures/items/yasu_ride/{i}"}
    return {
        "resource_pack_name": current["resource_pack_name"],
        "texture_name": current["texture_name"],
        "texture_data": data,
    }


def stale_files(documents, atlas):
    stale = []
    for path, document in documents.items():
        try:
            if json.loads(path.read_text()) != document:
                stale.append(str(path))
        except (OSError, ValueError) as e:
            stale.append(f"{path} ({e})")
    try:
        if read_png(atlas, ATLAS_SIZE) != atlas_pixels():
            stale.append(str(atlas))
    except (OSError, ValueError, struct.error, zlib.error) as e:
        stale.append(f"{atlas} ({e})")
    return stale


def write_files(documents, atlas):
    for path, document in documents.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(document, separators=(",", ":")) + "\n")
        print(f"wrote {path}")
    atlas.parent.mkdir(parents=True, exist_ok=True)
    write_png(atlas, ATLAS_SIZE, atlas_pixels())
    print(f"wrote {atlas}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("behavior_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    spec = json.loads(SPEC.read_text())
    validate(spec)
    rp = args.resource_pack
    documents = {rp / MODELS / f"{item_id}.geo.json": geometry(item_id, cubes) for item_id, cubes in SHAPES.items()}
    for kind in PAIRS:
        documents[rp / MODELS / f"{kind}_decor_pair.geo.json"] = pair_geometry(kind, spec)
    documents[rp / TERRAIN] = terrain()
    bp = args.behavior_pack
    for item in spec:
        gid = item["id"]
        documents[bp / BLOCKS / f"{gid}_decor.block.json"] = decor_block(item)
        documents[bp / ITEMS / f"{gid}.item.json"] = gear_item(item)
    for kind in PAIRS:
        documents[bp / BLOCKS / f"{kind}_decor_pair.block.json"] = pair_block(kind, spec)
    documents[bp / CATALOG] = catalog(spec)
    documents[rp / ITEM_TEXTURES] = item_textures(json.loads((rp / ITEM_TEXTURES).read_text()), spec)
    atlas = rp / ATLAS
    if not args.check:
        write_files(documents, atlas)
        return
    stale = stale_files(documents, atlas)
    if stale:
        sys.exit(f"{', '.join(stale)} out of date with tools/gen_camping_gear.py and tools/camping_gear.json. Run `pnpm model` and commit the result.")
    print("camping gear models, atlas, blocks, items, and catalog are up to date")


if __name__ == "__main__":
    main()
