"""Porro-prism panels and recessed coated lenses ported from the JS spike."""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_tilt = _load_tool("cube_tilt")

ASSEMBLIES = {
    "binoculars_left": {"owner": "camping_gear", "cubes": 98},
    "binoculars_right": {"owner": "camping_gear", "cubes": 98},
    "binoculars_focus": {"owner": "camping_gear", "cubes": 24},
}
WIDTH, HEIGHT = 5, 3
PANEL_OVERLAP = .012
DISC_THICKNESS = .012
SHOULDER_THICKNESS = .035
ROUNDING_CLEARANCE = .002
RUBBER = (48, 50, 52, 255)
BLACK = (22, 25, 27, 255)
EDGE = (39, 43, 45, 255)
RECESS = (7, 11, 13, 255)


def _geometry(horizontal, vertical):
    cubes, members, surfaces = [], {name: [] for name in ASSEMBLIES}, []
    dummy = _atlas.face("black")

    def point(x, y, z):
        # The preview mirrors model x; preserve the spike's right-hand diopter.
        return [-x*horizontal, y*vertical, z*horizontal]

    def box(x, y, z, w, h, d, material, rotation=None, part=None):
        center = point(x, y, z)
        size = (w*horizontal, h*vertical, d*horizontal)
        a = [center[i]-size[i]/2 for i in range(3)]
        b = [center[i]+size[i]/2 for i in range(3)]
        cube = _kit.extrude([(a[0], a[1]), (b[0], a[1]), (b[0], b[1]), (a[0], b[1])],
                            size[2], dummy, z=center[2], step=size[1]*2)[0]
        if rotation:
            cube.update(pivot=center, rotation=rotation)
        if part:
            cube = _tilt.tilt_assembly([cube], center, "x", 0,
                                       assembly=part, assemblies=ASSEMBLIES)[0]
            members[part].append(cube)
        cubes.append(cube)
        surfaces.append((cube, material, None))
        return cube

    def sleeve(part, x, y, z0, z1, radius, material, sides=16, thickness=.06):
        apothem = radius*math.cos(math.pi/sides)
        for i in range(sides):
            angle = math.tau*(i+.5)/sides
            ca, sa = math.cos(angle), math.sin(angle)
            # Scale the tangent before deriving pitch, keeping rotated local axes
            # orthogonal while fitting the catalog's taller 5 x 3 envelope.
            tangent = math.hypot(horizontal*sa, vertical*ca)
            pitch = math.degrees(math.atan2(horizontal*sa, vertical*ca))
            box(x+apothem*ca, y+apothem*sa, (z0+z1)/2,
                z1-z0, (2*radius*math.sin(math.pi/sides)+PANEL_OVERLAP)*tangent/vertical,
                thickness, material, [pitch, -90, 0], part)

    def disc(x, y, z, radius, kind, back=False, inner=0):
        cube = box(x, y, z, radius*2, radius*2, DISC_THICKNESS, "clear")
        surfaces[-1] = (cube, (kind, radius, inner, back), None)

    def shoulder(part, side):
        for i in range(8):
            angle = math.tau*(i+.5)/8
            points = [point(side*x+r*math.cos(a), y+r*math.sin(a), z)
                      for x, y, z, r, a in (
                          (1.38, 1.23, .75, 1.04, angle-math.pi/8),
                          (1.38, 1.23, .75, 1.04, angle+math.pi/8),
                          (1.09, 1.62, 1.42, .53, angle+math.pi/8),
                          (1.09, 1.62, 1.42, .53, angle-math.pi/8))]
            cube, polygon = _kit.planar(points, dummy, SHOULDER_THICKNESS*horizontal,
                                        assembly=part, assemblies=ASSEMBLIES, edge_face=dummy)
            cube = _tilt.tilt_assembly([cube], cube["pivot"], "x", 0,
                                       assembly=part, assemblies=ASSEMBLIES)[0]
            cubes.append(cube)
            members[part].append(cube)
            surfaces.append((cube, "shoulder", polygon))

    for side, part in ((-1, "binoculars_left"), (1, "binoculars_right")):
        x = side*1.46
        sleeve(part, x, .99, -2.28, -.45, .95, "rubber")
        sleeve(part, x, .99, -2.4, -2.22, .97, "rubber")
        sleeve(part, x, .99, -2.4, -2.16, .81, "recess", 12, .035)
        disc(x, .99, -2.408, .97, "rim", inner=.83)
        disc(x, .99, -2.15, .8, "green")
        disc(x, .99, -.46, .95, "rim", True)
        sleeve(part, side*1.38, 1.23, -.48, .85, 1.04, "rubber", 12, .10)
        disc(side*1.38, 1.23, -.49, 1.04, "rim")
        shoulder(part, side)
        x = side*1.09
        sleeve(part, x, 1.62, .78, 1.65, .53, "black", 8)
        sleeve(part, x, 1.62, 1.42, 1.67, .65, "diopter" if side == 1 else "edge", 10)
        disc(x, 1.62, 1.415, .65, "rim", inner=.80)
        sleeve(part, x, 1.62, 1.69, 2.27, .68, "rubber")
        disc(x, 1.62, 1.685, .68, "rim", inner=.76)
        disc(x, 1.62, 2.28, .68, "rim", True, .49)
        disc(x, 1.62, 2.12, .48, "rim", True, .64)
        disc(x, 1.62, 2.08, .30, "purple", True)
        box(side*1.43, .22, .35, .95, .12, .99, "rubber")
        box(side*1.43, .11, .65, .42, .12, .12, "lug")
    box(0, 1.13, -.46, 1.6, .23, .32, "black")
    box(0, 1.49, 1.07, 1.28, .15, .28, "black")
    part = "binoculars_focus"
    sleeve(part, 0, 1.4, -.65, 1.32, .21, "black", 6)
    sleeve(part, 0, 1.61, -.01, .83, .44, "ribbed", 12)
    disc(0, 1.61, -.02, .44, "rim")
    disc(0, 1.61, .84, .44, "rim", True)
    sleeve(part, 0, 1.4, -.83, -.63, .32, "edge", 6)
    disc(0, 1.4, -.84, .32, "rim")
    disc(0, 1.4, 1.34, .28, "rim", True)
    return cubes, members, surfaces


def _textures(surfaces):
    density = _atlas.TEXELS_PER_PX
    cache, painted = {}, []

    def region(key, width, height):
        if key not in cache:
            tile = _atlas.Tile("binoculars", 0, 0, width, height, bytearray(width*height*4))
            cache[key] = tile
            painted.append(tile)
        return cache[key]

    clear = region("clear", 1, 1)
    materials = {}
    for name, color in (("rubber", RUBBER), ("black", BLACK), ("lug", BLACK), ("edge", EDGE),
                         ("recess", RECESS), ("ribbed", EDGE), ("diopter", EDGE)):
        tile = region(name, 2*density, 2*density)
        _paint.fill(tile, color)
        if name == "rubber":
            _paint.noise(tile, 81, 16)
        if name in ("ribbed", "diopter"):
            for y in range(0, tile.height, 4):
                _paint.fill(tile, (14, 18, 21, 255), 0, y, tile.width, y+1)
                _paint.fill(tile, (84, 88, 91, 255), 0, y+1, tile.width, y+2)
        if name == "diopter":
            _paint.fill(tile, BLACK, 0, 10, tile.width, 16)
            _paint.text(tile, 1, 10, "- . +", (164, 168, 168, 255), spacing=0)
        materials[name] = tile

    bindings = []
    for cube, material, polygon in surfaces:
        if material == "shoulder":
            w, h = [max(2, math.ceil(v*density)) for v in cube["size"][:2]]
            key = (w, h, tuple((round(u, 5), round(v, 5)) for u, v in polygon))
            fresh = key not in cache
            tile = region(key, w, h)
            if fresh:
                _paint.fill(tile, RUBBER)
                _paint.noise(tile, 81, 16)
                mask = _atlas.Tile("binoculars", 0, 0, w, h, bytearray(w*h*4))
                outline = [(u*w, v*h) for u, v in polygon]
                _paint.polygon(mask, outline, (255, 255, 255, 255))
                for a, b in zip(outline, outline[1:]+outline[:1]):
                    _paint.line(mask, a, b, (255, 255, 255, 255))
                _paint.cutout(tile, lambda x, y: mask.get(int(x), int(y))[3] == 0)
            bindings.append((cube, {side: tile if side in ("north", "south") else clear
                                    for side in cube["uv"]}))
        elif isinstance(material, tuple):
            kind, radius, inner, back = material
            key = (kind, radius, inner)
            fresh = key not in cache
            size = max(4, math.ceil(2*radius*density))
            tile = region(key, size, size)
            if fresh:
                center, r = size/2, size*.49
                glass = kind in ("green", "purple")
                stops = {
                    "green": ((0, (37, 123, 108)), (.45, (7, 92, 78)), (.83, (0, 52, 44)), (1, (3, 11, 16))),
                    "purple": ((0, (98, 84, 119)), (.45, (51, 33, 63)), (.83, (29, 20, 41)), (1, (3, 11, 16))),
                    "rim": ((0, (28, 32, 35)), (.78, (35, 39, 42)), (.92, (65, 70, 73)), (1, (37, 41, 43))),
                }[kind]
                for y in range(size):
                    for x in range(size):
                        distance = math.hypot(x+.5-center, y+.5-center)/r
                        t = math.hypot(x+.5-center*.65, y+.5-center*.6)/r if glass else distance
                        for (a, ca), (b, cb) in zip(stops, stops[1:]):
                            if t <= b or b == 1:
                                f = max(0, min(1, (t-a)/(b-a)))
                                color = tuple(round(c+(d-c)*f) for c, d in zip(ca, cb))
                                break
                        if not glass and any(abs(distance-rr) < .035 for rr in (.73, .8, .88)):
                            color = (9, 13, 16)
                        tile.set(x, y, color+(255,))
                if glass:
                    highlight = (68, 139, 124, 255) if kind == "green" else (129, 114, 133, 255)
                    _paint.ellipse(tile, (center*.75, center*.6), (r*.47, r*.12), highlight)
                _paint.cutout(tile, lambda x, y: not inner <= math.hypot(x-center, y-center)/r <= 1)
            bindings.append((cube, {side: tile if side == ("south" if back else "north") else clear
                                    for side in cube["uv"]}))
        else:
            bindings.append((cube, {side: materials[material] for side in cube["uv"]}))
    uv = {}
    # Tall masks first keep two-texel gutters around every sampled region.
    for source in sorted(painted, key=lambda tile: -tile.height):
        target = _atlas.tile("binoculars", source.width, source.height)
        target.pixels[:] = source.pixels
        uv[id(source)] = target.uv(0, 0, target.width, target.height)
    for cube, faces in bindings:
        cube["uv"] = {side: uv[id(tile)] for side, tile in faces.items()}


def build() -> _gear_model.GearModel:
    horizontal, vertical = 1, 1
    # The spike's 4.965-wide envelope gives a depth scale of about 1.007.
    # Fit height before decomposition,
    # keeping yaw/pitch panels orthogonal instead of stretching rotated boxes.
    for _ in range(4):
        cubes, members, surfaces = _geometry(horizontal, vertical)
        lo, hi = _tilt.bounds(cubes)
        horizontal *= WIDTH/(hi[0]-lo[0])
        vertical *= HEIGHT/(hi[1]-lo[1])
    offset = [-(lo[0]+hi[0])/2, -lo[1], -(lo[2]+hi[2])/2]
    for cube in cubes:
        for key in ("origin", "pivot"):
            if key in cube:
                cube[key] = [value+offset[i] for i, value in enumerate(cube[key])]
    # Rotated corners drift when exported to millipixels. Let the flat strap
    # lugs and rear eyecup faces anchor the exact catalog bounds instead.
    for cube, material, _ in surfaces:
        bottom, top = _tilt.bounds([cube])
        if any(cube.get("rotation", [])):
            shift = max(0, ROUNDING_CLEARANCE-bottom[1])-max(0, top[1]-HEIGHT+ROUNDING_CLEARANCE)
            for key in ("origin", "pivot"):
                cube[key][1] += shift
        elif material == "lug":
            cube["size"][1] += cube["origin"][1]
            cube["origin"][1] = 0
        elif material == ("rim", .68, .49, True):
            cube["size"][1] = HEIGHT-cube["origin"][1]
    _textures(surfaces)
    _kit.assert_rule(cubes)
    _tilt.assert_axes(cubes, members, ASSEMBLIES)
    return _gear_model.GearModel(tuple(cubes), ("binoculars",),
                                 {name: tuple(part) for name, part in members.items()})
