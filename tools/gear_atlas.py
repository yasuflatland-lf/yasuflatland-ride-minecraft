"""Shared named swatches and UV layout for camping gear."""

ATLAS_SIZE = 16
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


def atlas_pixels():
    return bytes(
        c
        for y in range(ATLAS_SIZE)
        for x in range(ATLAS_SIZE)
        for c in PALETTE[SLOTS[(y // SWATCH) * SWATCH + x // SWATCH]]
    )
