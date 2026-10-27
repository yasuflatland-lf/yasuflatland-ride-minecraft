"""Panel construction shared by the model generators (ADR 0169).

Pure math with no I/O and no swatch table: every function takes an already-built face dictionary
({"uv": [...], "uv_size": [...]}) from the caller and returns plain cube dictionaries with
"origin", "size", "uv", and, for a turned cube, "pivot" and "rotation". Output is deterministic.
"""
import math

SIDES = ("north", "south", "east", "west", "up", "down")


def r4(value):
    return round(value, 4)


def panel(x0, y0, z0, x1, y1, z1, face, pivot=None, rotation=None):
    cube = {
        "origin": [x0, y0, z0],
        "size": [x1 - x0, y1 - y0, z1 - z0],
        "uv": {side: face for side in SIDES},
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


def disc(radius, y0, y1, face, bars=8):
    """A round plate from full-width bars turned about Y at k*180/bars.

    Every bar sits 0.01 lower at the top and higher at the bottom than the
    previous one so coplanar faces do not z-fight.
    """
    half_width = radius * math.sin(math.pi / (2 * bars))
    return [panel(-radius, r4(y0 + k * 0.01), r4(-half_width), radius, r4(y1 - k * 0.01),
                  r4(half_width), face, (0, 0, 0), (0, r4(k * 180 / bars), 0))
            for k in range(bars)]
