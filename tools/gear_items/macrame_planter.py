"""Panel port of spike/camping-gear/items/macrame_planter.js (ADR 0247)."""

import math
from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_tilt = _load_tool("cube_tilt")

ASSEMBLIES = {"macrame_planter_net": {"owner": "camping_gear", "cubes": 231}}
CUTOUTS = ("base", "rim", "soil", "leaf_lower", "leaf_upper")


def _circle(radius, x=0, z=0):
    return {"a": radius, "xc": x, "zf": z-radius, "zb": z+radius, "nf": 2, "nb": 2}


def _at(angle, radius, y):
    return [math.cos(angle)*radius, y, math.sin(angle)*radius]


def _geometry():
    parts = []
    options = {"assembly": "macrame_planter_net", "assemblies": ASSEMBLIES}
    placeholder = {"uv": [0, 0], "uv_size": [1, 1]}

    def add(cubes, material, sides=None):
        for cube in cubes:
            if sides:
                cube["uv"] = {side: placeholder for side in sides}
            parts.append((cube, material))

    def cord(points, size=0.058):
        add(_kit.tube(points, size, placeholder, **options), "rope")

    def loft(rings, material, sides=12, thickness=0.09):
        add(_kit.loft(rings, placeholder, sides=sides, thickness=thickness, **options), material)

    loft([(y, _circle(r)) for y, r in ((0.18, 1.15), (0.48, 1.45), (1.25, 1.7), (2.12, 1.78))], "ceramic")
    loft([(0.3, _circle(1.33)), (0.68, _circle(1.54))], "wood", thickness=0.07)
    for name, radius, lo, hi in (("base", 1.16, 0.16, 0.2), ("rim", 1.81, 2.1, 2.18), ("soil", 1.63, 1.94, 1.97)):
        add(_kit.plate(_circle(radius), lo, hi, placeholder), name, ("up", "down"))

    for i in range(4):
        angle = math.pi/4 + i*math.pi/2
        for offset in (-0.026, 0.026):
            cord([_at(angle+offset, r, y) for r, y in ((0.12, 8.82), (0.75, 6.5), (1.35, 4.12), (1.69, 3.17), (1.84, 2.35))], 0.047)
        x, y, z = _at(angle, 1.32, 4.24)
        loft([(y-0.12, _circle(0.085, x, z)), (y, _circle(0.145, x, z)), (y+0.12, _circle(0.085, x, z))], "bead", 6, 0.055)
        for k in range(6):
            y = 2.53+k*0.092
            p = _at(angle, 1.82-(y-2.53)*0.2, y)
            t = [-math.sin(angle)*0.09, 0.035, math.cos(angle)*0.09]
            cord([[v-d for v, d in zip(p, t)], [v+d for v, d in zip(p, t)]], 0.078)
        for k in range(3):
            x, y, z = _at(angle, 0.76+k*0.02, 6.48-k*0.1)
            cord([[x-0.075, y-0.03, z], [x+0.075, y+0.03, z]], 0.075)
        for side in (-1, 1):
            # Chords need intermediate points outside the ceramic panels to keep the net visible.
            cord([_at(angle, 1.84, 2.35), _at(angle+side*math.pi/8, 1.95, 1.69),
                  _at(angle+side*math.pi/4, 1.78, 1.03), _at(angle+side*math.pi/8, 1.65, 0.62),
                  _at(angle, 1.22, 0.24)], 0.064)
        cord([_at(angle, 1.22, 0.24), _at(angle, 0.31, 0.08)], 0.064)
        x, y, z = _at(angle+math.pi/4, 1.79, 1.03)
        cord([[x, y-0.032, z], [x, y+0.032, z]], 0.16)

    for i in range(15):
        angle = i*2.39996
        outer = i % 3 != 0
        reach = 2.14+(i % 3)*0.08 if outer else 0.92
        points = [_at(angle, 0.35, 2.01), _at(angle, reach*0.55, 3.18 if outer else 3.72), _at(angle, reach, 2.86+(i % 4)*0.16 if outer else 4.35)]
        for j, (a, b) in enumerate(zip(points, points[1:])):
            segment = _kit.tube([a, b], 0.016, placeholder, **options)[0]
            # A blade lies across the tube's local x/z plane; yaw and pitch retain its bend without roll.
            segment["origin"][0] -= (0.48-segment["size"][0])/2
            segment["size"][0] = 0.48
            add([segment], ("leaf_lower", "leaf_upper")[j], ("up", "down"))

    lo, hi = _tilt.bounds([c for c, _ in parts])
    # Uniform scaling preserves the spike panels and makes the foliage span the catalog's 5 px width.
    scale = 5/(hi[0]-lo[0])
    center = [(lo[0]+hi[0])/2, lo[1], (lo[2]+hi[2])/2]
    neck = 8.82
    loop = [[0.18*math.cos(-math.pi/2+i*math.tau/12), 9.43+0.51*math.sin(-math.pi/2+i*math.tau/12), 0] for i in range(13)]
    loop_cubes = _kit.tube(loop, 0.105, placeholder, **options)
    loop_top = _tilt.bounds(loop_cubes)[1][1]
    shift = 10/scale+lo[1]-loop_top
    # Only the suspension above the upper knots changes length to retain the 10 px hanging height.
    for cube, material in parts:
        if material == "rope" and cube.get("pivot", [0, 0, 0])[1] > 7:
            pivot = cube["pivot"]
            angle = math.atan2(pivot[2], pivot[0])
            replacement = _kit.tube([_at(angle, 0.12, neck+shift), _at(angle, 0.75, 6.5)], 0.047, placeholder, **options)[0]
            cube.update(replacement)
    for cube in loop_cubes:
        cube["origin"][1] += shift
        cube["pivot"][1] += shift
    add(loop_cubes, "rope")
    for k in range(5):
        add(_kit.extrude([[-0.13, 8.67+k*0.06+shift], [0.13, 8.67+k*0.06+shift], [0.13, 8.72+k*0.06+shift], [-0.13, 8.72+k*0.06+shift]], 0.21, placeholder), "rope")
    for cube, _ in parts:
        for key in ("origin", "pivot"):
            if key in cube:
                cube[key] = [(v-center[i])*scale for i, v in enumerate(cube[key])]
        cube["size"] = [v*scale for v in cube["size"]]
    # Leave room for three-decimal export rounding at tilted ends; axis-aligned rope knots set y=0 and y=10.
    for cube, _ in parts:
        bottom, top = _tilt.bounds([cube])
        dy = 0.002 if bottom[1] < 0.002 else (-0.002 if top[1] > 9.998 else 0)
        if dy:
            cube["origin"][1] += dy
            cube["pivot"][1] += dy
    for x, z, y in ((0, 0, 0), (-center[0]*scale, -center[2]*scale, 9.94)):
        add(_kit.extrude([(x-0.03, y), (x+0.03, y), (x+0.03, y+0.06), (x-0.03, y+0.06)], 0.06, placeholder, z=z), "rope")
    return parts


def _paint_region(region, material):
    w, h = region.width, region.height
    if material in ("ceramic", "base", "rim"):
        _paint.radial_gradient(region, (255, 254, 248, 255), (208, 206, 196, 255), (w*0.3, h*0.2), max(w, h))
    elif material in ("wood", "bead"):
        _paint.linear_gradient(region, (228, 197, 149, 255), (178, 134, 80, 255), (0, 0), (0, h))
        for y in range(0, h, 2):
            for x in range(w-1):
                _paint.line(region, (x, y+math.sin(x*0.6+y)*0.5), (x+1, y+math.sin((x+1)*0.6+y)*0.5), (193, 153, 102, 255), 0.7)
    elif material == "rope":
        _paint.fill(region, (230, 220, 198, 255))
        for y in range(-w, h+w, 3):
            _paint.line(region, (0, y), (w, y+w*0.55), (185, 173, 149, 255), 1)
            _paint.line(region, (0, y+1), (w, y+w*0.55+1), (255, 247, 229, 255), 0.8)
    elif material == "soil":
        _paint.fill(region, (65, 49, 31, 255))
        _paint.noise(region, 1605, 22)
    else:
        _paint.linear_gradient(region, (37, 78, 25, 255), (111, 154, 53, 255), (0, 0), (w, 0))
        _paint.line(region, (w/2, 0), (w/2, h), (159, 185, 83, 255), 1)
        half = 0 if material == "leaf_lower" else 1
        _paint.cutout(region, lambda x, y: abs(x/w-0.5) > 0.48*math.sin(math.pi*(half+1-y/h)/2)**0.7)
    if material in ("base", "rim", "soil"):
        _paint.cutout(region, lambda x, y: ((x-w/2)/(w/2))**2+((y-h/2)/(h/2))**2 > 1 or (material == "rim" and ((x-w/2)/(w/2))**2+((y-h/2)/(h/2))**2 < (1.62/1.81)**2))


def build() -> _gear_model.GearModel:
    parts = _geometry()
    dimensions = {}
    face_sizes = []
    for cube, material in parts:
        x, y, z = cube["size"]
        sizes = {"north": (x, y), "south": (x, y), "east": (z, y), "west": (z, y), "up": (x, z), "down": (x, z)}
        for side in cube["uv"]:
            w, h = [max(1, math.ceil(v*_atlas.TEXELS_PER_PX)) for v in sizes[side]]
            old = dimensions.get(material, (0, 0))
            dimensions[material] = (max(w, old[0]), max(h, old[1]))
            face_sizes.append((cube, side, material, w, h))
    regions = {}
    for material, (w, h) in sorted(dimensions.items(), key=lambda pair: -pair[1][1]):
        region = _atlas.tile("macrame_planter", w, h)
        _paint_region(region, material)
        regions[material] = region
    for cube, side, material, w, h in face_sizes:
        region = regions[material]
        cube["uv"][side] = region.uv(0, 0, region.width if material in CUTOUTS else w, region.height if material in CUTOUTS else h)
    hidden = regions["base"].uv(0, 0, 1, 1)
    for cube, _ in parts:
        for side in ("north", "south", "east", "west", "up", "down"):
            cube["uv"].setdefault(side, hidden)
    cubes = tuple(c for c, _ in parts)
    return _gear_model.GearModel(cubes, ("macrame_planter",),
                                 {"macrame_planter_net": tuple(_tilt.compound_cubes(cubes))})
