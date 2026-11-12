"""Build the painted, single-axis transistor radio in Bedrock pixels."""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
DECK_TILT = math.degrees(0.20)
DECK_ORIGIN = (0, 2.81, -0.69)


def _color(value):
    return tuple(bytes.fromhex(value.removeprefix("#"))) + (255,)


def _box(x0, y0, z0, x1, y1, z1, face):
    return {"origin": [x0, y0, z0], "size": [x1-x0, y1-y0, z1-z0],
            "uv": {side: face for side in ("north", "south", "east", "west", "up", "down")}}


def _deck_box(x0, y0, z0, x1, y1, z1, face):
    cube = _box(-x1, y0+DECK_ORIGIN[1], z0+DECK_ORIGIN[2],
                -x0, y1+DECK_ORIGIN[1], z1+DECK_ORIGIN[2], face)
    cube.update(pivot=list(DECK_ORIGIN), rotation=[DECK_TILT, 0, 0])
    return cube


def _deck_point(x, y, z):
    return (-x, DECK_ORIGIN[1]+y*math.cos(0.20)+z*math.sin(0.20),
            DECK_ORIGIN[2]-y*math.sin(0.20)+z*math.cos(0.20))


def build() -> _gear_model.GearModel:
    def region(width, height, color):
        tile = _atlas.tile("transistor_radio", width, height)
        _paint.fill(tile, _color(color))
        return tile

    def face(tile):
        return tile.uv(0, 0, tile.width, tile.height)

    def gradient(tile, stops, vertical=False):
        length = tile.height if vertical else tile.width
        for (a, start), (b, end) in zip(stops, stops[1:]):
            bounds = (0, a*length, tile.width, b*length) if vertical else (a*length, 0, b*length, tile.height)
            _paint.linear_gradient(tile, _color(start), _color(end),
                                   (0, a*length) if vertical else (a*length, 0),
                                   (0, b*length) if vertical else (b*length, 0), bounds)

    grille = region(math.ceil(5.66*_atlas.TEXELS_PER_PX), 22, "3b5352")
    _paint.noise(grille, 1599, 3)
    for row in range(10):
        for col in range(7):
            x, y = 2+col*6, 1+row*2
            _paint.fill(grille, _color("101a1a"), x, y, x+4, y+1)
            _paint.fill(grille, _color("425958"), x, y+1, x+4, y+2)
    _paint.fill(grille, _color("294140"), 0, 21)
    rear = region(46, 22, "3c5251")
    _paint.noise(rear, 1600, 2)
    for a, b in [((1.5, 1.5), (44.5, 1.5)), ((1.5, 20.5), (44.5, 20.5)),
                 ((1.5, 1.5), (1.5, 20.5)), ((44.5, 1.5), (44.5, 20.5))]:
        _paint.line(rear, a, b, _color("263c3c"))
    for row in range(4):
        for col in range(7):
            _paint.fill(rear, _color("1d2e2e"), 3+col*6, 3+row*2, 7+col*6, 4+row*2)
    for x in (2.5, 43.5):
        for y in (2.5, 19.5):
            _paint.ellipse(rear, (x, y), (0.7, 0.7), _color("8c8d7f"))
    teal = region(16, 16, "354e4e")
    gradient(teal, [(0, "354e4e"), (0.35, "49605c"), (0.6, "354e4e"), (1, "304849")])
    _paint.noise(teal, 1601, 2)
    edge = region(8, 8, "293f40")
    _paint.noise(edge, 1602, 1)
    seam = region(4, 4, "202f30")
    metal = region(32, 8, "615f50")
    gradient(metal, [(0, "615f50"), (0.22, "b4b19a"), (0.4, "e3dfc9"), (0.58, "999786"), (1, "66675c")])
    dial = region(math.ceil(5.46*_atlas.LETTERING_TEXELS_PER_PX), 10, "b6b5a3")
    gradient(dial, [(0, "b6b5a3"), (0.25, "e4dfc9"), (0.75, "d5d1ba"), (1, "aaa996")], True)
    _paint.fill(dial, _color("f6f0db"), 0, 0, dial.width, 1)
    for i, number in enumerate(("88", "90", "92", "94", "96", "98", "100")):
        _paint.text(dial, 2+i*9, 1, number, _color("4d544d"))
    for i in range(33):
        _paint.fill(dial, _color("757b6e"), 2+i*2, 7, 3+i*2, 10 if i % 5 == 0 else 8)
    _paint.fill(dial, _color("bc4935"), 19, 0, 20, 10)
    for i in range(6):
        _paint.fill(dial, _color("414b45"), 73+i*2, 3+i % 2, 74+i*2, 8-i % 3)
    knob_side = region(8, 4, "2c4140")
    for x in range(0, 8, 3):
        _paint.fill(knob_side, _color("63736a"), x, 0, x+1, 4)
        _paint.fill(knob_side, _color("192e2f"), x+1, 0, x+2, 4)
    knob_top = region(4, 4, "3e5551")
    _paint.ellipse(knob_top, (2, 2), (2, 2), _color("6c7e73"))
    _paint.ellipse(knob_top, (2, 2), (1.3, 1.3), _color("3e5551"))
    buttons = []
    for color in ("ed4d16", "aeb4a0", "b9bdab", "aaa58c", "bdb8a0"):
        tile = region(4, 4, color)
        _paint.linear_gradient(tile, _color("e3dfc9"), _color(color), (0, 0), (0, 2))
        buttons.append(tile)
    grip = region(32, 4, "202522")
    _paint.fill(grip, _color("50514a"), 0, 0, 32, 1)
    _paint.fill(grip, _color("111a18"), 0, 3, 32, 4)
    for x in range(2, 32, 3):
        _paint.fill(grip, _color("343b34"), x, 1, x+1, 3)

    cubes = []

    def body(x0, y0, z0, x1, y1, z1, tile):
        cube = _box(-x1, y0-0.06, z0, -x0, y1-0.06, z1, face(tile))
        cubes.append(cube)
        return cube

    body(-2.86, 0.06, -0.68, 2.86, 2.89, 0.66, teal)
    body(-2.89, 0.1, -0.72, 2.89, 2.87, -0.65, edge)
    body(-2.83, 0.13, -0.746, 2.83, 2.86, -0.718, teal)["uv"]["north"] = face(grille)
    body(-2.88, 0.09, 0.46, 2.88, 2.91, 0.475, seam)
    body(-2.87, 0.1, 0.48, 2.87, 2.93, 0.7, teal)
    body(-2.82, 0.15, 0.7, 2.82, 2.88, 0.715, teal)["uv"]["south"] = face(rear)
    cubes.append(_deck_box(-2.87, -0.25, 0, 2.87, 0.035, 1.37, face(teal)))
    cubes.append(_deck_box(-2.89, -0.02, 1.31, 2.89, 0.07, 1.39, face(edge)))
    cubes.append(_deck_box(-2.78, 0.04, 0.62, 2.78, 0.075, 1.29, face(metal)))
    dial_cube = _deck_box(-2.73, 0.074, 0.65, 2.73, 0.081, 1.26, face(metal))
    dial_cube["uv"]["up"] = face(dial)
    cubes.append(dial_cube)

    def control(cx, cz, radius, bottom, top, sides, side, cap):
        outline = {"a": radius, "zf": cz-radius, "zb": cz+radius, "xc": cx, "nf": 2, "nb": 2}
        walls = _kit.loft([(bottom, outline), (top, outline)], face(side), sides=sides, thickness=0.85*radius)
        for cube in walls:
            cube["uv"]["up"] = face(cap)
        cubes.extend(walls)
        # Close the small central opening left by the thick polygon walls.
        cubes.append(_box(cx-radius*0.25, bottom, cz-radius*0.25,
                          cx+radius*0.25, top, cz+radius*0.25, face(cap)))

    for x in (2.22, 0.78, -0.66):
        cx, cy, cz = _deck_point(x, 0.035, 0.29)
        control(cx, cz, 0.22, cy-0.06, cy+0.20, 12, knob_side, knob_top)
    for x, tile in zip((-1.78, -2.20, -2.62), buttons):
        cx, cy, cz = _deck_point(x, 0.035, 0.30)
        control(cx, cz, 0.142, cy-0.06, cy+0.105, 8, tile, tile)
    cx, cy, cz = _deck_point(-2.46, 0.035, 0.99)
    control(cx, cz, 0.105, cy-0.06, cy+0.09, 8, buttons[3], buttons[3])
    control(cx, cz, 0.052, cy+0.09, cy+0.23, 8, metal, metal)
    control(cx, cz, 0.073, cy+0.23, cy+0.26, 8, metal, buttons[4])
    for side in (-1, 1):
        cubes.append(_box(min(side*2.89, side*2.97), 2.08, 0.17,
                          max(side*2.89, side*2.97), 2.26, 0.35, face(metal)))
        cubes.extend(_kit.tube([(side*2.9725, 2.16, 0.26), (side*2.9725, 3.9375, 0.26)], 0.055, face(metal)))
    cubes.extend(_kit.tube([(-2.9725, 3.9375, 0.26), (2.9725, 3.9375, 0.26)], 0.055, face(metal)))
    cubes.extend(_kit.tube([(-2.53, 3.9375, 0.26), (2.53, 3.9375, 0.26)], 0.125, face(grip)))
    # Quantize before pair translation so rounding ties cannot move a panel differently.
    for cube in cubes:
        for key in ("origin", "size", "pivot"):
            if key in cube:
                cube[key] = [round(value, 3) for value in cube[key]]
    return _gear_model.GearModel(cubes=tuple(cubes), texture_request=("transistor_radio",))
