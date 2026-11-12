"""Opaque enamel panels ported from the camping gear spike (ADR 0247)."""

import copy
import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_tilt = _load_tool("cube_tilt")

ASSEMBLIES = {
    "enamel_kettle_body": {"owner": "camping_gear", "cubes": 144},
    "enamel_kettle_lid": {"owner": "camping_gear", "cubes": 48},
    "enamel_kettle_knob": {"owner": "camping_gear", "cubes": 24},
    "enamel_kettle_handle": {"owner": "camping_gear", "cubes": 11},
    "enamel_kettle_spout": {"owner": "camping_gear", "cubes": 4},
}
PROFILE = ((.035, 1.74), (.16, 1.90), (1.47, 1.95), (1.68, 1.94),
           (1.85, 1.80), (1.94, 1.79), (2.09, 1.64), (2.19, 1.64),
           (2.32, 1.47), (2.39, 1.46))
WALL = ((0, "3c581e"), (.04, "607338"), (.09, "354e18"),
        (.6, "2b4213"), (.91, "263b13"), (1, "1c2d10"))
RIB = ((0, "203511"), (.21, "39571b"), (.43, "526c2a"), (.51, "87965a"),
       (.61, "4c6927"), (.82, "2b4514"), (1, "22380f"))
BLACK = ((0, "101211"), (.18, "363936"), (.33, "252825"), (1, "101210"))
LID = ((0, "728348"), (.12, "536d2b"), (.4, "3a551d"), (1, "4e6829"))


def _color(value, shade=1):
    return tuple(round(int(value[i:i+2], 16)*shade) for i in (0, 2, 4)) + (255,)


def _band(width, height, stops, shade=1, horizontal=False, sheen=False):
    tile = _atlas.tile("enamel_kettle", width, height)
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        length = width if horizontal else height
        p0, p1 = ((a*length, 0), (b*length, 0)) if horizontal else ((0, a*length), (0, b*length))
        region = (a*width, 0, b*width, height) if horizontal else (0, a*height, width, b*height)
        _paint.linear_gradient(tile, _color(ca, shade), _color(cb, shade), p0, p1, region)
    if sheen:
        for x in range(width):
            strength = max(0, 1-abs((x+.5)/width-.32)/.32)*.08
            for y in range(height):
                color = tile.get(x, y)
                _paint.fill(tile, tuple(round(c+(s-c)*strength) for c, s in zip(color[:3], (229, 239, 185)))+(255,), x, y, x+1, y+1)
    return tile.uv(0, 0, width, height)


def build() -> _gear_model.GearModel:
    density = _atlas.TEXELS_PER_PX
    # Shared panel regions retain the narrow gloss lines at the atlas's fixed density.
    bands = {}
    for course, ((y0, _), (y1, _)) in enumerate(zip(PROFILE, PROFILE[1:])):
        bands[course] = [_band(8, max(8, math.ceil((y1-y0)*density)), WALL if course == 1 else RIB,
                              .56+.44*i/3, sheen=True) for i in range(4)]
    black = _band(8, 12, BLACK, horizontal=True)
    lid = _band(12, 12, LID)
    green = _band(8, 8, RIB, sheen=True)
    base = _band(2, 2, ((0, "1b2b0e"), (1, "1b2b0e")))
    rivet_tile = _atlas.tile("enamel_kettle", 4, 4)
    _paint.fill(rivet_tile, _color("101211"))
    _paint.ellipse(rivet_tile, (2, 2), (1.8, 1.8), _color("7d868b"))
    _paint.ellipse(rivet_tile, (1.7, 1.5), (1, 1), _color("dde3e6"))
    rivet = rivet_tile.uv(0, 0, 4, 4)
    mouth_tile = _atlas.tile("enamel_kettle", 4, 4)
    _paint.fill(mouth_tile, _color("4c6927"))
    _paint.fill(mouth_tile, _color("050906"), 1, 1, 3, 3)
    mouth = mouth_tile.uv(0, 0, 4, 4)
    cubes, members = [], {}

    def box(a, b, face):
        c = _kit.extrude([(a[0], a[1]), (b[0], a[1]), (b[0], b[1]), (a[0], b[1])],
                         b[2]-a[2], face, z=(a[2]+b[2])/2, step=10)[0]
        cubes.append(c)
        return c

    def circle(radius):
        return {"a": radius, "zf": -radius, "zb": radius, "xc": .34, "nf": 2, "nb": 2}

    def loft(part, rings, face, sides=16):
        result = _kit.loft([(y, circle(r)) for y, r in rings], face, sides=sides,
                           thickness=.045, assembly=f"enamel_kettle_{part}", assemblies=ASSEMBLIES)
        members.setdefault(f"enamel_kettle_{part}", []).extend(result)
        cubes.extend(result)
        return result

    for k, rings in enumerate(zip(PROFILE, PROFILE[1:])):
        for j, c in enumerate(loft("body", rings, bands[k][0])):
            shade = .78+.22*math.cos((j+.5)*math.pi/8+2.1)
            face = bands[k][round((shade-.56)/.44*3)]
            c["uv"] = {side: copy.deepcopy(face) for side in c["uv"]}
    box((.34-1.22, 0, -1.22), (.34+1.22, .045, 1.22), base)
    loft("lid", ((2.385, 1.455), (2.44, 1.455), (2.63, 1.24), (2.65, .12)), lid)
    box((.12, 2.64, -.22), (.56, 2.84, .22), black)
    loft("knob", ((2.82, .49), (2.94, .53), (2.965, .36)), black, 12)
    box((-.02, 2.94, -.36), (.70, 2.965, .36), black)
    for sign in (-1, 1):
        x = .34+sign*1.51
        box((x-.105, 2.11, -.15), (x+.105, 2.64, .26), black)
        box((x-.16, 2.32, -.17), (x+.16, 2.74, .22), black)
        box((x-.09, 2.41, -.202), (x+.09, 2.59, -.178), rivet)
    handle = [(-1.65, 2.49), (-1.65, 3.96), (-1.58, 4.26), (-1.39, 4.51),
              (-1.12, 4.67), (-.82, 4.72), (.82, 4.72), (1.12, 4.67),
              (1.39, 4.51), (1.58, 4.26), (1.65, 3.96), (1.65, 2.49)]
    members["enamel_kettle_handle"] = _kit.tube([(.34+x, y, .06) for x, y in handle], .205, black,
        assembly="enamel_kettle_handle", assemblies=ASSEMBLIES)
    cubes.extend(members["enamel_kettle_handle"])
    direction = (math.hypot(.77, .15), .62)
    length = math.hypot(*direction)
    points = [(1.8+direction[0]/length*t, 1.12+direction[1]/length*t, .06)
              for t in (0, .4, .8, 1.2, 1.56)]
    members["enamel_kettle_spout"] = []
    for a, b, size in zip(points, points[1:], (.8, .66, .53, .45)):
        segment = _kit.tube([a, b], size, green, assembly="enamel_kettle_spout", assemblies=ASSEMBLIES)
        members["enamel_kettle_spout"].extend(segment)
        cubes.extend(segment)
    # The kit points local +z along the segment, so south is the exposed tip end.
    cubes[-1]["uv"]["south"] = mouth
    lo, hi = _tilt.bounds(cubes)
    scale = 5/(hi[0]-lo[0])
    offset = -(hi[0]+lo[0])*scale/2
    for c in cubes:
        for key in ("origin", "pivot"):
            if key in c:
                c[key] = [v*scale+(offset if i == 0 else 0) for i, v in enumerate(c[key])]
        c["size"] = [v*scale for v in c["size"]]
        # The spike's Three.js x is the game's -x (render_preview mirrors x), so mirror the port
        # to keep the photos' spout on the left of the front view.
        c["origin"][0] = -(c["origin"][0]+c["size"][0])
        if "pivot" in c:
            c["pivot"][0] = -c["pivot"][0]
        if "rotation" in c:
            c["rotation"][1] = -c["rotation"][1]+0.0
    # Width fixes the uniform scale; the top bar anchors height without stretching the body.
    bar = members["enamel_kettle_handle"][5]
    bar["origin"][1] = 5-bar["size"][1]
    _kit.assert_rule(cubes)
    return _gear_model.GearModel(tuple(cubes), ("enamel_kettle",),
                                 {name: tuple(part) for name, part in members.items()})
