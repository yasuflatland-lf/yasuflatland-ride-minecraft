"""Stepped enamel saucepan from the camping gear spike (ADR 0247)."""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_tilt = _load_tool("cube_tilt")

SIDES = 12


def _textures():
    density = _atlas.TEXELS_PER_PX
    wall = _atlas.tile("saucepan", 12 * density, 2 * density)
    for x in range(wall.width):
        angle = (x + 0.5) / wall.width * math.tau
        wrapped = math.atan2(math.sin(angle + 2.1), math.cos(angle + 2.1))
        sheen = math.exp(-(wrapped / 0.3) ** 2)
        light = 0.8 + 0.16 * math.cos(angle + 2.1)
        top = (round(235 * light + 20 * sheen), round(28 + 55 * sheen), round(23 + 48 * sheen), 255)
        bottom = (round(171 * light), 16, 12, 255)
        _paint.linear_gradient(wall, top, bottom, (0, 0), (0, wall.height),
                               (x, 0, x + 1, wall.height))
    lid = _atlas.tile("saucepan", 4 * density, 4 * density)
    _paint.radial_gradient(lid, (241, 91, 80, 255), (180, 17, 11, 255),
                           (10, 8), 24)
    chrome = _atlas.tile("saucepan", density, density)
    colors = [(78, 87, 94, 255), (255, 255, 255, 255), (181, 193, 200, 255),
              (255, 255, 255, 255), (78, 87, 94, 255)]
    for i, (a, b) in enumerate(zip(colors, colors[1:])):
        _paint.linear_gradient(chrome, a, b, (0, i * 2), (0, (i + 1) * 2),
                               (0, i * 2, chrome.width, (i + 1) * 2))
    black = _atlas.tile("saucepan", 2 * density, density)
    _paint.radial_gradient(black, (85, 88, 89, 255), (20, 21, 22, 255), (6, 2), 10)
    return wall, lid, chrome, black


def build() -> _gear_model.GearModel:
    wall, lid, chrome, black = _textures()
    face = lambda tile: tile.uv(0, 0, tile.width, tile.height)
    cubes = []

    def box(x0, y0, z0, x1, y1, z1, uv):
        cubes.extend(_kit.extrude([(x0, y0), (x1, y0), (x1, y1), (x0, y1)],
                                  z1 - z0, uv, z=(z0 + z1) / 2, step=y1 - y0))

    def solid_ring(radius, y0, y1, uv):
        # Inward panels and a small core close each tier without alpha cutouts.
        cubes.extend(_kit.ring(SIDES, radius, y0, y1, uv, radius - 0.06))

    for y0, y1, radius in [(0, 0.12, 1.50), (0.12, 0.34, 1.70),
                            (0.34, 0.65, 1.79), (0.65, 1.93, 1.84)]:
        ring = _kit.ring(SIDES, radius, y0, y1, face(wall), radius - 0.06)
        for sector, cube in enumerate(ring):
            uv = wall.uv(sector * 8, (1.93 - y1) * 8,
                         (sector + 1) * 8, (1.93 - y0) * 8)
            cube["uv"] = {side: uv for side in cube["uv"]}
        cubes.extend(ring)
    solid_ring(1.92, 1.93, 2.04, face(chrome))
    for y0, y1, radius in [(2.04, 2.13, 1.80), (2.13, 2.23, 1.73),
                            (2.23, 2.33, 1.55), (2.33, 2.42, 1.33),
                            (2.42, 2.49, 1.08), (2.49, 2.54, 0.80),
                            (2.54, 2.58, 0.49)]:
        solid_ring(radius, y0, y1, face(lid))
    box(-0.08, 0, -0.08, 0.08, 2.58, 0.08, face(lid))
    solid_ring(0.49, 2.58, 2.635, face(chrome))
    box(-0.08, 2.58, -0.08, 0.08, 2.635, 0.08, face(chrome))
    for y0, y1, radius in [(2.635, 2.70, 0.30), (2.70, 2.88, 0.43),
                            (2.88, 2.975, 0.37)]:
        solid_ring(radius, y0, y1, face(black))
    box(-0.08, 2.635, -0.08, 0.08, 2.975, 0.08, face(black))
    box(1.77, 1.67, -0.24, 2.10, 1.96, 0.24, face(chrome))
    # Two concave halves leave a through-hole near the rounded grip end.
    outline = [(2.02, -0.19), (2.25, -0.29), (3.80, -0.32),
               (4.0, -0.18), (4.0, 0), (3.82, 0), (3.76, -0.12),
               (3.38, -0.12), (3.32, 0), (2.02, 0)]
    for sign in (-1, 1):
        parts = _kit.extrude([(x, sign * z) for x, z in outline], 0.24,
                             face(black), step=0.08)
        # Swap extrusion depth into y so the opening goes through the grip top.
        for cube in parts:
            x, z, y = cube["origin"]
            sx, sz, sy = cube["size"]
            cube["origin"] = [x, y + 1.94, z]
            cube["size"] = [sx, sy, sz]
        cubes.extend(parts)

    # Match the painted lid density to each face instead of stretching the
    # entire dome tile over every tiny tier and its hidden interior faces.
    for cube in cubes:
        if cube["uv"]["up"] != face(lid):
            continue
        for side, axes in (("north", (0, 1)), ("south", (0, 1)),
                           ("east", (2, 1)), ("west", (2, 1)),
                           ("up", (0, 2)), ("down", (0, 2))):
            width, height = [max(1, math.ceil(cube["size"][axis] * _atlas.TEXELS_PER_PX))
                             for axis in axes]
            x = (lid.width - width) // 2
            y = (lid.height - height) // 2
            cube["uv"][side] = lid.uv(x, y, x + width, y + height)

    lo, hi = _tilt.bounds(cubes)
    scale = [6 / (hi[0] - lo[0]), 3 / hi[1], 6 / (hi[0] - lo[0])]
    center = [(lo[0] + hi[0]) / 2, 0, 0]
    for cube in cubes:
        for key in ("origin", "pivot"):
            if key in cube:
                cube[key] = [round((v - center[i]) * scale[i], 6)
                             for i, v in enumerate(cube[key])]
        cube["size"] = [round(v * scale[i], 6) for i, v in enumerate(cube["size"])]
    # The exporter rounds to millipixels; trim tangential overlap so its rounded
    # yaw corners stay within the catalog bounds as well as the source cubes.
    for cube in cubes:
        if any(cube.get("rotation", [])):
            cube["origin"][0] += 0.001
            cube["size"][0] -= 0.002
    return _gear_model.GearModel(cubes=tuple(cubes), texture_request=())
