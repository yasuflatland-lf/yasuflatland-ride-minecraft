"""Circular projector lenses on a square face whose corners take the body colour."""

import math

from tool_loader import load_tool

palette = load_tool("suv_palette")
RegionSpec = load_tool("suv_texture").RegionSpec
LENS_SIZE = 40
REGIONS = (RegionSpec("lens", LENS_SIZE, LENS_SIZE, "grille"),)
LENS_RADIUS = LENS_SIZE / 2
PROJECTOR_OFFSET = 7
PROJECTOR_RADIUS = 6
PROJECTOR_RIM_WIDTH = 1
PROJECTOR_GLINT_OFFSET = 1.5
PROJECTOR_GLINT_RADIUS = 1.5
POD_X = 12
POD_Y = 5
POD_RADIUS = 3
POD_RIM_WIDTH = 1
RIM_INNER_RADIUS = LENS_RADIUS - 2
BEZEL_INNER_RADIUS = LENS_RADIUS - 4
CLEAR_LENS_HIGHLIGHT = 0.12


def centered(u, v, size):
    return u + 0.5 - size / 2, v + 0.5 - size / 2


def lens_color(x, y):
    radius = math.hypot(x, y)
    if radius > RIM_INNER_RADIUS:
        return palette.PALETTE["grille"]
    if radius > BEZEL_INNER_RADIUS:
        return palette.PALETTE["chrome"]
    for offset in (-PROJECTOR_OFFSET, PROJECTOR_OFFSET):
        distance = math.hypot(x, y - offset)
        if distance <= PROJECTOR_RADIUS:
            if distance > PROJECTOR_RADIUS - PROJECTOR_RIM_WIDTH:
                return palette.PALETTE["rim"]
            if math.hypot(x + PROJECTOR_GLINT_OFFSET, y - offset + PROJECTOR_GLINT_OFFSET) < PROJECTOR_GLINT_RADIUS:
                return palette.PALETTE["light"]
            return palette.PALETTE["glass"]
    for px in (-POD_X, POD_X):
        for py in (-POD_Y, POD_Y):
            distance = math.hypot(x - px, y - py)
            if distance <= POD_RADIUS:
                return palette.PALETTE["light" if distance < POD_RADIUS - POD_RIM_WIDTH else "chrome"]
    return palette.PALETTE["trim"]


def color(region, u, v, paint):
    x, y = centered(u, v, LENS_SIZE)
    if math.hypot(x, y) > LENS_RADIUS:
        # The square face has no bezel plate in front of it, so its corners match the body.
        return (*paint.body, 255)
    rgb = lens_color(x, y)
    if math.hypot(x, y) > RIM_INNER_RADIUS:
        reflection = 0
    else:
        # A broad reflection ties the separate projectors together under one clear cover.
        reflection = CLEAR_LENS_HIGHLIGHT * max(0, 1 - abs(x + y * 0.4) / LENS_RADIUS)
    return (*(round(c + (255 - c) * reflection) for c in rgb), 255)


def mer(region, u, v, paint):
    return None


def lit(region, u, v):
    return region == "lens" and math.hypot(*centered(u, v, LENS_SIZE)) <= LENS_RADIUS


def relief(region, u, v):
    return None
