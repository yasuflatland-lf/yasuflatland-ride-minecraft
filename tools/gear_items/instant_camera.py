"""Twin-lens camera ported from the 249-cube owner spike (ADR 0247)."""

import math
from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_tilt = _load_tool("cube_tilt")
ASSEMBLIES = {"instant_camera_barrels": {"owner": "camping_gear", "cubes": 80}}


def _color(value):
    return tuple(bytes.fromhex(value)) + (255,)


def _textures():
    def region(w, h, color):
        tile = _atlas.tile("instant_camera", w, h)
        _paint.fill(tile, _color(color))
        return tile

    leather = region(30, 45, "191b1c")
    _paint.noise(leather, 812, 17)
    taking = region(23, 23, "bec5cb")
    viewing = region(19, 19, "bec5cb")
    focus = region(31, 31, "bbc1c4")
    film = region(22, 22, "bbc1c4")
    numbered = region(16, 16, "bbc1c4")
    crank = region(19, 19, "bbc1c4")
    shoulder = region(28, 8, "191c1e")
    for i in range(3):
        _paint.rounded_rect(shoulder, i*2, i, 28-i*2, 8-i, 2, _color("858d92"))
        _paint.rounded_rect(shoulder, i*2+1, i+1, 27-i*2, 7-i, 1, _color("191c1e"))
    chrome = region(8, 8, "8b949a")
    stops = ((0, "8b949a"), (.22, "dde3e6"), (.42, "ffffff"),
             (.58, "aab3b9"), (.8, "e3e8eb"), (1, "7d878d"))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        _paint.linear_gradient(chrome, _color(ca), _color(cb), (a*8, 0), (b*8, 0), (a*8, 0, b*8, 8))
    black = region(2, 2, "151719")
    cross = region(8, 8, "bbc1c4")
    screw = region(2, 2, "d7dada")
    _paint.line(screw, (0, 0), (2, 2), _color("42474a"), .7)
    bead = region(2, 2, "c6ccd0")
    _paint.radial_gradient(bead, _color("ffffff"), _color("7d868b"), (.5, .5), 2)
    counter = region(7, 7, "e5e5cf")
    _paint.text(counter, 2, 1, "0", _color("30342d"))
    window = region(4, 4, "171a1b")
    socket = region(4, 4, "a7a18f")
    latch = region(10, 4, "b9c0c3")
    for y in (1, 3):
        _paint.line(latch, (0, y), (10, y), _color("919a9f"))
    lever = region(3, 7, "c2c8cb")
    for y in (1, 5):
        _paint.ellipse(lever, (1.5, y), (1, 1), _color("252a2d"))
    clear = region(2, 2, "151719")
    _paint.cutout(clear, lambda x, y: True)

    def circle(tile, radius, color):
        _paint.ellipse(tile, (tile.width/2, tile.height/2),
                       (tile.width*radius/2, tile.height*radius/2), _color(color))

    def ticks(tile, count, inner=.88):
        for i in range(count):
            a = math.tau*i/count
            def point(r):
                return (tile.width*(1+r*math.sin(a))/2, tile.height*(1-r*math.cos(a))/2)
            _paint.line(tile, point(inner), point(.99), _color("f0f1ec" if i % 2 else "60676b"), .6)

    for tile, kind in ((focus, "lens"), (numbered, "lens"), (film, "film"),
                       (crank, "crank"), (cross, "cross")):
        circle(tile, .91, "34383b")
        ticks(tile, 64)
        if kind == "crank":
            for r, color in ((.79, "c9cdd0"), (.72, "34383b"), (.63, "c9cdd0"),
                             (.56, "34383b"), (.45, "c9cdd0"), (.36, "aab1b5"), (.1, "303336")):
                circle(tile, r, color)
        elif kind == "film":
            for r, color in ((.88, "d0d2ce"), (.63, "6e7475"), (.54, "202425")):
                circle(tile, r, color)
            ticks(tile, 18, .77)
        elif kind == "lens":
            for r, color in ((.82, "e5e6e2"), (.76, "34383b"), (.68, "24272b"),
                             (.55, "aeb7bd"), (.46, "202123")):
                circle(tile, r, color)
        else:
            circle(tile, .66, "c4c9cc")
            circle(tile, .4, "202326")
            _paint.line(tile, (1, 4), (7, 4), _color("25282b"))
            _paint.line(tile, (4, 1), (4, 7), _color("25282b"))
    # Numeral regions use sixteen texels per model pixel; small dials keep four legible values.
    for tile in (focus, numbered, film):
        for i, number in enumerate(("5", "10", "15", "20")):
            a = math.tau*i/4
            x = tile.width*(1+.72*math.sin(a))/2
            y = tile.height*(1-.72*math.cos(a))/2
            _paint.text(tile, round(x-_paint.text_width(number, spacing=0)/2), round(y-2),
                        number, _color("e0e0d7" if tile is not film else "272d30"), spacing=0)
    for tile, coating in ((viewing, "77719a"), (taking, "a4b4bd")):
        for r, color in ((1, "bec5cb"), (.96, "f1f2eb"), (.91, "6c7881"),
                         (.87, "e5e8e8"), (.81, "181a1e"), (.73, "44474c"), (.70, "101018")):
            circle(tile, r, color)
        # All coating highlights are baked RGB; the glass has no translucent texels.
        center = (tile.width*.42, tile.height*.38)
        for x, y in ((x, y) for y in range(tile.height) for x in range(tile.width)):
            if math.hypot((x+.5)*2/tile.width-1, (y+.5)*2/tile.height-1) < .67:
                t = min(1, math.hypot(x+.5-center[0], y+.5-center[1])/(tile.width*.6))
                tile.set(x, y, tuple(round(a+(b-a)*t) for a, b in
                                    zip(_color(coating), _color("101219"))))
        _paint.ellipse(tile, (tile.width*.47, tile.height*.41), (tile.width*.23, tile.height*.10),
                       _color("8a80a0" if tile is viewing else "b2bec3"))
        ticks(tile, 36, .78)
    circle(window, .8, "171a1b")
    circle(socket, .86, "d4d0bd")
    circle(socket, .66, "13171a")
    for tile in (taking, viewing, focus, film, numbered, crank, cross, screw, bead, counter, window, socket):
        _paint.cutout(tile, lambda x, y, t=tile: ((2*x/t.width-1)**2+(2*y/t.height-1)**2) > 1)
    _paint.cutout(latch, lambda x, y: ((x-5)/5)**2+(y/4)**2 > 1)
    return locals()


def build() -> _gear_model.GearModel:
    textures = _textures()
    cubes, barrels = [], []

    def uv(name):
        tile = textures[name]
        return tile.uv(0, 0, tile.width, tile.height)

    def box(x, y, z, w, h, d, material="black"):
        cube = _kit.plate({"a": w/2, "xc": x, "zf": z-d/2, "zb": z+d/2},
                          y-h/2, y+h/2, uv(material))[0]
        cubes.append(cube)
        return cube

    def face(x, y, z, w, h, material, side="front"):
        dimensions = {"front": (w, h, .018), "back": (w, h, .018),
                      "left": (.018, h, w), "right": (.018, h, w),
                      "top": (w, .018, h), "bottom": (w, .018, h)}
        direction = {"front": "north", "back": "south", "left": "west",
                     "right": "east", "top": "up", "bottom": "down"}[side]
        cube = box(x, y, z, *dimensions[side], "clear")
        cube["uv"][direction] = uv(material)
        return cube

    def disc(x, y, z, r, material, side="front"):
        return face(x, y, z, r*2, r*2, material, side)

    def screw(x, y, z, side="front", r=.065):
        return disc(x, y, z, r, "screw", side)

    def barrel(x, y, z, r, depth, material="chrome", side="front", n=12):
        for i in range(n):
            a = math.tau*i/n
            cx, cy, cz = (x+r*math.cos(a), y-r*math.sin(a), z) if side == "front" else (x, y-r*math.sin(a), z+r*math.cos(a))
            cube = box(cx, cy, cz, depth, 2*r*math.tan(math.pi/n)+.008, .045, material)
            cube.update(pivot=[cx, cy, cz], rotation=[-math.degrees(a), 90 if side == "front" else 0, 0])
            if side == "front":
                barrels.append(cube)

    box(0, 3.18, .2, 3.7, 5.92, 3.45)
    box(0, 3.13, .2, 3.76, 5.68, 3.49, "chrome")
    box(0, 3.16, .2, 3.64, 5.59, 3.55, "leather")
    box(0, 3.07, -1.64, 3.65, 5.63, .23)
    face(0, 3.1, -1.765, 3.43, 5.36, "leather")
    for x in (-1.73, 1.73):
        box(x, 3.1, -1.79, .045, 5.28, .045, "chrome")
    for y in (.48, 5.72):
        box(0, y, -1.79, 3.46, .045, .045, "chrome")
    face(0, 3.1, 1.989, 3.4, 5.36, "leather", "back")
    face(0, 4.35, 2.01, 2.22, 1.78, "chrome", "back")
    face(0, 4.35, 2.03, 2.10, 1.66, "black", "back")
    box(0, 6.26, .18, 3.71, .58, 3.43)
    box(0, 6.71, .18, 3.68, .47, 3.38)
    for y, z, w, h, material in ((6.952, .18, 3.45, 3.16, "leather"),
                                (6.964, .27, 2.58, 2.58, "chrome"),
                                (6.976, .27, 2.46, 2.46, "black"),
                                (6.991, .27, 2.31, 2.31, "leather")):
        face(0, y, z, w, h, material, "top")
    box(0, 6.28, -1.64, 3.63, .99, .22)
    face(0, 6.29, -1.77, 3.48, .91, "shoulder")
    box(0, 6.03, -1.795, 2.25, .25, .025, "chrome")
    for i in range(11):
        disc((i-5)*.197, 6.03, -1.82, .087, "bead")
    for x in (-1.48, 1.48):
        screw(x, 6.16, -1.82)
    for x in (-1.17, 1.17):
        for y in (6.63, 6.82):
            box(x, y, 1.906, .78, .045, .024, "chrome")
    for y, r, z, material in ((4.67, 1.18, -2.25, "viewing"), (2.30, 1.40, -2.35, "taking")):
        barrel(0, y, -1.94, r, .30, "black")
        barrel(0, y, z+.09, r*.94, .22, n=16)
        disc(0, y, z-.035, r*.97, material)
    face(-1.47, 5.10, -1.94, .31, .80, "lever")
    for x in (-1.22, 1.22):
        barrel(x, 3.57, -2.03, .47, .19)
        disc(x, 3.57, -2.14, .47, "numbered" if x > 0 else "cross")
    for x in (-1.4, 1.4):
        disc(x, .83, -1.97, .23, "cross")
        screw(x, .83, -2, r=.1)
    for x in (-1.61, 1.61):
        for y in (.57, 5.56):
            screw(x, y, -1.82)
    for side, sign in (("left", -1), ("right", 1)):
        face(sign*1.905, 3.14, .22, 3.16, 5.34, "leather", side)
        for z in (-1.36, 1.78):
            box(sign*1.925, 3.12, z, .045, 5.33, .045, "chrome")
        for y in (.48, 5.75):
            box(sign*1.925, y, .21, .045, .045, 3.15, "chrome")
        box(sign*1.91, 5.5, .17, .11, .31, 2.93, "chrome")
        face(sign*1.976, 5.5, .17, 2.75, .21, "black", side)
        face(sign*2, 5.48, .17, 1.1, .37, "chrome", side)
        face(sign*1.99, 5.22, .17, 1.13, .45, "latch", side)
        for z in (-1.10, 1.43):
            screw(sign*1.99, 5.5, z, side, .08)
        for y in (5.40, 5.53):
            face(sign*2.02, y, .17, .83, .035, "black", side)
        box(sign*1.88, 6.04, -.68, .12, .31, .28, "chrome")
        for i in range(4):
            face(sign*1.95, 5.94+i*.065, -.68, .27, .018, "black", side)

    def side_knob(x, y, z, r, depth, material, side):
        barrel(x, y, z, r, depth, side=side)
        disc(x+(-1 if x < 0 else 1)*(depth/2+.02), y, z, r, material, side)

    side_knob(-2.11, 3.35, -.36, .94, .43, "focus", "left")
    side_knob(-1.99, 4.58, 1.03, .67, .19, "film", "left")
    side_knob(-2.02, .88, -.4, .34, .29, "cross", "left")
    box(-2.39, 3.32, -.36, .23, .55, .79)
    face(-2.52, 3.55, -.36, .79, .11, "chrome", "left")
    screw(-2.522, 3.24, -.36, "left", .13)
    side_knob(1.99, 2.99, .18, 1.18, .20, "crank", "right")
    box(2.17, 2.15, .62, .10, 1.98, .28, "chrome").update(pivot=[2.17, 2.15, .62], rotation=[math.degrees(.47), 0, 0])
    disc(2.24, 1.25, 1.07, .18, "bead", "right")
    screw(2.255, 1.25, 1.07, "right")
    disc(1.92, 4.40, -.75, .19, "counter", "right")
    disc(1.92, 4.61, 1.12, .24, "window", "right")
    face(1.92, 4.99, .25, .74, .24, "chrome", "right")
    face(1.94, 4.99, .25, .65, .17, "black", "right")
    for x in (-1.45, 1.45):
        screw(x, 6.962, .22, "top", .08)
    screw(0, 6.962, 1.57, "top", .075)
    for x in (-1.73, 1.73):
        box(x, 3.13, 2.018, .055, 5.40, .055, "chrome")
    for y in (.43, 5.84):
        box(0, y, 2.018, 3.49, .055, .055, "chrome")
    face(0, .219, .20, 3.40, 3.15, "leather", "bottom")
    disc(0, .198, .41, .94, "crank", "bottom")
    disc(0, .179, .41, .25, "socket", "bottom")
    box(0, .16, -1.18, .65, .12, .95, "chrome")
    face(0, .091, -1.18, .48, .72, "leather", "bottom")
    for x in (-1.45, 1.45):
        for z in (-1.1, 1.52):
            box(x, .11, z, .19, .18, .19, "chrome")
            screw(x, .009, z, "bottom", .075)

    # All yawed cubes are quarter turns: scaling local z scales world x without
    # shearing a pitched barrel. Fit the fixed width and center the full silhouette.
    lo, hi = _tilt.bounds(cubes)
    scale = 5/(hi[0]-lo[0])
    offset_x, offset_z = -(lo[0]+hi[0])/2, -(lo[2]+hi[2])/2
    for cube in cubes:
        center = [a+b/2 for a, b in zip(cube["origin"], cube["size"])]
        axis = 2 if abs(cube.get("rotation", [0, 0, 0])[1]) == 90 else 0
        center[0] = (center[0]+offset_x)*scale
        center[2] += offset_z
        cube["size"][axis] *= scale
        cube["origin"] = [c-s/2 for c, s in zip(center, cube["size"])]
        if "pivot" in cube:
            cube["pivot"] = center
        for key in ("origin", "size", "pivot", "rotation"):
            if key in cube:
                cube[key] = [round(v, 3) for v in cube[key]]
    members = {"instant_camera_barrels": tuple(_tilt.tilt_assembly(barrels, (0, 0, 0), "x", 0,
               assembly="instant_camera_barrels", assemblies=ASSEMBLIES))}
    _kit.assert_rule(cubes)
    _tilt.assert_axes(cubes, members, ASSEMBLIES)
    return _gear_model.GearModel(tuple(cubes), ("instant_camera",), members)
