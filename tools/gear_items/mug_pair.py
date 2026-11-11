"""Opaque ceramic panels ported from spike/camping-gear/items/mug_pair.js."""

import math
from typing import NamedTuple

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_tilt = _load_tool("cube_tilt")

# Spike uses 20 sides; 16 keeps opaque floors and the serving stand below 256 cubes.
SIDES = 16
# Catalog envelope, independent of the spike's unstretched 1.61 px body.
HEIGHT = 3
FOOTPRINT = 4
BODY_TOP = 1.61
# Spike rim panels are 0.022 thick; retain the port's 0.025 top cover.
RIM_HEIGHT = .025
# Spike spec(radius) uses circular superellipses.
CIRCLE_EXPONENT = 2
MUG_CENTERS = (-1.32, .69)  # Spike mug(x, palette).
FOOT_RINGS = ((.015, .465), (.145, .485))  # Spike narrower undercut foot.
BODY_RINGS = ((.13, .535), (.23, .605), (BODY_TOP, .67))  # Spike body loft.
INNER_RINGS = ((.27, .48), (BODY_TOP, .606))  # Spike inner loft.
FOOT_THICKNESS = .055  # Spike foot thick.
BODY_THICKNESS = .045  # Spike body thick.
INNER_THICKNESS = .035  # Spike inward wall thick.
RIM_RADIUS = .67  # Spike outer mouth radius.
RIM_THICKNESS = RIM_RADIUS - .606  # Spike inner mouth radius.
SOLE_RADIUS = .467  # Spike sole plate radius.
SOLE_THICKNESS = SOLE_RADIUS - .375  # Spike sole hole radius.
SOLE_HEIGHT = .018  # Spike sole plate top.
FLOOR_RADIUS = .495  # Spike texPlate radius.
FLOOR_BOTTOM, FLOOR_TOP = .245, .272  # Spike floor plate heights.
FLOOR_STRIPS = 8  # Opaque replacement for the spike's masked floor plate.
# Reduce the kit's 0.16 overlap to 0.02 for the spike's tiny ceramic rings.
RING_OVERLAP = .02
RING_EDGE_INSET = (_kit.MAX_PANEL_OVERLAP - RING_OVERLAP) / 2
HALF_TURN = 180
# Port fitting and pair-block quantization; the spike has no catalog envelope.
FIT_PASSES = 4
COORDINATE_DIGITS = 3
# Uniform mugs measure 1.649 px tall, leaving 1.351 px in the catalog.
# A thin raised tray needs only three boxes and preserves the spike's open mouths;
# lids with knobs this tall would dominate the cups.
# New stand dimensions: the slab is thinner than the spike's .13 heel band;
# inset blade supports leave the space below the cups open.
TRAY_THICKNESS = .12
TRAY_HALF_DEPTH = .76  # Clears the spike's 0.67 mouth radius.
TRAY_LEG_CENTERS = (-1.5, 1.5)
TRAY_LEG_HALF_WIDTH = .09
TRAY_COLORS = ((93, 67, 43, 255), (64, 44, 29, 255))
# Preserve the port's tile density and gradient stops from spike glaze()/texPlate().
MIN_TILE_TEXELS = 2
PANEL_TILE_WIDTH = .3
TILE_SIZES = {
    "body": (PANEL_TILE_WIDTH, HEIGHT), "inner": (PANEL_TILE_WIDTH, 2.5),
    "rim": (PANEL_TILE_WIDTH, .12), "foot": (PANEL_TILE_WIDTH, .24),
    "handle": (.24, .55), "floor": (1, 1), "sole": (PANEL_TILE_WIDTH, .12),
}
BODY_STOPS = (0, .035, .22, .65, .92, 1)
INNER_STOPS = (0, .06, .38, 1)
EDGE_STOPS = (0, .5, 1)
HANDLE_STOPS = (0, .22, .72, 1)
FLOOR_CENTER = (.4, .35)  # Spike radial gradient origin.
FLOOR_GRADIENT_RADIUS = .52  # Spike radial gradient radius / width.
INNER_SEED, OUTER_SEED = 137, 821  # Spike glaze noise seeds.
NOISE_AMOUNT = 6  # Opaque port of the spike's translucent grain.
OPAQUE = 255
# Photo gloss absent from spike glaze: a restrained band across the green shoulder.
GLOSS_STOPS = (.16, .20, .25)
GLOSS_COLOR = (124, 146, 103, OPAQUE)
ASSEMBLIES = {
    "mug_pair_shells": {"owner": "camping_gear", "cubes": 128},
    "mug_pair_handles": {"owner": "camping_gear", "cubes": 16},
}
# Spike green and terracotta glaze palettes, in upper/light/main/low/edge/deep order.
PALETTES = (
    ("647650", "647e54", "3e583d", "263b2a", "202b1d", "15251a"),
    ("a34b37", "b55c43", "994632", "6c2e22", "40251d", "361711"),
)


class Strap(NamedTuple):
    start: tuple[float, float]
    end: tuple[float, float]
    thickness: float
    depth: float


# Spike strap endpoints, thickness and depth; the first neck stays unchanged.
# Flatten the third segment at 1.40 (was 1.435) and flare its depth to .30
# (was .235), with a .20 transition (was .17), for the photo's flat thumb rest.
STRAPS = (
    Strap((.638, 1.39), (.76, 1.385), .075, .115),
    Strap((.745, 1.385), (.92, 1.40), .085, .20),
    Strap((.905, 1.40), (1.075, 1.40), .10, .30),
    Strap((1.075, 1.40), (1.20, 1.19), .105, .19),
    Strap((1.20, 1.19), (1.23, .94), .105, .16),
    Strap((1.23, .94), (1.145, .71), .10, .14),
    Strap((1.145, .71), (.91, .49), .095, .13),
    Strap((.91, .49), (.60, .30), .09, .115),
)


def _glaze(colors, glossy=False):
    upper, light, main, low, edge, deep = [
        tuple(int(color[i:i+2], 16) for i in (0, 2, 4)) + (OPAQUE,)
        for color in colors
    ]
    faces = {}
    surfaces = {
        "body": (BODY_STOPS, (edge, upper, light, main, low, edge)),
        "inner": (INNER_STOPS, (edge, main, low, deep)),
        "rim": (EDGE_STOPS, (edge, low, edge)),
        "foot": (EDGE_STOPS, (edge, low, edge)),
        "handle": (HANDLE_STOPS, (upper, light, main, low)),
        "floor": ((0, 1), (low, deep)),
        "sole": (EDGE_STOPS, (edge, low, edge)),
    }
    for name, (positions, colors) in surfaces.items():
        stops = tuple(zip(positions, colors))
        w, h = [max(MIN_TILE_TEXELS, math.ceil(n * _atlas.TEXELS_PER_PX))
                for n in TILE_SIZES[name]]
        tile = _atlas.tile("mug_pair", w, h)
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            _paint.linear_gradient(tile, ca, cb, (0, a*h), (0, b*h), (0, a*h, w, b*h))
        if name == "floor":
            _paint.radial_gradient(tile, low, deep, (w*FLOOR_CENTER[0], h*FLOOR_CENTER[1]), w*FLOOR_GRADIENT_RADIUS)
        if name == "body" and glossy:
            a, peak, b = GLOSS_STOPS
            _paint.linear_gradient(tile, light, GLOSS_COLOR,
                                   (0, a*h), (0, peak*h), (0, a*h, w, peak*h))
            _paint.linear_gradient(tile, GLOSS_COLOR, light,
                                   (0, peak*h), (0, b*h), (0, peak*h, w, b*h))
        _paint.noise(tile, INNER_SEED if name in ("inner", "floor") else OUTER_SEED, NOISE_AMOUNT)
        faces[name] = tile.uv(0, 0, w, h)
    return faces


def _geometry(faces, scale):
    cubes, shells, handles = [], [], []
    for x, face in zip(MUG_CENTERS, faces):
        def outline(radius):
            return {"a": radius*scale, "zf": -radius*scale,
                    "zb": radius*scale, "xc": x*scale, "nf": CIRCLE_EXPONENT, "nb": CIRCLE_EXPONENT}

        def wall(rings, surface, thickness, inward=False):
            for (y0, r0), (y1, r1) in zip(rings, rings[1:]):
                uv = face[surface]
                if surface == "body":
                    u, v = uv["uv"]
                    w, h = uv["uv_size"]
                    uv = {"uv": [u, v+h*(1-y1/BODY_TOP)], "uv_size": [w, h*(y1-y0)/BODY_TOP]}
                result = _kit.loft([(y0*scale, outline(r0)), (y1*scale, outline(r1))], uv,
                                   sides=SIDES, thickness=thickness*scale, inward=inward,
                                   assembly="mug_pair_shells", assemblies=ASSEMBLIES)
                shells.extend(result)
                cubes.extend(result)

        wall(FOOT_RINGS, "foot", FOOT_THICKNESS)
        wall(BODY_RINGS, "body", BODY_THICKNESS)
        wall(INNER_RINGS, "inner", INNER_THICKNESS, True)
        # Horizontal rings keep the mouth and the underside open without alpha cutouts.
        for radius, thickness, bottom, top, surface in (
            (RIM_RADIUS, RIM_THICKNESS, BODY_TOP*scale, (BODY_TOP+RIM_HEIGHT)*scale, "rim"),
            (SOLE_RADIUS, SOLE_THICKNESS, 0, SOLE_HEIGHT*scale, "sole"),
        ):
            ring = _kit.ring(SIDES, radius*scale*math.cos(math.pi/SIDES), bottom, top,
                             face[surface], thickness*scale, (x*scale, 0))
            # The kit's general-purpose 0.16 px overlap overwhelms this tiny rim.
            # Retain 0.02 px and align the ring's edges with the loft polygon.
            for cube in ring:
                cube["origin"][0] += RING_EDGE_INSET
                cube["size"][0] -= 2*RING_EDGE_INSET
                cube["rotation"][1] += HALF_TURN/SIDES
            cubes.extend(ring)
        # Opaque strips replace the spike's alpha-masked floor plate. Their ends
        # extend beneath the inner wall, hiding the polygon approximation.
        radius = FLOOR_RADIUS*scale
        for i in range(FLOOR_STRIPS):
            z0, z1 = radius*(-1+2*i/FLOOR_STRIPS), radius*(-1+2*(i+1)/FLOOR_STRIPS)
            width = math.sqrt(radius**2-((z0+z1)/2)**2)
            strip = {"a": width, "xc": x*scale, "zf": z0, "zb": z1}
            u, v = face["floor"]["uv"]
            w, h = face["floor"]["uv_size"]
            floor_face = {"uv": [u+w*(1-width/radius)/2, v+h*i/FLOOR_STRIPS],
                          "uv_size": [w*width/radius, h/FLOOR_STRIPS]}
            cubes.extend(_kit.plate(strip, FLOOR_BOTTOM*scale, FLOOR_TOP*scale, floor_face))
        for a, b, thickness, depth in STRAPS:
            points = [((x+px)*scale, py*scale, 0) for px, py in (a, b)]
            segment = _kit.tube(points, thickness*scale, face["handle"],
                                assembly="mug_pair_handles", assemblies=ASSEMBLIES)
            # The kit aligns flat x segments with world x; angled straps use
            # yaw 90, where local x becomes depth. Widen the shelf across z in
            # either case without changing its thin vertical section.
            for cube in segment:
                depth_axis = 0 if "rotation" in cube else 2
                center = cube["origin"][depth_axis] + cube["size"][depth_axis]/2
                cube["size"][depth_axis] = depth*scale
                cube["origin"][depth_axis] = center-depth*scale/2
            handles.extend(segment)
            cubes.extend(segment)
    _kit.assert_rule(cubes)
    return cubes, {"mug_pair_shells": shells, "mug_pair_handles": handles}


def build() -> _gear_model.GearModel:
    faces = [_glaze(colors, glossy=(i == 0)) for i, colors in enumerate(PALETTES)]
    scale = 1
    # Include panel thickness and handle end overlap in the fixed 4 px footprint.
    for _ in range(FIT_PASSES):
        cubes, members = _geometry(faces, scale)
        lo, hi = _tilt.bounds(cubes)
        scale *= FOOTPRINT / (hi[0]-lo[0])
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
                cube[key] = [round(value, COORDINATE_DIGITS) for value in cube[key]]
    for part, axis_end, target in ((cubes[:len(cubes)//2], 0, -FOOTPRINT/2),
                                    (cubes[len(cubes)//2:], 1, FOOTPRINT/2)):
        shift = round(target-_tilt.bounds(part)[axis_end][0], COORDINATE_DIGITS)
        for cube in part:
            for key in ("origin", "pivot"):
                if key in cube:
                    cube[key][0] = round(cube[key][0]+shift, COORDINATE_DIGITS)
    lo, hi = _tilt.bounds(cubes)
    lift = HEIGHT - hi[1]
    for cube in cubes:
        for key in ("origin", "pivot"):
            if key in cube:
                cube[key][1] += lift
    tray_top = lo[1] + lift
    tray_bottom = tray_top - TRAY_THICKNESS
    tile = _atlas.tile("mug_pair", MIN_TILE_TEXELS, MIN_TILE_TEXELS)
    _paint.linear_gradient(tile, *TRAY_COLORS, (0, 0), (0, tile.height))
    tray_face = tile.uv(0, 0, tile.width, tile.height)
    def board(x, half_width, bottom, top):
        return _kit.plate({"a": half_width, "xc": x,
                           "zf": -TRAY_HALF_DEPTH, "zb": TRAY_HALF_DEPTH},
                          bottom, top, tray_face)
    cubes.extend(board(0, FOOTPRINT/2, tray_bottom, tray_top))
    for x in TRAY_LEG_CENTERS:
        cubes.extend(board(x, TRAY_LEG_HALF_WIDTH, 0, tray_bottom))
    members = {name: _tilt.tilt_assembly(part, (0, 0, 0), "x", 0,
                assembly=name, assemblies=ASSEMBLIES) for name, part in members.items()}
    _tilt.assert_axes(cubes, members, ASSEMBLIES)
    return _gear_model.GearModel(tuple(cubes), ("mug_pair",), tuple(members.items()))
