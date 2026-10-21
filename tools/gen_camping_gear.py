"""Generate the camping gear block models and their shared texture atlas (ADR 0093).

    python3 -I tools/gen_camping_gear.py <resource pack> <behavior pack>          write the files
    python3 -I tools/gen_camping_gear.py <resource pack> <behavior pack> --check  fail if any file is stale

tools/camping_gear.json lists the items; SHAPES below gives each item's cubes. Units are pixels (16
per block). Every model is centered on x 0 and z 0, with its front at -z (ADR 0009). A standing item
stands on y 0; a hanging item hangs from HOOK_Y. The atlas is 16 x 16 with one 4 x 4 swatch per
color, so mipmapping in the block atlas does not bleed a neighbor's color into a face. --check
compares parsed JSON and decoded pixels, because Biome reformats the geometry and zlib builds do not
all compress identically. It also writes the Behavior Pack decor blocks, the items, the creative
catalog, and the gear part of item_texture.json; the decor block's face and height states are
described next to FACE_ROTATION. The camping gear box (BOX) is the creative group's icon and first
item, and its icon entry comes first in the generated part of item_texture.json; its item JSON and
icon are written elsewhere (ADR 0093).
"""

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

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
GROUP = "yasu_ride:camping_gear"
# The box a player gets with their first camper (ADR 0093): the group's icon and first item.
BOX = "camping_gear_box"
GROUP_ICON = f"yasu_ride:{BOX}"
ATLAS_SIZE = 16
SWATCH = 4
# A hanging item's top, in px above the bottom of the ceiling_hook slot's cell: the top of the
# cell, where the camper model's hook ends. The client did not draw a model that reached 29 px and
# showed an unshaped block instead, so every model stays within its cell (ADR 0099).
HOOK_Y = 16
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
        box(-2.5, HOOK_Y - 10, -2.5, 2.5, HOOK_Y - 7, 2.5, "terracotta"),
        box(-2, HOOK_Y - 7, -2, 2, HOOK_Y - 5, 2, "leaf"),
        box(0.5, HOOK_Y - 9.5, -3, 1.5, HOOK_Y - 7, -2.5, "leaf"),
        box(-2.5, HOOK_Y - 7, -0.25, -2, HOOK_Y - 1.5, 0.25, "cream"),
        box(2, HOOK_Y - 7, -0.25, 2.5, HOOK_Y - 1.5, 0.25, "cream"),
        box(-0.25, HOOK_Y - 7, -2.5, 0.25, HOOK_Y - 1.5, -2, "cream"),
        box(-0.25, HOOK_Y - 7, 2, 0.25, HOOK_Y - 1.5, 2.5, "cream"),
        box(-2.5, HOOK_Y - 1.5, -0.25, 2.5, HOOK_Y - 1, 0.25, "cream"),
        box(-0.25, HOOK_Y - 1.5, -2.5, 0.25, HOOK_Y - 1, 2.5, "cream"),
        box(-0.5, HOOK_Y - 1, -0.5, 0.5, HOOK_Y, 0.5, "cream"),
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


def bounds(cubes):
    lo = [min(c["origin"][i] for c in cubes) for i in range(3)]
    hi = [max(c["origin"][i] + c["size"][i] for c in cubes) for i in range(3)]
    return lo, hi


def y_span(item):
    """A hanging item ends at HOOK_Y; every other item starts on the cell floor."""
    h = item["height_px"]
    return (HOOK_Y - h, HOOK_Y) if item["hanging"] else (0, h)


def selection_span(item):
    """The decor block's outline covers the model, clipped to its cell (ADR 0099)."""
    lo, hi = y_span(item)
    return max(0, lo), min(CELL_PX, hi)


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


def decor_block(item):
    gid = item["id"]
    w = item["width_px"]
    y0, y1 = selection_span(item)
    return {
        "format_version": "1.21.80",
        "minecraft:block": {
            "description": {
                "identifier": f"yasu_ride:{gid}_decor",
                "menu_category": {"category": "none"},
                "states": {FACE_STATE: list(FACES), HEIGHT_STATE: list(HEIGHTS)},
            },
            "components": {
                "minecraft:geometry": f"geometry.yasu_ride.{gid}",
                "minecraft:material_instances": {
                    "*": {"texture": ATLAS_KEY, "render_method": "blend" if item["glass"] else "opaque"}
                },
                "minecraft:light_dampening": 0,
                "minecraft:destructible_by_mining": False,
                "minecraft:destructible_by_explosion": False,
                "minecraft:custom_components": ["yasu_ride:camper_decor"],
                "minecraft:collision_box": False,
                "minecraft:selection_box": {"origin": [num(-w / 2), num(y0), num(-w / 2)], "size": [w, num(y1 - y0), w]},
            },
            "permutations": [
                {
                    "condition": f"q.block_state('{FACE_STATE}') == {face} && q.block_state('{HEIGHT_STATE}') == {height}",
                    "components": {
                        "minecraft:transformation": {
                            "rotation": [0, FACE_ROTATION[face], 0],
                            "translation": [0, num(height / 16), 0],
                        }
                    },
                }
                for face in FACES
                for height in HEIGHTS
            ],
        },
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
                            "items": [f"yasu_ride:{BOX}"] + [f"yasu_ride:{item['id']}" for item in spec],
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
    documents[rp / TERRAIN] = terrain()
    bp = args.behavior_pack
    for item in spec:
        gid = item["id"]
        documents[bp / BLOCKS / f"{gid}_decor.block.json"] = decor_block(item)
        documents[bp / ITEMS / f"{gid}.item.json"] = gear_item(item)
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
