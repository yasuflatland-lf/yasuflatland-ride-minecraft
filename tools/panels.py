"""Panel construction shared by the model generators (ADR 0169).

Pure math with no I/O and no swatch table: every function takes an already-built face dictionary
({"uv": [...], "uv_size": [...]}) from the caller and returns plain cube dictionaries with
"origin", "size", "uv", and, for a turned cube, "pivot" and "rotation". Output is deterministic.
"""
import math

CUBE_SIDES = ("north", "south", "east", "west", "up", "down")


def r4(value):
    return round(value, 4)


def panel(x0, y0, z0, x1, y1, z1, face, pivot=None, rotation=None):
    cube = {
        "origin": [x0, y0, z0],
        "size": [x1 - x0, y1 - y0, z1 - z0],
        "uv": {side: face for side in CUBE_SIDES},
    }
    if rotation is not None:
        cube["pivot"] = list(pivot)
        cube["rotation"] = list(rotation)
    return cube


def panel_ring(radius, y0, y1, face, sides=16, thickness=0.5, center=(0, 0)):
    """Thin wall panels, each rotated about Y only, closing a round polygon.

    The radius is the apothem; the panel is a little wider than one polygon
    edge so neighbours overlap and leave no crack at the corners.
    """
    half = radius * math.tan(math.pi / sides) + 0.08
    cx, cz = center
    return [panel(r4(cx - half), y0, r4(cz - radius), r4(cx + half), y1, r4(cz - radius + thickness),
                  face, (cx, 0, cz), (0, r4(k * 360 / sides), 0))
            for k in range(sides)]


def disc(radius, y0, y1, face, bars=8, center=(0, 0)):
    """A round plate from full-width bars turned about Y at k*180/bars.

    Every bar sits 0.01 lower at the top and higher at the bottom than the
    previous one so coplanar faces do not z-fight. The plate must be thicker
    than 0.02 * (bars - 1) to keep every bar's height positive.
    """
    half_width = radius * math.sin(math.pi / (2 * bars))
    cx, cz = center
    return [panel(cx - radius, r4(y0 + k * 0.01), cz - r4(half_width), cx + radius, r4(y1 - k * 0.01),
                  cz + r4(half_width), face, (cx, 0, cz), (0, r4(k * 180 / bars), 0))
            for k in range(bars)]


def dome(radius, height, y0, face, sides=16, bands=6, center=(0, 0)):
    """A half spheroid with a base apothem of radius, using only Y-axis turns.

    Equal-angle latitude sampling steps evenly along the arc. A cap at least
    0.2 px thick keeps the disc's staggered bars positive even at shallow tops.
    """
    angles = [k * math.pi / (2 * bands) for k in range(bands)]
    radii = [radius * math.cos(theta) for theta in angles]
    levels = [y0 + height * math.sin(theta) for theta in angles]
    cubes = []
    for k in range(bands - 1):
        thickness = max(0.3, radii[k] - radii[k + 1] + 0.1)
        cubes.extend(panel_ring(r4(radii[k]), r4(levels[k]), r4(levels[k + 1]),
                                face, sides, r4(thickness), center))
    top = y0 + height
    cap = max(top - levels[-1], 0.2)
    cubes.extend(disc(r4(radii[-1]), r4(top - cap), r4(top), face, 8, center))
    return cubes
