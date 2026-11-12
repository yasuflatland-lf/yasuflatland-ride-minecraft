"""Port the approved octagonal percolator, in the spike's Bedrock pixel coordinates."""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")

ASSEMBLIES = {
    "percolator_tank": {"owner": "camping_gear", "cubes": 48},
    "percolator_pot": {"owner": "camping_gear", "cubes": 8},
    "percolator_lid": {"owner": "camping_gear", "cubes": 56},
    "percolator_knob": {"owner": "camping_gear", "cubes": 16},
    "percolator_spout": {"owner": "camping_gear", "cubes": 12},
    "percolator_valve": {"owner": "camping_gear", "cubes": 1},
}

LIGHT = ("a3adaf", "e1e5e1", "d4dbd8", "98a3a6")
SHADE = ("788487", "a5b0b1", "b5bfbd", "7e898c")
DARK = ("121312", "333532", "20221f", "10110f")


def _color(value):
    return tuple(int(value[i:i+2], 16) for i in (0, 2, 4)) + (255,)


def _outline(radius):
    return {"a": radius, "zf": -radius, "zb": radius, "nf": 2, "nb": 2}


def _ring(y, radius):
    return [(x, y, z) for x, z in _kit.outline_points(_outline(radius), 8)]


def build() -> _gear_model.GearModel:
    cubes, members, regions = [], {name: [] for name in ASSEMBLIES}, {}

    painted = []
    uv_stride = _atlas.ATLAS_SIZE

    def region(w, h, tones, polygon=None, vertical=False, detail=None):
        density = _atlas.LETTERING_TEXELS_PER_PX if polygon else _atlas.TEXELS_PER_PX
        minimum = 16 if detail else 2
        w, h = max(minimum, math.ceil(w*density)), max(minimum, math.ceil(h*density))
        key = (w, h, tones, tuple(polygon or ()), vertical, detail)
        if key in regions:
            return regions[key]
        tile = _atlas.Tile("percolator", 0, 0, w, h, bytearray(w*h*4))
        for i, (a, b) in enumerate(zip(tones, tones[1:])):
            start, end = i/(len(tones)-1), (i+1)/(len(tones)-1)
            _paint.linear_gradient(tile, _color(a), _color(b),
                                   (0, start*h) if vertical else (start*w, 0),
                                   (0, end*h) if vertical else (end*w, 0),
                                   (0, start*h, w, end*h) if vertical else (start*w, 0, end*w, h))
        _paint.noise(tile, 1596, 2)
        # A narrow highlight preserves the brushed facets at inventory scale.
        for y in range(h):
            for x in range(w):
                glow = round(9*max(0, 1-abs((x+0.5)/w-0.28)/0.09))
                rgba = tile.get(x, y)
                tile.set(x, y, tuple(min(255, c+glow) for c in rgba[:3])+(255,))
        if detail:
            colors = (("737e80", .47), ("dce3df", .25)) if detail == "rivet" else (
                ("b99a51", .49), ("e4ce84", .35), ("303635", .23), ("111716", .105))
            for color, radius in colors:
                _paint.ellipse(tile, (w/2, h/2), (w*radius, h*radius), _color(color))
        if polygon:
            mask = _atlas.Tile("percolator", 0, 0, w, h, bytearray(w*h*4))
            outline = [(u*w, v*h) for u, v in polygon]
            _paint.polygon(mask, outline, (255, 255, 255, 255))
            # Half a texel of coverage closes nearest-sampled seams between adjoining sheets.
            for a, b in zip(outline, outline[1:]+outline[:1]):
                _paint.line(mask, a, b, (255, 255, 255, 255), width=1)
            _paint.cutout(tile, lambda x, y: mask.get(int(x), int(y))[3] == 0)
        face = {"uv": [-uv_stride*(len(painted)+1), 0], "uv_size": [w, h]}
        painted.append((tile, face))
        regions[key] = face
        return face

    clear = _atlas.tile("percolator", 1, 1).uv(0, 0, 1, 1)
    light = [region(1.35, 2.5, tones) for tones in (LIGHT, SHADE)]
    dark = region(.9, .55, DARK)
    silver = region(.6, .6, LIGHT)

    def add(part, items):
        cubes.extend(items)
        if part:
            members["percolator_"+part].extend(items)

    # Preview and game coordinates mirror model x (ADR 0051); preserve spike handedness.
    def mirrored(points):
        return [(-x, y, z) for x, y, z in points]

    def band(part, y0, r0, y1, r1, black=False, omit=(), thickness=.012, layers=1):
        name = "percolator_"+part
        rings = [(y0+(y1-y0)*t/layers, _outline(r0+(r1-r0)*t/layers)) for t in range(layers+1)]
        built = _kit.loft(rings, silver, sides=8, thickness=thickness, assembly=name,
                          assemblies=ASSEMBLIES)
        for layer in range(layers):
            # Reflection maps spike facet k to loft facet (3-k) modulo eight.
            panels = [built[8*layer+(3-k) % 8] for k in range(8)]
            for i, cube in enumerate(panels):
                cube["uv"] = {side: (dark if black else light[i % 2]) for side in cube["uv"]}
            add(part, [cube for i, cube in enumerate(panels) if i not in omit])

    # Thick inward walls close the underside without an exposed alpha-cut cap edge.
    band("tank", 0, 1.56, .14, 1.56, thickness=.95)
    for cube in members["percolator_tank"]:
        # Thick inward walls meet at corners without the kit's width overlap.
        cube["origin"][0] += _kit.MAX_PANEL_OVERLAP/2
        cube["size"][0] -= _kit.MAX_PANEL_OVERLAP
        cube["origin"][1] = 0
        cube["size"][1] = .14

    for y0, r0, y1, r1, black in ((.14, 1.56, 2.58, 1.14, False),
                                 (2.58, 1.14, 2.7, 1.09, False),
                                 (2.7, 1.09, 2.77, 1.11, True),
                                 (2.77, 1.13, 3.28, 1.13, False),
                                 (3.28, 1.13, 3.4, 1.25, False)):
        band("tank", y0, r0, y1, r1, black)

    def panel(part, points, tones, thickness=.012, detail=None):
        name = "percolator_"+part if part else None
        cube, uv = _kit.planar(mirrored(points), silver, thickness, assembly=name,
                               assemblies=ASSEMBLIES, edge_face=clear)
        # Quantized masks share regions for identically painted opposite facets.
        uv = tuple((round(u, 5), round(v, 5)) for u, v in uv)
        face = region(cube["size"][0], cube["size"][1], tones, uv, detail=detail)
        cube["uv"]["north"] = face
        cube["uv"]["south"] = face
        add(part, [cube])
        return cube

    def cap(radius, y0, y1, tones):
        polygon = tuple(((x/radius+1)/2, (1-z/radius)/2)
                        for x, _, z in _ring(0, radius))
        face = region(radius*2, radius*2, tones, polygon)
        panels = _kit.plate(_outline(radius), y0, y1, face)
        for cube in panels:
            for side in ("north", "south", "east", "west"):
                cube["uv"][side] = clear
        add(None, panels)

    add(None, _kit.plate(_outline(.7), 0, .04, silver))
    bottom, top = _ring(3.4, 1.25), _ring(5.87, 1.7)
    crease = (1.43, 4.388, 0)
    shoulder_x = 1.7-.65*(math.sqrt(2)-1)
    shoulders = [(shoulder_x, 5.87, sign*.65) for sign in (-1, 1)]
    # Loft panels supply the six uninterrupted walls; masks preserve the V notch.
    band("pot", 3.4, 1.25, 5.87, 1.7)
    old = members["percolator_pot"]
    for index in (7, 0):
        cubes.remove(old.pop(index))
    panel("pot", [bottom[0], bottom[1], top[1], shoulders[1], crease], LIGHT)
    panel("pot", [bottom[7], bottom[0], crease, shoulders[0], top[7]], SHADE)

    edge, lidtop = _ring(5.96, 1.72), _ring(6.4, .14)
    # Each panel spans every corner of its band, so one band from r 1.72 to 0.14 would overlap its
    # neighbours into a star at the narrow end; six shallower bands keep the facet seams nearly straight.
    band("lid", 5.96, 1.72, 6.4, .14, omit=(0, 7), layers=6)
    band("lid", 5.895, 1.72, 5.96, 1.72, omit=(0, 7))
    slope_x = (6.06-6.4)/(2.18-.14)
    slope_z = (5.96-6.4-slope_x*(edge[1][0]-.14))/edge[1][2]
    for sign, index in ((1, 1), (-1, 7)):
        tones = LIGHT if sign == 1 else SHADE
        lobe = [(x, 6.4+slope_x*(x-.14)+slope_z*z, sign*z)
                for x, z in ((2.18, 0), (2.18, .055), (2.14, .105), (1.93, .23), (1.53, .52), (edge[1][0], edge[1][2]))]
        panel("lid", lobe+[lidtop[0]], tones)
        for a, b in zip(lobe, lobe[1:]):
            panel("lid", [(a[0], a[1]-.065, a[2]), (b[0], b[1]-.065, b[2]), b, a], tones)
        panel("lid", [edge[index], lidtop[index], lidtop[0]], tones)
    cap(.15, 6.4, 6.412, ("737c7b", "737c7b"))
    band("knob", 6.4, .12, 6.91, .23, True)
    band("knob", 6.91, .23, 6.97, .19, True)
    cap(.19, 6.98, 7, ("252723", "252723"))

    contour = [( -1.7-out, y) for out, y in ((.2,6),(.93,6.03),(1.42,5.44),(.91,3.68),(.8,3.53),(.25,3.42),(.14,3.45),(.08,3.55),(.06,3.75),(.17,3.78),(.3,3.66),(.51,3.76),(.84,5.26),(.65,5.43),(.2,5.41))]
    handle_face = region(1.36, 2.61, ("151614", "20211e", "1a1b19"))
    handle_edge = region(.5, 2.61, ("20211e", "41433e", "2b2d28", "181916"), vertical=True)
    handle = _kit.extrude([(-x, y) for x, y in contour], .5, handle_face, step=.12)
    def subface(face, u0, v0, u1, v1):
        u, v = face["uv"]
        w, h = face["uv_size"]
        return {"uv": [u+u0*w, v+v0*h], "uv_size": [(u1-u0)*w, (v1-v0)*h]}

    for cube in handle:
        x, y, _ = cube["origin"]
        w, h, _ = cube["size"]
        v0, v1 = (6.03-y-h)/2.61, (6.03-y)/2.61
        v0, v1 = max(0, v0), min(1, v1)
        side = subface(handle_face, (3.12-x-w)/1.36, v0, (3.12-x)/1.36, v1)
        for name in ("north", "south"):
            cube["uv"][name] = side
        for name in ("east", "west"):
            cube["uv"][name] = subface(handle_edge, 0, v0, 1, v1)
        for name, level in (("up", v0), ("down", v1)):
            start = min(level, 1-1/handle_edge["uv_size"][1])
            cube["uv"][name] = subface(handle_edge, 0, start, 1, start+1/handle_edge["uv_size"][1])
    add(None, handle)
    bracket = _kit.extrude([(2,5.51),(1.46,5.51),(1.46,6.03),(2,6.03)], .54, silver)
    bracket += _kit.extrude([(2,6.03),(1.46,6.03),(1.46,6.11),(2,6.11)], .58, silver)
    add(None, bracket)
    for z in (-.298, .298):
        panel(None, [(-1.94,5.89,z),(-1.78,5.89,z),(-1.78,6.05,z),(-1.94,6.05,z)], LIGHT, .016, "rivet")

    tip = (2.244, 5.84, 0)
    for index, shoulder in enumerate(shoulders):
        panel("spout", [crease, shoulder, tip], ("99a5a7", "c1cbc8"))
        inset = (-.014, 0, .014 if index == 0 else -.014)
        lining = [tuple(p[i]+inset[i]*(p[1]-crease[1])/(5.87-crease[1]) for i in range(3)) for p in (crease, shoulder, tip)]
        panel("spout", lining, ("e4ece4", "e4ece4"), .008)
        add("spout", _kit.tube(mirrored([shoulder, tip]), .035, silver,
                               assembly="percolator_spout", assemblies=ASSEMBLIES))
        fold = (-.055, -.045, .025 if index == 0 else -.025)
        panel("spout", [shoulder, tip, tuple(tip[i]+fold[i] for i in range(3)), tuple(shoulder[i]+fold[i] for i in range(3))], ("edf2e9", "edf2e9"), .008)
    for points in ([ (1.39,5.83,-.59),(1.39,5.83,.59),(2.22,5.83,0)],
                   [(2.105,5.99,-.115),(2.105,5.99,.115),(2.21,5.845,0)],
                   [(1.4,5.83,0),(1.45,6.03,0),(2.22,5.845,0)],
                   [(1.395,4.388,0),(1.39,5.83,-.59),(1.39,5.83,.59)]):
        panel("spout", points, ("070908", "0c100e"), .008)
    panel("valve", [(.335,2.126,-1.2167),(.603,2.126,-1.1057),(.585,2.394,-1.0623),(.317,2.394,-1.1733)], LIGHT, .04, "valve")
    # Tallest-first shelves keep the fine masks inside the item's fixed atlas cell.
    offsets = {}
    for source, face in sorted(painted, key=lambda entry: -entry[0].height):
        target = _atlas.tile("percolator", source.width, source.height)
        target.pixels[:] = source.pixels
        offsets[face["uv"][0]] = (target.x, target.y)
    for cube in cubes:
        for face in cube["uv"].values():
            u, v = face["uv"]
            if u < 0:
                start = -uv_stride*math.ceil(-u/uv_stride)
                x, y = offsets[start]
                face["uv"] = [x+u-start, y+v]
    return _gear_model.GearModel(tuple(cubes), ("chrome", "black"),
                                  {name: tuple(items) for name, items in members.items()})
