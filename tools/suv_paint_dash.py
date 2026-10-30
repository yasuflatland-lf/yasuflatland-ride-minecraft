"""Shared matte black dash textures with deterministic moulded grain."""

from tool_loader import load_tool

palette = load_tool("suv_palette")
RegionSpec = load_tool("suv_texture").RegionSpec
material = load_tool("suv_material")
REGIONS = (
    RegionSpec("grain", 32, 32, "resin"),
    RegionSpec("passenger", 36, 16, "resin"),
    RegionSpec("stack", 20, 24, "resin"),
    RegionSpec("audio", 16, 4, "resin"),
    RegionSpec("knob", 4, 4, "resin"),
)
GRAIN_JITTER = 3
BRIGHTNESS_CAP = 96
GRAIN_HASH_U, GRAIN_HASH_V, GRAIN_HASH_MIX = 374761393, 668265263, 1274126177
RECESS, EDGE, LOUVRE, MARK, SCREEN = 8, 42, 35, 88, 15
TRAY_RECT = (2, 9, 34, 14)
ROUND_VENTS = ((2, 3), (17, 3))
VENT_RADIUS_TEXELS = 2
CLOCK_CENTER, CLOCK_RADIUS = (10, 3), 2
LOUVRE_RECTS = ((5, 1, 8, 5), (12, 1, 15, 5))
SWITCH_ROWS = (8, 22)
SWITCH_COLUMNS = (2, 6, 10, 14, 18)
CLIMATE_RECT = (1, 16, 19, 21)
SLIDER_ROWS, SLIDER_STOPS = (17, 19), (8, 12)
SLIDER_SPAN = (6, 13)
AUDIO_SCREEN_RECT = (3, 1, 12, 3)
AUDIO_BUTTON_COLUMNS = (1, 13, 15)


def inside(u, v, rect):
    x0, y0, x1, y1 = rect
    return x0 <= u < x1 and y0 <= v < y1


def grain(u, v):
    value = (u * GRAIN_HASH_U + v * GRAIN_HASH_V) & 0xffffffff
    value = ((value ^ (value >> 13)) * GRAIN_HASH_MIX) & 0xffffffff
    return palette.PALETTE["resin"][0] + value % (2 * GRAIN_JITTER + 1) - GRAIN_JITTER


def stack_shade(u, v, shade):
    if any(
        (u - cx) ** 2 + (v - cy) ** 2 <= VENT_RADIUS_TEXELS ** 2
        for cx, cy in ROUND_VENTS
    ) or any(inside(u, v, rect) for rect in LOUVRE_RECTS):
        shade = LOUVRE if v % 2 else RECESS
    cx, cy = CLOCK_CENTER
    distance = (u - cx) ** 2 + (v - cy) ** 2
    if distance <= CLOCK_RADIUS ** 2:
        shade = EDGE if distance > (CLOCK_RADIUS - 1) ** 2 else RECESS
        if (u == cx and cy - 1 <= v <= cy) or (v == cy and cx <= u <= cx + 1):
            shade = MARK
    for row in SWITCH_ROWS:
        if row <= v <= row + 1 and any(abs(u - x) <= 1 for x in SWITCH_COLUMNS):
            shade = EDGE if v == row else RECESS
            if v == row and u in SWITCH_COLUMNS:
                shade = MARK
    if inside(u, v, CLIMATE_RECT):
        shade = RECESS
        for row, stop in zip(SLIDER_ROWS, SLIDER_STOPS):
            if v == row and SLIDER_SPAN[0] <= u <= SLIDER_SPAN[1]:
                shade = MARK if u == stop else LOUVRE
    return shade


def color(region, u, v, paint):
    shade = grain(u, v)
    if region == "passenger" and inside(u, v, TRAY_RECT):
        shade = EDGE if v == TRAY_RECT[3] - 1 else RECESS
    elif region == "stack":
        shade = stack_shade(u, v, shade)
    elif region == "audio":
        if inside(u, v, AUDIO_SCREEN_RECT):
            shade = SCREEN
        if u in AUDIO_BUTTON_COLUMNS and v in (1, 2):
            shade = MARK if v == 1 else RECESS
    elif region == "knob":
        shade = MARK if u == 2 and v < 2 else EDGE
    return (shade, shade, shade, 255)


def mer(region, u, v, paint):
    return material.Mer(0, 0, material.RESIN_ROUGHNESS)


def lit(region, u, v):
    return False


def relief(region, u, v):
    return None
