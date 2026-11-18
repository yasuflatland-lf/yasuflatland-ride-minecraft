"""Camper material classifications and curtain geometry constants and pixels."""

import math
import random
from enum import Enum


class Material(Enum):
    SWATCHES_MIXED = "swatches_mixed"
    METAL = "metal"
    LACQUER = "lacquer"
    GLASS_COAT = "glass_coat"
    VINYL = "vinyl"
    WOOD = "wood"
    FABRIC = "fabric"
    CARPET = "carpet"
    TILE = "tile"
    STONE = "stone"
    DARK_LACQUER = "dark_lacquer"


# Single source for the curtain geometry and the fold shading baked into the
# fabric region. camper_kit asserts that WIN_Y matches CURTAIN_WINDOW_Y.
CURTAIN_WINDOW_Y = (36, 49)
_WIN_Y0, _WIN_Y1 = CURTAIN_WINDOW_Y
CURTAIN_HEM_Y = round(_WIN_Y0 - .45, 3)
CURTAIN_TOP_Y = round(_WIN_Y1 + .76, 3)
CURTAIN_TIE_Y = round(_WIN_Y0 + 4.15, 3)
CURTAIN_RAIL_Y = (round(_WIN_Y1 + .87, 3), round(_WIN_Y1 + .97, 3))
CURTAIN_MAX_WIDTH = 4.1
CURTAIN_NARROW_RATIO = .27
CURTAIN_SPAN_RATIO = .43
CURTAIN_LOWER_RATIO = .70
CURTAIN_FAN_COLUMNS = 4
CURTAIN_LEVELS = (
    CURTAIN_HEM_Y,
    round(_WIN_Y0 + .3, 3),
    round(_WIN_Y0 + 1.3, 3),
    round(_WIN_Y0 + 2.5, 3),
    CURTAIN_TIE_Y,
    42,
    44.2,
    46.4,
    round(_WIN_Y1 - .05, 3),
    round(_WIN_Y1 + .68, 3),
)
# Distances from the wall's inner face toward the cabin.
CURTAIN_CLOTH_DEPTH = .48
CURTAIN_FOLD_DEPTH = .26
CURTAIN_TIE_DEPTH = 1.06
CURTAIN_RAIL_DEPTH = .66


def curtain_width(y, width):
    narrow = width * CURTAIN_NARROW_RATIO
    if y >= CURTAIN_TIE_Y:
        return narrow + (width - narrow) * ((y - CURTAIN_TIE_Y) / (CURTAIN_TOP_Y - CURTAIN_TIE_Y)) ** .85
    return narrow + (width * CURTAIN_LOWER_RATIO - narrow) * (math.sin((CURTAIN_TIE_Y - y) / (CURTAIN_TIE_Y - CURTAIN_HEM_Y) * math.pi / 2) ** .86)

def _curtain_pixels():
    rng = random.Random(1968)
    pixels = []
    for v in range(120):
        y = CURTAIN_TOP_Y - (v + .5) / 8
        fade = .48 + .52 * min(1, abs(y - CURTAIN_TIE_Y) / 4)
        width = curtain_width(y, CURTAIN_MAX_WIDTH)
        for u in range(96):
            j = min(CURTAIN_FAN_COLUMNS - 1, int(u / 24))
            local = (u - j * 24 + .5) / 24
            ya, yb = next(((a, b) for a, b in zip(CURTAIN_LEVELS, CURTAIN_LEVELS[1:]) if a <= y <= b), (CURTAIN_LEVELS[-2], CURTAIN_TOP_Y))
            wa, wb = curtain_width(ya, CURTAIN_MAX_WIDTH), curtain_width(yb, CURTAIN_MAX_WIDTH)
            t = max(0, min(1, (y - ya) / (yb - ya)))
            p = (local * max(wa, wb) / CURTAIN_FAN_COLUMNS * 1.05) / width if j == 0 else ((j + .5) / CURTAIN_FAN_COLUMNS * (wa + (wb - wa) * t) + (local - .5) * max(wa, wb) / CURTAIN_FAN_COLUMNS * 1.05) / width
            phase = p * 12 * math.pi
            slope = .17 * fade * 12 * math.pi * math.sin(phase) / width
            factor = (.89 + .11 * math.cos(phase)) * (1 + (.8 / .6 - 1) * slope * slope / (1 + slope * slope))
            factor *= 1 - .09 * math.exp(-((y - round(CURTAIN_TIE_Y - .35, 3)) / .16) ** 2)
            if v < 7 and u % 16 in (6, 7, 9, 10):
                factor *= .91
            if 112 <= v < 114:
                factor *= .95
            n = rng.choice((-2, -1, 0, 1, 2)) + (1 if u % 2 == 0 else -1)
            if v % 7 == 0 and (u + 13 * (v // 7)) % 31 < 12: n += 5
            if v % 7 == 1 and (u + 13 * (v // 7)) % 31 < 12: n -= 5
            pixels.append(tuple(max(0, min(255, round(c * factor + n))) for c in (196, 120, 60)) + (255,))
        # The reference consumes a full 114-pixel source row before the next row.
        for _ in range(18):
            rng.choice((-2, -1, 0, 1, 2))
    return pixels

CURTAIN_PIXELS = _curtain_pixels()

def curtain_pixel(x, y):
    return CURTAIN_PIXELS[y * 96 + x]
