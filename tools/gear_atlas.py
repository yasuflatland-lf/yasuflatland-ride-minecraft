"""Camping gear atlas layout (ADR 0247).

The 512 x 512 atlas has a 4 x 4 grid of 128 x 128 cells.
Static GEAR_TILES cells contain independently shelf-packed regions, with two-texel
region gutters and four-texel cell gutters. Cell 0 preserves the flat swatches.
After a rebase or merge, never hand-merge camping_gear.png or any generated gear
file: take either side (git checkout --theirs / --ours), run pnpm model, and
commit the regenerated files. pnpm model:check proves freshness.
"""

from collections import deque
from dataclasses import dataclass

ATLAS_SIZE = 512
CELL = 128
CELL_GUTTER = 4
REGION_GUTTER = 2
TEXELS_PER_PX = 8
LETTERING_TEXELS_PER_PX = 16

# Item PRs never edit this table (ADR 0247).
GEAR_TILES = {
    "percolator": 1,
    "toaster": 2,
    "enamel_kettle": 3,
    "transistor_radio": 4,
    "sugar_pot": 5,
    "mug_pair": 6,
    "saucepan": 7,
    "potted_plant": 8,
    "cactus_pot": 9,
    "macrame_planter": 10,
    "alarm_clock": 11,
    "instant_camera": 12,
    "binoculars": 13,
}
SWATCH = 4
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


@dataclass(frozen=True)
class Tile:
    item_id: str
    x: int
    y: int
    width: int
    height: int
    pixels: bytearray

    def get(self, x, y):
        assert 0 <= x < self.width and 0 <= y < self.height
        offset = (y * self.width + x) * 4
        return tuple(self.pixels[offset:offset + 4])

    def set(self, x, y, rgba):
        assert 0 <= x < self.width and 0 <= y < self.height
        offset = (y * self.width + x) * 4
        self.pixels[offset:offset + 4] = bytes(rgba)

    def uv(self, x0, y0, x1, y1):
        assert 0 <= x0 <= self.width and 0 <= x1 <= self.width
        assert 0 <= y0 <= self.height and 0 <= y1 <= self.height
        return {"uv": [self.x + x0, self.y + y0], "uv_size": [x1 - x0, y1 - y0]}


_reserved = {}
_shelves = {}
_active = None


def begin(item_id):
    global _active
    _reserved[item_id] = []
    _shelves[item_id] = (0, 0, 0)
    _active = item_id


def tile(item_id, width, height) -> Tile:
    if item_id not in GEAR_TILES:
        raise ValueError(f"{item_id}: no atlas cell")
    if item_id != _active:
        raise ValueError(f"{item_id}: build items through gear_registry.build")
    usable = CELL - 2 * CELL_GUTTER
    fw, fh = width + 2 * REGION_GUTTER, height + 2 * REGION_GUTTER
    x, y, row_height = _shelves[item_id]
    if x + fw > usable:
        x, y, row_height = 0, y + row_height, 0
    if (not isinstance(width, int) or not isinstance(height, int)
            or width <= 0 or height <= 0 or fw > usable or y + fh > usable):
        raise ValueError(f"{item_id}: region {width} x {height} does not fit")
    cell = GEAR_TILES[item_id]
    result = Tile(item_id, CELL * (cell % 4) + CELL_GUTTER + x + REGION_GUTTER,
                  CELL * (cell // 4) + CELL_GUTTER + y + REGION_GUTTER,
                  width, height, bytearray(width * height * 4))
    _reserved[item_id].append(result)
    _shelves[item_id] = (x + fw, y, max(row_height, fh))
    return result


def tiles():
    return tuple(region for item_id in GEAR_TILES for region in _reserved.get(item_id, ()))


def pad_cutouts(region):
    """Copy nearest visible RGB using row-major seeds and a fixed neighbor order."""
    pixels = bytearray(region.pixels)
    seen = [pixels[i + 3] > 0 for i in range(0, len(pixels), 4)]
    queue = deque(i for i, visible in enumerate(seen) if visible)
    while queue:
        index = queue.popleft()
        x, y = index % region.width, index // region.width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < region.width and 0 <= ny < region.height:
                neighbor = ny * region.width + nx
                if not seen[neighbor]:
                    seen[neighbor] = True
                    pixels[neighbor * 4:neighbor * 4 + 3] = pixels[index * 4:index * 4 + 3]
                    queue.append(neighbor)
    return pixels


def check_alpha(item_id, glass):
    errors = []
    for index, region in enumerate(_reserved.get(item_id, ())):
        for offset in range(3, len(region.pixels), 4):
            alpha = region.pixels[offset]
            if alpha not in (0, 255) and (not glass or not 64 <= alpha <= 192):
                pixel = offset // 4
                errors.append(f"{item_id}: tile {index} texel ({pixel % region.width}, "
                              f"{pixel // region.width}) has invalid alpha {alpha}")
    return errors


def atlas_pixels():
    pixels = bytearray(ATLAS_SIZE * ATLAS_SIZE * 4)

    def put(x, y, rgba):
        offset = (y * ATLAS_SIZE + x) * 4
        pixels[offset:offset + 4] = bytes(rgba)

    for y in range(CELL):
        for x in range(CELL):
            put(x, y, PALETTE[SLOTS[(min(y, 15) // SWATCH) * SWATCH + min(x, 15) // SWATCH]])
    for item_id, cell in GEAR_TILES.items():
        regions = _reserved.get(item_id, ())
        if not regions:
            continue
        for region in regions:
            padded = pad_cutouts(region)
            for y in range(-REGION_GUTTER, region.height + REGION_GUTTER):
                for x in range(-REGION_GUTTER, region.width + REGION_GUTTER):
                    sx = min(max(x, 0), region.width - 1)
                    sy = min(max(y, 0), region.height - 1)
                    offset = (sy * region.width + sx) * 4
                    put(region.x + x, region.y + y, padded[offset:offset + 4])
        cx, cy = CELL * (cell % 4), CELL * (cell // 4)
        for y in range(CELL):
            for x in range(CELL):
                if CELL_GUTTER <= x < CELL - CELL_GUTTER and CELL_GUTTER <= y < CELL - CELL_GUTTER:
                    continue
                sx = cx + min(max(x, CELL_GUTTER), CELL - CELL_GUTTER - 1)
                sy = cy + min(max(y, CELL_GUTTER), CELL - CELL_GUTTER - 1)
                offset = (sy * ATLAS_SIZE + sx) * 4
                put(cx + x, cy + y, pixels[offset:offset + 4])
    return bytes(pixels)
