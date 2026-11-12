"""Build the cactus pot model in pixels."""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_paint = _load_tool("gear_paint")
_kit = _load_tool("gear_kit")
_panels = _load_tool("panels")


def _textures():
    clay = _atlas.tile("cactus_pot", 8, 28)
    _paint.linear_gradient(clay, (207, 133, 82, 255), (184, 102, 56, 255), (0, 0), (0, 28))
    _paint.fill(clay, (215, 143, 94, 255), 0, 0, 8, 8)
    _paint.fill(clay, (163, 83, 48, 255), 0, 8, 8, 9)
    _paint.fill(clay, (230, 163, 113, 255), 0, 0, 8, 1)
    _paint.noise(clay, 617, 5)
    ribs = []
    for variant in range(2):
        rib = _atlas.tile("cactus_pot", 8, 28)
        _paint.linear_gradient(rib, (33, 69, 34, 255), (88, 136, 59, 255), (0, 0), (4, 0))
        _paint.linear_gradient(rib, (88, 136, 59, 255), (37, 77, 37, 255), (4, 0), (8, 0), (4, 0, 8, 28))
        _paint.noise(rib, 914 + variant, 5)
        for row in range(8):
            y = 2.5 + row * 3.4 + variant
            for dx, dy in ((-2, -1), (2, -1), (-2, 1), (2, 1), (0, -2), (0, 2)):
                _paint.line(rib, (4.5, y), (4.5 + dx, y + dy),
                            (209, 194, 139, 255) if dx else (141, 128, 85, 255))
            _paint.ellipse(rib, (4.5, y), (0.7, 0.7), (184, 173, 113, 255))
        ribs.append(rib)
    soil = _atlas.tile("cactus_pot", 16, 16)
    _paint.fill(soil, (60, 48, 37, 255))
    _paint.noise(soil, 211, 5)
    seed = 617
    colors = ((102, 84, 71, 255), (136, 119, 97, 255), (40, 36, 30, 255))
    for i in range(65):
        seed = (seed * 1664525 + 1013904223) & 0xffffffff
        x, y = (seed >> 16) % 16, (seed >> 24) % 16
        _paint.fill(soil, colors[i % 3], x, y, x + 1, y + 1)
    return clay, ribs, soil


def _slice(tile, top, y0, y1):
    return tile.uv(0, round((top - y1) * 8, 4), 8, round((top - y0) * 8, 4))


def _radius(y):
    points = ((3.15, 0.93), (3.19, 0.93), (3.63, 1.24), (4.28, 1.46),
              (5.15, 1.46), (5.86, 1.23), (6.31, 0.78))
    for (y0, r0), (y1, r1) in zip(points, points[1:]):
        if y <= y1:
            return r0 + (r1 - r0) * (y - y0) / (y1 - y0)
    return points[-1][1]


def build() -> _gear_model.GearModel:
    clay, ribs, soil = _textures()
    cubes = []
    for i in range(6):
        y0, y1 = round(i * 2.58 / 6, 4), round((i + 1) * 2.58 / 6, 4)
        radius = (1.12 + (1.69 - 1.12) * (y0 + y1) / (2 * 2.58)) * math.cos(math.pi / 12)
        cubes.extend(_kit.ring(12, radius, y0, y1, _slice(clay, 3.5, y0, y1), 0.18))
    # Bisection against rotated panel bounds accounts for the helper's corner overlap.
    rim_apothem = 1.9600
    for y0, y1, radius in ((2.58, 2.65, 1.84), (2.65, 3.025, rim_apothem),
                           (3.025, 3.4, rim_apothem),
                           (3.4, 3.45, 1.88)):
        cubes.extend(_kit.ring(12, radius, y0, y1, _slice(clay, 3.5, y0, y1), 0.2))
    cubes.extend(_panels.disc(1.7, 3.13, 3.29, soil.uv(0, 0, 16, 16)))
    seed = 617
    for i in range(12):
        seed = (seed * 1664525 + 1013904223) & 0xffffffff
        angle = math.tau * i / 12
        radius = 1.35 + (seed % 20) / 100
        size = 0.1 + ((seed >> 8) % 5) / 100
        x, z = math.cos(angle) * radius, math.sin(angle) * radius
        cubes.append(_atlas.box(round(x - size, 4), 3.28, round(z - size * 0.7, 4),
                                round(x + size, 4), 3.39, round(z + size * 0.7, 4),
                                "white" if i % 2 else "cream"))
    for i in range(7):
        y0, y1 = round(3.15 + i * 3.16 / 7, 4), round(3.15 + (i + 1) * 3.16 / 7, 4)
        apothem = _radius((y0 + y1) / 2) * math.cos(math.pi / 12)
        faces = [_slice(tile, 6.65, y0, y1) for tile in ribs]
        ring = _kit.ring(12, apothem, y0, y1, faces[0], min(0.4, apothem - 0.05))
        for j, cube in enumerate(ring):
            cube["uv"] = {side: faces[j % 2].copy() for side in cube["uv"]}
        cubes.extend(ring)
    cubes.extend(_panels.disc(0.6, 6.31, 6.55, ribs[0].uv(0, 0, 8, 3)))
    for x, z, top in ((0, 0, 7), (0.35, 0, 6.86), (-0.35, 0, 6.9),
                      (0, 0.35, 6.88), (0, -0.35, 6.84)):
        cubes.append(_atlas.box(round(x - 0.05, 4), 6.5, round(z - 0.05, 4),
                                round(x + 0.05, 4), top, round(z + 0.05, 4), "cream"))
    return _gear_model.GearModel(cubes=tuple(cubes), texture_request=("white", "cream"))
