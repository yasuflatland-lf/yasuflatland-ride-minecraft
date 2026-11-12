"""Chrome toaster panels and opaque painted details (ADR 0247)."""

import math
from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_INK = (27, 29, 30, 255)
_LIGHT = (245, 246, 241, 255)


def _steel(tile):
    stops = ((0, 112), (.08, 222), (.23, 247), (.48, 185),
             (.72, 225), (.91, 166), (1, 103))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        _paint.linear_gradient(tile, (ca, ca + 2, ca + 3, 255),
                               (cb, cb + 2, cb + 3, 255),
                               (a * tile.width, 0), (b * tile.width, 0),
                               (a * tile.width, 0, b * tile.width, tile.height))
    _paint.noise(tile, 1597, 3)


def _rounded(width, bottom, top, radius, x=0):
    return _kit.outline_points({"a": width / 2, "zf": bottom, "zb": top,
                                "r": radius, "k": 3, "xc": x})


def _map(cube, side, tile, rect, window=None):
    """Crop one continuous panel across slabs using Bedrock's face directions."""
    x, y, z = cube["origin"]
    w, h, d = cube["size"]
    a, b, c, e = rect
    if side == "north":
        # Bedrock mirrors model x before rendering; positive UV width keeps text upright.
        uv = ((x - a) / (c - a), (e - y - h) / (e - b),
              (x + w - a) / (c - a), (e - y) / (e - b))
    elif side == "south":
        uv = ((c - x - w) / (c - a), (e - y - h) / (e - b),
              (c - x) / (c - a), (e - y) / (e - b))
    elif side in ("east", "west"):
        uv = ((z - a) / (c - a), (e - y - h) / (e - b),
              (z + d - a) / (c - a), (e - y) / (e - b))
    else:
        uv = ((x - a) / (c - a), (e - z - d) / (e - b),
              (x + w - a) / (c - a), (e - z) / (e - b))
    u0, v0, u1, v1 = window or (0, 0, tile.width, tile.height)
    cube["uv"][side] = tile.uv(*(round(offset + min(1, max(0, v)) * size, 5)
                                for v, size, offset in zip(uv, (u1-u0, v1-v0) * 2, (u0, v0) * 2)))


def build() -> _gear_model.GearModel:
    # Shelf footprints total exactly 120 texels high, including region gutters.
    strip = _atlas.tile("toaster", 88, 16)
    disc = _atlas.tile("toaster", 12, 12)
    trim = _atlas.tile("toaster", 8, 8)
    side = _atlas.tile("toaster", 60, 33)
    upper = _atlas.tile("toaster", 48, 25)
    top = _atlas.tile("toaster", 48, 59)
    back = _atlas.tile("toaster", 48, 59)
    for tile in (strip, side, upper, top, back):
        _steel(tile)
    _paint.linear_gradient(trim, _INK, (69, 75, 78, 255), (0, 0), (8, 0))
    _paint.line(trim, (2.5, 0), (2.5, 8), (159, 165, 166, 255))
    _paint.radial_gradient(disc, _LIGHT, (118, 126, 130, 255), (4, 3), 10)
    _paint.ellipse(disc, (4, 3), (1, 1), _INK)
    # The shorter back panel leaves space for bread and chrome detail regions,
    # each separated by at least four texels to protect their sampled edges.
    _paint.fill(back, (179, 109, 48, 255), 2, 40, 30, 48)
    _paint.rounded_rect(back, 3, 41, 29, 48, 2, (241, 211, 157, 255))
    _paint.noise(back, 83, 15, (3, 41, 29, 48))
    _paint.radial_gradient(back, _LIGHT, (130, 138, 140, 255), (35, 41), 5, (34, 40, 38, 44))
    _paint.linear_gradient(back, (112, 120, 123, 255), _LIGHT, (34, 48), (34, 50), (34, 48, 42, 51))
    for tile in (upper, back):
        _paint.line(tile, (3, 0), (3, tile.height), (91, 97, 99, 255))
        _paint.line(tile, (45, 0), (45, tile.height), (91, 97, 99, 255))
    _paint.rounded_rect(upper, 23, 4, 25, 23, 1, _LIGHT)
    _paint.rounded_rect(upper, 22, 4, 24, 23, 1, _INK)
    _paint.fill(back, (51, 54, 56, 255), 4, 26, 44, 31)
    _paint.line(strip, (0, .5), (88, .5), _INK)
    _paint.line(strip, (0, 1.5), (88, 1.5), _LIGHT)
    for number, u, v in (("1", 27, 11), ("2", 25, 7), ("3", 29, 2),
                         ("4", 43, 2), ("5", 47, 7), ("6", 45, 11)):
        _paint.text(strip, u, v, number, _INK, spacing=0)
    buttons = ((-2.05, "CANCEL"), (.9, "REHEAT"), (2.15, "DEFROST"))
    for x, label in buttons:
        u = (2.75 + x) * 16
        _paint.text(strip, round(u - _paint.text_width(label, spacing=0) / 2),
                    2, label, _INK, spacing=0)
    for x in (14, 34):
        _paint.rounded_rect(top, x - 6, 6, x + 6, 53, 2, (103, 110, 113, 255))
        _paint.rounded_rect(top, x - 5, 7, x + 5, 52, 2, _LIGHT)
        _paint.rounded_rect(top, x - 4, 8, x + 4, 51, 1, _INK)
        for v in range(12, 49, 7):
            _paint.line(top, (x - 3, v), (x + 3, v), (89, 93, 94, 255))

    cubes = []
    shell = _kit.extrude(_rounded(5.88, .25, 4.35, .45), 7.34, _atlas.face("chrome"))
    for cube in shell:
        for face in ("east", "west"):
            _map(cube, face, side, (-3.67, .25, 3.67, 4.35))
        _map(cube, "up", top, (-3, -3.67, 3, 3.67))
    cubes.extend(shell)
    for z in (-3.68, 3.68):
        cubes.extend(_kit.extrude(_rounded(6, .23, 4.35, .48), .12,
                                  trim.uv(0, 0, 8, 8), z=z))
    for z, face, tile in ((-3.755, "north", upper), (3.755, "south", back)):
        panel = _kit.extrude(_rounded(5.5, .25, 4.28, .28), .03, _atlas.face("chrome"), z=z)
        for cube in panel:
            _map(cube, face, tile, (-3, 1.25 if face == "north" else .25, 3, 4.35),
                 (0, 0, 48, 33) if face == "south" else None)
        cubes.extend(panel)
    panel = _atlas.box(-2.75, .25, -3.78, 2.75, 1.25, -3.77, "chrome")
    _map(panel, "north", strip, (-2.75, .25, 2.75, 1.25))
    cubes.append(panel)

    def control(x, y, radius, z, depth, tile=None, window=None):
        points = [(round(x + radius * math.cos(i * math.tau / 12), 4),
                   round(y + radius * math.sin(i * math.tau / 12), 4)) for i in range(12)]
        parts = _kit.extrude(points, depth, _atlas.face("black" if tile is None else "chrome"), z=z)
        if tile is not None:
            for cube in parts:
                _map(cube, "north", tile, (x - radius, y - radius, x + radius, y + radius), window)
        cubes.extend(parts)

    control(-.4, .6, .4, -3.86, .16)
    control(-.4, .6, .32, -4.04, .24, disc)
    for x, _ in buttons:
        control(x, .52, .22, -3.83, .1)
        control(x, .52, .16, -3.90, .06, back, (34, 40, 38, 44))
    cubes.append(_atlas.box(-.055, 2.77, -4.02, .055, 3.02, -3.78, "black"))
    handle = _kit.extrude(_rounded(.98, 2.675, 2.985, .145), .24,
                          _atlas.face("chrome"), z=-4.12)
    for cube in handle:
        _map(cube, "north", back, (-.49, 2.675, .49, 2.985), (34, 48, 42, 51))
    cubes.extend(handle)
    for x in (-2.1, 2.1):
        for z in (-3, 3):
            cubes.append(_atlas.box(x - .17, 0, z - .17, x + .17, .29, z + .17, "black"))
    for x in (-1.26, 1.26):
        for edge in (-.69, .69):
            cubes.append(_atlas.box(x + edge - .035, 4.35, -2.8,
                                     x + edge + .035, 4.39, 2.8, "chrome"))
        for z in (-2.8, 2.75):
            cubes.append(_atlas.box(x - .69, 4.35, z, x + .69, 4.39, z + .05, "chrome"))
        slice_cube = _atlas.box(x - .2, 4.04, -1.52, x + .2, 5, 1.95, "harvest_gold")
        for face in ("east", "west"):
            _map(slice_cube, face, back, (-1.52, 4.04, 1.95, 5), (2, 40, 30, 48))
        cubes.append(slice_cube)
    # Fridge pair centers are seven pixels apart, with a door rail at 3.4. Center the complete
    # silhouette, including the projecting lever, and keep both ends clear.
    for cube in cubes:
        cube["origin"][2] = round((cube["origin"][2] + .235) * .84, 4)
        cube["size"][2] = round(cube["size"][2] * .84, 4)
    return _gear_model.GearModel(tuple(cubes), ("black", "chrome", "harvest_gold"))
