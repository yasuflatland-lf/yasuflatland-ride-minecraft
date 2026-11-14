"""Deterministic six-wale tweed and satin vinyl for the cab bucket seats."""

import math
import random
from tool_loader import load_tool

regions = load_tool("camper_regions")
NAME = "green tweed and vinyl shared by both seats"
VINYL_NAME = "cab seat vinyl"
TRIM_NAME = "cab seat vinyl swatches"
WALE_SIZE, VINYL_SIZE = 128, 64
WIDTH, HEIGHT = 333, WALE_SIZE
COLORS = {
    "cloth_shadow": (103, 111, 28), "cloth_dark": (125, 134, 33),
    "cloth_olive": (145, 154, 38), "cloth_chartreuse": (163, 172, 44),
    "cloth_yellow": (180, 187, 55), "cloth_light": (196, 201, 73),
    "cloth_slub": (211, 213, 102), "vinyl_shadow": (72, 76, 59),
    "vinyl_olive": (87, 92, 73), "vinyl_mid": (103, 108, 88),
    "vinyl_satin": (120, 125, 103), "vinyl_edge": (140, 144, 119),
    "piping": (161, 163, 130),
}
CLOTH_COLORS = 7
WALE_COUNT = 6
WEAVE_SEEDS = (307, 308)
YARN_COUNT = 260
NOISE = (-.5, -.25, 0, 0, .25, .5)
SLUB_CHANCE, SLUB_NOISE = .075, (-2.2, 1.8)
WEAVE_BASE, TROUGH_DEPTH, CREST_HEIGHT, THREAD_LIGHT = 3.4, 2.6, 1.0, .32
TROUGH_PHASE, TROUGH_WIDTH, CREST_PHASE, CREST_WIDTH = .04, .075, .27, .19
SHEEN_BASE, SHEEN_STRENGTH, SHEEN_PHASE, SHEEN_WIDTH = 2.0, 1.7, .16, .18
GRAIN_X, GRAIN_Y, GRAIN_PERIOD, GRAIN_LIGHT = 17, 29, 23, .15
VINYL_OFFSET, SWATCH_OFFSET = 2 * WALE_SIZE, 2 * WALE_SIZE + VINYL_SIZE


def pixels():
    palette = [(*rgb, 255) for rgb in COLORS.values()]
    cloth, vinyl = palette[:CLOTH_COLORS], palette[CLOTH_COLORS:-1]
    slab = [[(0, 0, 0, 0)] * WIDTH for _ in range(HEIGHT)]
    for panel, seed in enumerate(WEAVE_SEEDS):
        rng = random.Random(seed)
        offset = panel * WALE_SIZE
        for y in range(WALE_SIZE):
            for x in range(WALE_SIZE):
                phase = (x + .5) / WALE_SIZE * WALE_COUNT % 1
                trough = math.exp(-((phase - TROUGH_PHASE) / TROUGH_WIDTH) ** 2)
                crest = math.exp(-((phase - CREST_PHASE) / CREST_WIDTH) ** 2)
                value = WEAVE_BASE - TROUGH_DEPTH * trough + CREST_HEIGHT * crest
                value += THREAD_LIGHT if (x + y) % 2 else -THREAD_LIGHT
                value += rng.choice(NOISE)
                if rng.random() < SLUB_CHANCE:
                    value += rng.choice(SLUB_NOISE)
                slab[y][offset + x] = cloth[max(0, min(len(cloth) - 1, round(value)))]
        for _ in range(YARN_COUNT):
            x, y = rng.randrange(WALE_SIZE - 1), rng.randrange(WALE_SIZE)
            color = rng.choice((cloth[1], cloth[-2], cloth[-1]))
            slab[y][offset + x] = slab[y][offset + x + 1] = color
    for y in range(VINYL_SIZE):
        for x in range(VINYL_SIZE):
            edge = min(x, VINYL_SIZE - 1 - x) / ((VINYL_SIZE - 1) / 2)
            sheen = SHEEN_BASE + SHEEN_STRENGTH * math.exp(-((edge - SHEEN_PHASE) / SHEEN_WIDTH) ** 2)
            if (x * GRAIN_X + y * GRAIN_Y) % GRAIN_PERIOD == 0:
                sheen += GRAIN_LIGHT
            slab[y][VINYL_OFFSET + x] = vinyl[max(0, min(len(vinyl) - 1, round(sheen)))]
    for i, color in enumerate(palette):
        slab[0][SWATCH_OFFSET + i] = color
    return slab


def register(registry):
    existing = {r.name: r for r in registry.regions()}
    if NAME not in existing:
        slab = pixels()
        # Keep the complete reference slab, but resolve vinyl faces through material-specific regions.
        registry.register(regions.Region(NAME, WIDTH, HEIGHT, regions.Material.FABRIC,
                                         lambda x, y: slab[y][x]))
        registry.register(regions.Region(VINYL_NAME, VINYL_SIZE, VINYL_SIZE, regions.Material.VINYL,
                                         lambda x, y: slab[y][VINYL_OFFSET + x]))
        registry.register(regions.Region(TRIM_NAME, len(COLORS) - CLOTH_COLORS, 1, regions.Material.VINYL,
                                         lambda x, y: slab[0][SWATCH_OFFSET + CLOTH_COLORS + x]))
    return {r.name: regions.RegionRef(registry, r) for r in registry.regions()
            if r.name in (NAME, VINYL_NAME, TRIM_NAME)}
