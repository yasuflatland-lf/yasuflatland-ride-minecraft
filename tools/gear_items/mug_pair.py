"""Opaque ceramic panels ported from spike/camping-gear/items/mug_pair.js."""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_tilt = _load_tool("cube_tilt")

SIDES = 16
# The spike's 1.61 px silhouette plus the 0.025 px rim ring; camping_gear.json lists this height.
WALL_TOP = 1.61
HEIGHT = 1.635
ASSEMBLIES = {
    "mug_pair_shells": {"owner": "camping_gear", "cubes": 128},
    "mug_pair_handles": {"owner": "camping_gear", "cubes": 16},
}
PALETTES = (
    ("647650", "647e54", "3e583d", "263b2a", "202b1d", "15251a"),
    ("a34b37", "b55c43", "994632", "6c2e22", "40251d", "361711"),
)
STRAPS = (
    ((.638, 1.39), (.76, 1.385), .075, .115),
    ((.745, 1.385), (.92, 1.40), .085, .17),
    ((.905, 1.40), (1.075, 1.435), .10, .235),
    ((1.075, 1.435), (1.20, 1.19), .105, .19),
    ((1.20, 1.19), (1.23, .94), .105, .16),
    ((1.23, .94), (1.145, .71), .10, .14),
    ((1.145, .71), (.91, .49), .095, .13),
    ((.91, .49), (.60, .30), .09, .115),
)


def _glaze(colors):
    upper, light, main, low, edge, deep = [
        tuple(int(color[i:i+2], 16) for i in (0, 2, 4)) + (255,)
        for color in colors
    ]
    faces = {}
    # Shared panel regions use the final panel height at eight texels per pixel.
    for name, width, height, stops in (
        ("body", .3, HEIGHT, ((0, edge), (.035, upper), (.22, light), (.65, main), (.92, low), (1, edge))),
        ("inner", .3, 1.35, ((0, edge), (.06, main), (.38, low), (1, deep))),
        ("rim", .3, .12, ((0, edge), (.5, low), (1, edge))),
        ("foot", .3, .24, ((0, edge), (.5, low), (1, edge))),
        ("handle", .24, .55, ((0, upper), (.22, light), (.72, main), (1, low))),
        ("floor", 1, 1, ((0, low), (1, deep))),
        ("sole", .3, .12, ((0, edge), (.5, low), (1, edge))),
    ):
        w, h = [max(2, math.ceil(n * _atlas.TEXELS_PER_PX)) for n in (width, height)]
        tile = _atlas.tile("mug_pair", w, h)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            _paint.linear_gradient(tile, ca, cb, (0, a*h), (0, b*h), (0, a*h, w, b*h))
        if name == "floor":
            _paint.radial_gradient(tile, low, deep, (w*.4, h*.35), w*.52)
        _paint.noise(tile, 137 if name in ("inner", "floor") else 821, 6)
        faces[name] = tile.uv(0, 0, w, h)
    return faces


def _geometry(faces, scale):
    cubes, shells, handles = [], [], []
    for x, face in zip((-1.32, .69), faces):
        def outline(radius):
            return {"a": radius*scale, "zf": -radius*scale,
                    "zb": radius*scale, "xc": x*scale, "nf": 2, "nb": 2}

        def wall(rings, surface, thickness, inward=False):
            for (y0, r0), (y1, r1) in zip(rings, rings[1:]):
                uv = face[surface]
                if surface == "body":
                    u, v = uv["uv"]
                    w, h = uv["uv_size"]
                    uv = {"uv": [u, v+h*(1-y1/WALL_TOP)], "uv_size": [w, h*(y1-y0)/WALL_TOP]}
                result = _kit.loft([(y0, outline(r0)), (y1, outline(r1))], uv,
                                   sides=SIDES, thickness=thickness*scale, inward=inward,
                                   assembly="mug_pair_shells", assemblies=ASSEMBLIES)
                shells.extend(result)
                cubes.extend(result)

        wall(((.0185, .465), (.145, .485)), "foot", .055)
        wall(((.13, .535), (.23, .605), (1.61, .67)), "body", .045)
        wall(((.27, .48), (1.61, .606)), "inner", .035, True)
        # Horizontal rings keep the mouth and the underside open without alpha cutouts.
        for radius, thickness, bottom, top, surface in (
            (.67, .064, WALL_TOP, HEIGHT, "rim"), (.467, .092, 0, .018, "sole"),
        ):
            ring = _kit.ring(SIDES, radius*scale*math.cos(math.pi/SIDES), bottom, top,
                             face[surface], thickness*scale, (x*scale, 0))
            # The kit's general-purpose 0.16 px overlap overwhelms this tiny rim.
            # Retain 0.02 px and align the ring's edges with the loft polygon.
            for cube in ring:
                cube["origin"][0] += .07
                cube["size"][0] -= .14
                cube["rotation"][1] += 180/SIDES
            cubes.extend(ring)
        # Opaque strips replace the spike's alpha-masked floor plate. Their ends
        # extend beneath the inner wall, hiding the polygon approximation.
        radius = .495*scale
        for i in range(8):
            z0, z1 = radius*(-1+2*i/8), radius*(-1+2*(i+1)/8)
            width = math.sqrt(radius**2-((z0+z1)/2)**2)
            strip = {"a": width, "xc": x*scale, "zf": z0, "zb": z1}
            u, v = face["floor"]["uv"]
            w, h = face["floor"]["uv_size"]
            floor_face = {"uv": [u+w*(1-width/radius)/2, v+h*i/8],
                          "uv_size": [w*width/radius, h/8]}
            cubes.extend(_kit.plate(strip, .245, .272, floor_face))
        for a, b, thickness, depth in STRAPS:
            points = [((x+px)*scale, py, 0) for px, py in (a, b)]
            segment = _kit.tube(points, thickness*scale, face["handle"],
                                assembly="mug_pair_handles", assemblies=ASSEMBLIES)
            # At yaw 90 local x is the strap's depth, leaving its thin neck and
            # progressively wider thumb shelf independent of its thickness.
            for cube in segment:
                center = cube["origin"][0] + cube["size"][0]/2
                cube["size"][0] = depth*scale
                cube["origin"][0] = center-depth*scale/2
            handles.extend(segment)
            cubes.extend(segment)
    _kit.assert_rule(cubes)
    return cubes, {"mug_pair_shells": shells, "mug_pair_handles": handles}


def build() -> _gear_model.GearModel:
    faces = [_glaze(colors) for colors in PALETTES]
    scale = 1
    # Include panel thickness and handle end overlap in the fixed 4 px footprint.
    for _ in range(4):
        cubes, members = _geometry(faces, scale)
        lo, hi = _tilt.bounds(cubes)
        scale *= 4 / (hi[0]-lo[0])
    offset = -(lo[0]+hi[0])/2
    for cube in cubes:
        cube["origin"][0] += offset
        if "pivot" in cube:
            cube["pivot"][0] += offset
    # Quantize before translating into pair blocks so their UVs and coordinates
    # are identical to the standalone geometry, including half-millipixel ties.
    for cube in cubes:
        for key in ("origin", "size", "pivot", "rotation"):
            if key in cube:
                cube[key] = [round(value, 3) for value in cube[key]]
    for part, axis_end, target in ((cubes[:len(cubes)//2], 0, -2),
                                    (cubes[len(cubes)//2:], 1, 2)):
        shift = round(target-_tilt.bounds(part)[axis_end][0], 3)
        for cube in part:
            for key in ("origin", "pivot"):
                if key in cube:
                    cube[key][0] = round(cube[key][0]+shift, 3)
    members = {name: _tilt.tilt_assembly(part, (0, 0, 0), "x", 0,
                assembly=name, assemblies=ASSEMBLIES) for name, part in members.items()}
    _tilt.assert_axes(cubes, members, ASSEMBLIES)
    return _gear_model.GearModel(tuple(cubes), ("mug_pair",), {name: tuple(part) for name, part in members.items()})
