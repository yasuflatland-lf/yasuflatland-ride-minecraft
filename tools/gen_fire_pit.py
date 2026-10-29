"""Generate the stainless folding fire pit, its PBR maps, and texture set."""

import argparse
import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

mer_atlas = load_tool("mer_atlas")

GRILL_TOP = 12.5
SIZE = 32
SWATCH = 8
GEOMETRY = "models/entity/yasu_ride/fire_pit.geo.json"
TEXTURE = "textures/entity/yasu_ride/fire_pit.png"
MER = "textures/entity/yasu_ride/fire_pit_mer.png"
TEXTURE_SET = "textures/entity/yasu_ride/fire_pit.texture_set.json"

# The first seven swatches are stainless steel: bright outer panels have a
# mirror-smooth MER roughness of zero, while the heat-exposed basin is duller.
PALETTE = [
    ((207, 214, 218), (255, 0, 0)),
    ((154, 163, 169), (255, 0, 8)),
    ((238, 242, 244), (255, 0, 0)),
    ((83, 92, 99), (255, 0, 20)),
    ((116, 123, 127), (245, 0, 36)),
    ((62, 61, 58), (130, 0, 155)),
    ((222, 227, 229), (255, 0, 6)),
    ((37, 39, 41), (0, 0, 220)),
    ((255, 186, 40), (0, 255, 255)),
    ((255, 105, 18), (0, 255, 255)),
    ((235, 58, 14), (0, 230, 255)),
    ((99, 32, 17), (0, 180, 255)),
    ((0, 0, 0), (0, 0, 255)),
    ((0, 0, 0), (0, 0, 255)),
    ((0, 0, 0), (0, 0, 255)),
    ((0, 0, 0), (0, 0, 255)),
]


def face(slot):
    return mer_atlas.face(slot, SWATCH, SIZE // SWATCH)


def box(x0, y0, z0, x1, y1, z1, slot, pivot=None, rotation=None):
    cube = {
        "origin": [x0, y0, z0],
        "size": [x1 - x0, y1 - y0, z1 - z0],
        "uv": {side: face(slot) for side in ("north", "south", "east", "west", "up", "down")},
    }
    if rotation is not None:
        cube["pivot"] = list(pivot)
        cube["rotation"] = list(rotation)
    return cube


def geometry():
    frame = []
    # Two folding A frames, a lower rack, and a suspended shallow fire bowl.
    for x, angle in ((-6.3, 7), (6.3, -7)):
        for z in (-5.1, 5.1):
            frame.append(box(x - 0.45, 0, z - 0.45, x + 0.45, 15.5, z + 0.45, 0, (x, 0, z), (0, 0, angle)))
            frame.append(box(x - 0.65, 0, z - 0.65, x + 0.65, 0.7, z + 0.65, 7))
    for z in (-5.1, 5.1):
        frame.append(box(-6.8, 3, z - 0.35, 6.8, 3.7, z + 0.35, 1))
        frame.append(box(-6.6, 11.2, z - 0.35, 6.6, 11.9, z + 0.35, 2))
    # The shallow lower shelf is visible below the bowl from the side.
    frame.append(box(-5.5, 3.6, -4.5, 5.5, 3.85, 4.5, 1))
    frame.append(box(-5.7, 3.6, -4.7, 5.7, 4.1, -4.2, 2))
    frame.append(box(-5.7, 3.6, 4.2, 5.7, 4.1, 4.7, 2))
    # Bright rolled lips and faceted sloping walls surround a dark hot basin.
    frame.append(box(-4.9, 7.6, -4.9, 4.9, 7.9, 4.9, 5))
    for width, y0, y1, slot in ((3.7, 7.8, 8.9, 4), (4.5, 8.9, 10.1, 1), (5.3, 10.1, 11.4, 0)):
        frame.append(box(-width, y0, -width, width, y1, -width + 0.45, slot))
        frame.append(box(-width, y0, width - 0.45, width, y1, width, slot))
        frame.append(box(-width, y0, -width, -width + 0.45, y1, width, slot))
        frame.append(box(width - 0.45, y0, -width, width, y1, width, slot))
    for z in (-5.5, 5.5):
        frame.append(box(-5.7, 11.4, z - 0.28, 5.7, 11.9, z + 0.28, 2))
    for x in (-5.5, 5.5):
        frame.append(box(x - 0.28, 11.4, -5.5, x + 0.28, 11.9, 5.5, 2))
    for x in (-3, 0, 3):
        frame.append(box(x - 0.15, 8, -3.4, x + 0.15, 8.15, 3.4, 3))
    # A small perforated wind plate and rear handle echo the supplied photos.
    frame.append(box(-4.6, 9.3, -5.5, 4.6, 10.2, -5.25, 6))
    for x in (-3.3, -1.1, 1.1, 3.3):
        frame.append(box(x - 0.12, 9.55, -5.75, x + 0.12, 9.8, -5.15, 3))
    frame.append(box(-1.8, 11.3, 5.6, 1.8, 11.65, 6.3, 2))
    grill = []
    for edge in (-5.7, 5.2):
        grill.append(box(-5.7, 11.9, edge, 5.7, 12.4, edge + 0.5, 0))
        grill.append(box(edge, 11.9, -5.7, edge + 0.5, 12.4, 5.7, 2))
    for i in range(9):
        offset = round(-4.8 + i * 1.2, 2)
        grill.append(box(offset - 0.15, 11.9, -5.4, offset + 0.15, 12.2, 5.4, 1))
        grill.append(box(-5.4, 12.2, offset - 0.15, 5.4, GRILL_TOP, offset + 0.15, 2))
    embers = [
        box(-2.6, 8.1, -1.7, 2.6, 8.45, 1.7, 11),
        box(-1.7, 8.45, -0.7, 1.7, 8.75, 0.7, 9),
        box(-0.65, 8.75, -0.4, 0.65, 9.05, 0.4, 8),
    ]
    return {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": "geometry.yasu_ride.fire_pit",
                "texture_width": SIZE,
                "texture_height": SIZE,
                "visible_bounds_width": 2,
                "visible_bounds_height": 2,
                "visible_bounds_offset": [0, 0.5, 0],
            },
            "bones": [
                {"name": "root", "pivot": [0, 0, 0], "cubes": frame, "locators": {"flame": [0, 9, 0]}},
                {"name": "grill", "parent": "root", "pivot": [0, 0, 0], "cubes": grill},
                {"name": "embers", "parent": "root", "pivot": [0, 0, 0], "cubes": embers},
            ],
        }],
    }


def validate(doc):
    grill = next(b for b in doc["minecraft:geometry"][0]["bones"] if b["name"] == "grill")
    assert grill["parent"] == "root" and grill["pivot"] == [0, 0, 0]
    tops = []
    for cube in grill["cubes"]:
        origin, size = cube["origin"], cube["size"]
        assert origin[1] >= 11.9
        for axis in (0, 2):
            assert origin[axis] >= -5.78 and origin[axis] + size[axis] <= 5.78
        tops.append(origin[1] + size[1])
    assert max(tops) == GRILL_TOP


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    doc = geometry()
    validate(doc)
    mer_atlas.write_or_check(args.resource_pack, args.check, {
        "geometry": (GEOMETRY, doc),
        "texture_set": (TEXTURE_SET, mer_atlas.texture_set_doc("fire_pit")),
        "color": (TEXTURE, SIZE, mer_atlas.atlas_pixels(PALETTE, SIZE, SWATCH)),
        "mer": (MER, SIZE, mer_atlas.mer_pixels(PALETTE, SIZE, SWATCH)),
    }, "fire pit model, PBR maps, or texture set is stale; run pnpm model")


if __name__ == "__main__":
    main()
