"""Paint the SUV gauges and steering wheel leather."""

import math
from functools import lru_cache

from tool_loader import load_tool

palette = load_tool("suv_palette")
dash = load_tool("suv_paint_dash")
RegionSpec = load_tool("suv_texture").RegionSpec
REGIONS = (RegionSpec("tach", 32, 32, "resin"), RegionSpec("fuel_temp", 24, 24, "resin"),
           RegionSpec("speed", 32, 32, "resin"), RegionSpec("leather", 8, 8, "seat"))
TICKS_TACH = 9
TICKS_SPEED = 11
TICKS_FUEL_TEMP = 10
TICK_COUNTS = {"tach": TICKS_TACH, "speed": TICKS_SPEED, "fuel_temp": TICKS_FUEL_TEMP}
NEEDLE_ANGLES = {"tach": (145,), "speed": (35,), "fuel_temp": (150, 35)}
NEEDLE_LENGTH = 0.29
FACE_RGB = (12, 13, 14)
DOT_RGB = (100, 100, 100)
LCD_RECT = (11, 22, 20, 25)
LCD_FILL = (30, 36, 33)
LCD_FRAME = (6, 7, 7)
LEATHER_PERFORATION_DELTA = -8
LEATHER_GRAIN_DELTA = 12


def in_dial(size, u, v):
    return (u + 0.5 - size / 2) ** 2 + (v + 0.5 - size / 2) ** 2 < (size / 2) ** 2


def region_size(region):
    return next(spec.w for spec in REGIONS if spec.name == region)


def tick_angles(region, count):
    if region == "fuel_temp":
        return ([140 + i * 100 / (count // 2 - 1) for i in range(count // 2)] +
                [300 + i * 100 / (count // 2 - 1) for i in range(count // 2)])
    return [225 - i * 270 / (count - 1) for i in range(count)]


@lru_cache(maxsize=None)
def tick_marks(region):
    size = region_size(region)
    marks = []
    for angle in tick_angles(region, TICK_COUNTS[region]):
        a = math.radians(angle)
        marks.append(frozenset((round((size - 1) / 2 + r * math.cos(a)), round((size - 1) / 2 - r * math.sin(a)))
                               for r in (size * 0.37, size * 0.41)))
    return tuple(marks)


def needle(size, u, v, angle, length):
    x, y = u + 0.5 - size / 2, size / 2 - v - 0.5
    a = math.radians(angle)
    along = x * math.cos(a) + y * math.sin(a)
    across = abs(-x * math.sin(a) + y * math.cos(a))
    return 0 <= along <= size * length and across < 0.65


def color(region, u, v, paint):
    if region == "leather":
        base = palette.PALETTE["seat"]
        delta = (LEATHER_PERFORATION_DELTA if u % 4 == 0 and v % 4 == 0 else
                 LEATHER_GRAIN_DELTA if u % 4 == 2 and v % 4 == 2 else 0)
        return (*(max(0, min(255, c + delta)) for c in base), 255)
    size = region_size(region)
    if not in_dial(size, u, v):
        grain = next(spec for spec in dash.REGIONS if spec.name == "grain")
        return dash.color("grain", u % grain.w, v % grain.h, paint)
    if (any((u, v) in mark for mark in tick_marks(region)) or
            any(needle(size, u, v, angle, NEEDLE_LENGTH) for angle in NEEDLE_ANGLES[region])):
        return (*palette.PALETTE["gauge"], 255)
    left, top, right, bottom = LCD_RECT
    if region == "speed" and left <= u <= right and top <= v <= bottom:
        frame = u in (left, right) or v in (top, bottom)
        return (*(LCD_FRAME if frame else LCD_FILL), 255)
    if (u, v) in ((size // 2 - 3, size // 2 + 5), (size // 2 + 3, size // 2 + 5)):
        return (*DOT_RGB, 255)
    return (*FACE_RGB, 255)


def mer(region, u, v, paint):
    return None


def lit(region, u, v):
    return False


def relief(region, u, v):
    return None
