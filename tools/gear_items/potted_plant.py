"""Build the potted plant model in pixels."""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")


def _leaf_texture(tile, seed):
    for x in range(tile.width):
        light = 1 - abs((x + 0.5) / tile.width * 2 - 1)
        color = (round(52 + 67 * light), round(77 + 69 * light), round(39 + 35 * light), 255)
        _paint.fill(tile, color, x, 0, x + 1, tile.height)
    for y in range(1, tile.height, 6):
        points = [(x, y + math.sin(x * 0.9 + y * 0.4 + seed) * 1.2) for x in range(tile.width + 1)]
        points += [(x, y + 1.6 + math.sin(x * 0.9 + y * 0.4 + seed) * 1.2)
                   for x in reversed(range(tile.width + 1))]
        _paint.polygon(tile, points, (43, 65, 33, 255))
    _paint.line(tile, (tile.width / 2, 0), (tile.width / 2, tile.height), (151, 164, 93, 255), 0.7)
    for y in range(32, tile.height):
        for x in range(tile.width):
            rgba = tile.get(x, y)
            factor = 1 - 0.28 * (y - 32) / 16
            tile.set(x, y, tuple(round(c * factor) for c in rgba[:3]) + (255,))
    _paint.noise(tile, seed, 5)


def build() -> _gear_model.GearModel:
    glaze = _atlas.tile("potted_plant", 24, 24)
    rim = _atlas.tile("potted_plant", 16, 8)
    soil = _atlas.tile("potted_plant", 20, 20)
    leaves = [_atlas.tile("potted_plant", 12, 48) for _ in range(2)]
    _paint.linear_gradient(glaze, (173, 192, 181, 255), (133, 158, 148, 255), (0, 0), (0, 24))
    _paint.noise(glaze, 317, 4)
    _paint.linear_gradient(rim, (191, 207, 196, 255), (153, 179, 166, 255), (0, 0), (0, 8))
    _paint.noise(rim, 318, 3)
    _paint.fill(soil, (76, 59, 40, 255))
    _paint.noise(soil, 319, 22)
    for index, tile in enumerate(leaves):
        _leaf_texture(tile, 320 + index)

    face = lambda tile: tile.uv(0, 0, tile.width, tile.height)
    cubes = []
    for apothem, y0, y1, thickness, tile in (
        (1.3, 0, 0.6, 0.6, glaze),
        (1.6, 0.6, 1.3, 0.5, glaze),
        (1.8, 1.3, 2.4, 0.5, glaze),
        (1.8, 2.4, 3.0, 0.6, rim),
    ):
        cubes.extend(_kit.ring(12, apothem, y0, y1, face(tile), thickness))
    cubes.extend(_kit.plate({"a": 1.2, "zf": -1.2, "zb": 1.2}, 0, 0.1, face(glaze)))
    cubes.extend(_kit.plate({"a": 1.15, "zf": -1.15, "zb": 1.15}, 2.65, 2.75, face(soil)))
    # Linear lean over six stacked segments keeps each sideways step below the segment width, so
    # a leaning blade has no gaps; the outer leaves reach exactly x +-2.5.
    segments = (1, 0.95, 0.88, 0.75, 0.55, 0.28)
    count = len(segments)
    reach = (2.5 - 0.95 * segments[-1] / 2 - 0.5) / ((count - 0.5) / count)
    specs = (
        (0, 0.3, 0, 5.3, 1.1, 0),
        (-0.5, -0.4, 0, 4.2, 0.95, -reach),
        (0.5, -0.5, 0, 3.9, 0.95, reach),
        (-0.4, 0.6, 25, 4.6, 1.0, -0.9),
        (0.4, 0.5, -25, 4.0, 0.95, 0.9),
        (0.1, -0.7, 10, 3.6, 0.9, 0.6),
        (-0.9, -0.3, 70, 3.1, 0.7, -0.8),
    )
    for index, (bx, bz, yaw, length, width, lean) in enumerate(specs):
        tile = leaves[index % 2]
        for k, scale in enumerate(segments):
            w = width * scale
            x = bx + lean * (k + 0.5) / count
            y0 = 2.7 + length * k / count - (0.01 if k else 0)
            y1 = 2.7 + length * (k + 1) / count
            rows = 48 // count
            uv = tile.uv(0, 48 - rows * (k + 1), 12, 48 - rows * k)
            cube = {"origin": [x - w / 2, y0, bz - 0.125], "size": [w, y1 - y0, 0.25],
                    "uv": {side: dict(uv) for side in ("north", "south", "east", "west", "up", "down")}}
            if yaw:
                cube["rotation"] = [0, yaw, 0]
                cube["pivot"] = [x, (y0 + y1) / 2, bz]
            cubes.append(cube)
    for cube in cubes:
        for key in ("origin", "size", "pivot"):
            if key in cube:
                cube[key] = [round(value, 3) for value in cube[key]]
    return _gear_model.GearModel(cubes=tuple(cubes), texture_request=("pot_glaze", "pot_rim", "soil", "leaf_a", "leaf_b"))
