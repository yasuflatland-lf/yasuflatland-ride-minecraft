"""Twin-bell clock from the owner-reviewed spike, with painted detail (ADR 0247)."""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_tilt = _load_tool("cube_tilt")

ASSEMBLIES = {
    "alarm_clock_case": {"owner": "camping_gear", "cubes": 76},
    "alarm_clock_bells": {"owner": "camping_gear", "cubes": 124},
    "alarm_clock_posts": {"owner": "camping_gear", "cubes": 2},
    "alarm_clock_legs": {"owner": "camping_gear", "cubes": 20},
    "alarm_clock_handle": {"owner": "camping_gear", "cubes": 9},
}
CY = 2.12
BELL_TILT = math.radians(27)
BELL_PROFILE = ((0, .73), (.045, .735), (.20, .69), (.40, .54),
                (.55, .30), (.605, .025))
INK = (17, 21, 23, 255)
LIGHT = (248, 252, 252, 255)


def _chrome(tile):
    stops = ((0, 104), (.16, 229), (.34, 255), (.50, 180), (.72, 238), (1, 141))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        _paint.linear_gradient(tile, (ca, min(255, ca+4), min(255, ca+6), 255),
                               (cb, min(255, cb+4), min(255, cb+6), 255),
                               (a*tile.width, 0), (b*tile.width, 0),
                               (a*tile.width, 0, b*tile.width, tile.height))


def _dial(tile):
    w = tile.width
    stroke = w/25
    c = w/2
    _paint.radial_gradient(tile, (255, 254, 249, 255), (206, 215, 216, 255),
                           (w*.4, w*.33), w*.7)
    for i in range(60):
        angle = i*math.tau/60
        inner = .31 if i % 15 == 0 else .35 if i % 5 == 0 else .41
        _paint.line(tile, (c+math.sin(angle)*w*inner, c-math.cos(angle)*w*inner),
                    (c+math.sin(angle)*w*.47, c-math.cos(angle)*w*.47), INK,
                    stroke*(.65 if i % 5 == 0 else .35))
    _paint.line(tile, (c, c), (c, w*.79), (187, 44, 38, 255), stroke*.8)
    for angle, length, width in ((-1.02, .30, .055), (1.02, .43, .05)):
        def point(x, y):
            return (c+w*(x*math.cos(angle)-y*math.sin(angle)),
                    c+w*(x*math.sin(angle)+y*math.cos(angle)))
        _paint.polygon(tile, [point(-width/2, .085), point(-width/2, -length+.03),
                             point(0, -length), point(width/2, -length+.03),
                             point(width/2, .085)], INK)
        _paint.line(tile, point(0, -length+.05), point(0, -length*.44),
                    (226, 235, 201, 255), stroke*.45)
    _paint.line(tile, (w*.44, w*.415), (w*.815, w*.855), (115, 123, 127, 255), stroke*.65)
    _paint.line(tile, (w*.44, w*.415), (w*.815, w*.855), LIGHT, stroke*.3)
    _paint.ellipse(tile, (c, c), (w*.037, w*.037), (105, 114, 119, 255))
    _paint.ellipse(tile, (c-.25, c-.25), (w*.024, w*.024), LIGHT)


def _back(tile):
    w = tile.width
    _paint.radial_gradient(tile, (61, 63, 66, 255), (28, 30, 32, 255),
                           (w*.4, w*.35), w*.7)
    def rect(a, b, c, d, color):
        _paint.rounded_rect(tile, a*w, b*w, c*w, d*w, 1, color)
    rect(.245, .54, .755, .825, INK)
    rect(.255, .55, .745, .815, (53, 55, 58, 255))
    rect(.40, .78, .60, .86, INK)
    for level in range(7):
        y = w*(.17+level*.022)
        _paint.line(tile, (w*.60, y), (w*.76, y), INK, w*.015)
        _paint.line(tile, (w*.60, y+w*.012), (w*.76, y+w*.012),
                    (83, 86, 89, 255), w*.006)
    rect(.075, .45, .15, .57, INK)
    rect(.085, .46, .14, .51, (94, 98, 100, 255))
    for x, y in ((.155, .295), (.845, .295), (.155, .72), (.845, .72)):
        _paint.ellipse(tile, (x*w, y*w), (1, 1), INK)
        _paint.line(tile, (x*w-.6, y*w), (x*w+.6, y*w), (96, 102, 105, 255), .5)
    for x in (.365, .635):
        _paint.ellipse(tile, (x*w, w*.465), (w*.05, w*.05), INK)
    _paint.ellipse(tile, (w*.885, w*.5), (w*.045, w*.045), INK)
    _paint.ellipse(tile, (w*.885, w*.5), (w*.025, w*.025), (90, 94, 96, 255))


def build() -> _gear_model.GearModel:
    cubes, members, painted = [], {}, []
    density = _atlas.TEXELS_PER_PX

    def texture(w, h, painter):
        tile = _atlas.Tile("alarm_clock", 0, 0, w, h, bytearray(w*h*4))
        painter(tile)
        face = {"uv": [-_atlas.ATLAS_SIZE*(len(painted)+1), 0], "uv_size": [w, h]}
        painted.append((tile, face))
        return face

    silver = texture(density, density, _chrome)
    black = texture(density, density, lambda t: _paint.fill(t, (32, 34, 36, 255)))
    clear = texture(1, 1, lambda t: _paint.fill(t, (205, 211, 214, 0)))

    def add(part, items):
        if part:
            name = "alarm_clock_"+part
            items = _tilt.tilt_assembly(items, (0, 0, 0), "x", 0,
                                        assembly=name, assemblies=ASSEMBLIES)
            members.setdefault(name, []).extend(items)
        cubes.extend(items)
        return items

    def box(center, size, face, rotation=None):
        x, y, z = center
        w, h, d = size
        result = _kit.extrude([(x-w/2, y-h/2), (x+w/2, y-h/2),
                               (x+w/2, y+h/2), (x-w/2, y+h/2)], d, face, z=z, step=10)[0]
        if rotation:
            result["rotation"], result["pivot"] = list(rotation), list(center)
        return result

    def rod(part, a, b, width, face=silver):
        return add(part, _kit.tube([a, b], width, face,
                                  assembly="alarm_clock_"+part if part else None,
                                  assemblies=ASSEMBLIES))

    def ring(radius, depth, z, thickness, sides, face):
        result = []
        for i in range(sides):
            angle = i*math.tau/sides
            result.append(box((radius*math.cos(angle), CY+radius*math.sin(angle), z),
                              (depth, thickness, 2*radius*math.tan(math.pi/sides)+.008),
                              face, (math.degrees(angle)+90, 90, 0)))
        return add("case", result)

    ring(1.65, .83, 0, .10, 20, silver)
    flange = ring(1.75, .30, .49, .35, 20, silver)
    ring(1.59, .15, -.49, .18, 20, silver)
    ring(1.64, .06, .66, .14, 16, black)
    floor = _tilt.bounds(flange)[0][1]
    for radius, z, painter, side in ((1.525, -.555, _dial, "north"),
                                      (1.60, .725, _back, "south")):
        def paint_disc(tile):
            # Filter painted RGB, keeping the final eight-texel density and binary alpha.
            factor = 4
            w, h = tile.width, tile.height
            source = _atlas.Tile("alarm_clock", 0, 0, w*factor, h*factor,
                                  bytearray(w*h*factor*factor*4))
            painter(source)
            for y in range(h):
                for x in range(w):
                    samples = [source.get(x*factor+dx, y*factor+dy)
                               for dy in range(factor) for dx in range(factor)]
                    tile.set(x, y, tuple(round(sum(p[c] for p in samples)/len(samples))
                                         for c in range(3))+(255,))
            _paint.cutout(tile, lambda x, y: math.hypot(x-w/2, y-h/2) > w/2)
        tile = texture(math.ceil(radius*2*density), math.ceil(radius*2*density), paint_disc)
        panel = box((0, CY, z), (radius*2, radius*2, .012), clear)
        panel["uv"][side] = tile
        add(None, [panel])
    # The key shafts remain proud of the painted back, without copying any markings.
    for x in (-.43, .43):
        add(None, [box((x, CY+.12, .81), (.12, .12, .20), silver)])

    for sign in (-1, 1):
        def point(h, r, angle):
            return (sign*1.25+sign*math.sin(BELL_TILT)*h+math.cos(BELL_TILT)*r*math.sin(angle),
                    3.72+math.cos(BELL_TILT)*h-sign*math.sin(BELL_TILT)*r*math.sin(angle),
                    r*math.cos(angle))

        for (h0, r0), (h1, r1) in zip(BELL_PROFILE, BELL_PROFILE[1:]):
            for i in range(12):
                a, b = i*math.tau/12, (i+1)*math.tau/12
                panel, polygon = _kit.planar([point(h0, r0, a), point(h0, r0, b),
                                              point(h1, r1, b), point(h1, r1, a)],
                                             silver, .014, assembly="alarm_clock_bells",
                                             assemblies=ASSEMBLIES, edge_face=clear)
                w, h = [max(2, math.ceil(v*density)) for v in panel["size"][:2]]

                def paint_panel(tile):
                    # Sample in world space so highlight bands cross panel seams
                    # along the tilted bell's latitude, as in the reference spike.
                    stops = ((0, 169), (.06, 230), (.17, 66), (.30, 49), (.48, 155),
                             (.65, 244), (.77, 255), (.88, 181), (1, 208))
                    matrix = _tilt.cube_matrix(panel["rotation"])
                    for y in range(h):
                        for x in range(w):
                            delta = _tilt.apply_matrix(matrix, [((x+.5)/w-.5)*panel["size"][0],
                                                               (.5-(y+.5)/h)*panel["size"][1], 0])
                            px, py, pz = [panel["pivot"][j]+delta[j] for j in range(3)]
                            dx, dy = px-sign*1.25, py-3.72
                            latitude = max(0, min(1, (sign*math.sin(BELL_TILT)*dx
                                                      +math.cos(BELL_TILT)*dy)/.605))
                            angle = math.atan2(math.cos(BELL_TILT)*dx-sign*math.sin(BELL_TILT)*dy, pz)
                            for (a, ca), (b, cb) in zip(stops, stops[1:]):
                                if latitude <= b:
                                    value = ca+(cb-ca)*(latitude-a)/(b-a)
                                    break
                            reflection = .84+.12*math.sin(angle*2+.7)+.05*math.cos(angle*3)
                            value = round(max(28, min(255, value*reflection)))
                            tile.set(x, y, (value, min(255, value+4), min(255, value+6), 255))
                    mask = _atlas.Tile("alarm_clock", 0, 0, w, h, bytearray(w*h*4))
                    outline = [(u*w, v*h) for u, v in polygon]
                    _paint.polygon(mask, outline, LIGHT)
                    for a, b in zip(outline, outline[1:]+outline[:1]):
                        _paint.line(mask, a, b, LIGHT, 1.5)
                    _paint.cutout(tile, lambda x, y: mask.get(int(x), int(y))[3] == 0)
                face = texture(w, h, paint_panel)
                for side in ("north", "south"):
                    panel["uv"][side] = face
                add("bells", [panel])
        tip = point(.595, 0, 0)
        axis = [tip[0], tip[1]-CY, 0]
        length = math.hypot(*axis)
        base = (axis[0]*1.69/length, CY+axis[1]*1.69/length, 0)
        rod("posts", base, tip, .13)
        rod("bells", point(.59, 0, 0), point(.72, 0, 0), .048)
        rod("bells", point(.66, 0, 0), point(.75, 0, 0), .14)

        def leg(x, y):
            return (sign*x, y, -.14-(.83-y)*math.tan(math.radians(34)))
        shoulder, elbow, taper = leg(.97, .83), leg(1.05, .66), leg(1.28, .36)
        toe, end = leg(1.39, floor+.10), leg(1.43, floor+.018)
        for a, b, width in ((shoulder, elbow, .13), (elbow, taper, .12),
                             (taper, toe, .075), (toe, end, .035)):
            tip_cube = rod("legs", a, b, width)[0]
        shift = floor-_tilt.bounds([tip_cube])[0][1]
        for key in ("origin", "pivot"):
            tip_cube[key][1] += shift
        axis = [b-a for a, b in zip(elbow, taper)]
        length = math.hypot(*axis)
        axis = [v/length for v in axis]
        u = [axis[2], 0, -axis[0]]
        length = math.hypot(*u)
        u = [v/length for v in u]
        v = [axis[1]*u[2], axis[2]*u[0]-axis[0]*u[2], -axis[1]*u[0]]
        collar = [a+(b-a)*.20 for a, b in zip(elbow, taper)]
        points = [tuple(collar[j]+.095*(u[j]*math.cos(i*math.tau/6)+v[j]*math.sin(i*math.tau/6))
                        for j in range(3)) for i in range(7)]
        for a, b in zip(points, points[1:]):
            rod("legs", a, b, .025)

    nut_x = 1.25+math.sin(BELL_TILT)*.70
    nut_y = 3.72+math.cos(BELL_TILT)*.70
    handle = [(-nut_x, nut_y, 0), (-.86, 4.47, 0), (-.77, 4.77, 0), (-.61, 4.90, 0),
              (-.30, 4.94, 0), (.30, 4.94, 0), (.61, 4.90, 0),
              (.77, 4.77, 0), (.86, 4.47, 0), (nut_x, nut_y, 0)]
    for a, b in zip(handle, handle[1:]):
        rod("handle", a, b, .055)
    rod(None, (0, 3.72, 0), (0, 4.15, 0), .023)
    rod(None, (-.18, 4.16, 0), (.18, 4.16, 0), .09, black)

    lo, hi = _tilt.bounds(cubes)
    scale = 5/(hi[1]-floor)
    zcenter = (lo[2]+hi[2])/2
    for cube in cubes:
        for key in ("origin", "pivot"):
            if key in cube:
                cube[key] = [(v-(floor if i == 1 else zcenter if i == 2 else 0))*scale
                             for i, v in enumerate(cube[key])]
        cube["size"] = [v*scale for v in cube["size"]]
    # Tangent panels at the cardinal points and narrow upright tips anchor exact
    # millipixel floor/top bounds, avoiding trigonometric export-rounding drift.
    for cube in cubes:
        for key in ("origin", "size", "pivot"):
            if key in cube:
                cube[key] = [round(v, 3) for v in cube[key]]
        if "rotation" in cube:
            cube["rotation"] = [round((v+180) % 360-180, 3) for v in cube["rotation"]]
    for index in (3, 13):
        tip = members["alarm_clock_legs"][index]
        center = tip["pivot"]
        tip["rotation"] = [0, 0, 0]
        tip["origin"] = [round(center[0]-.012, 3), 0, round(center[2]-.012, 3)]
        tip["size"] = [.024, .05, .024]
    # Rounding a neighbouring flange panel can put a corner below the bottom
    # tangent. Lift only those neighbours; the cardinal panel retains contact.
    for cube in flange:
        bottom = _tilt.bounds([cube])[0][1]
        if bottom < 0:
            shift = math.ceil(-bottom*1000)/1000
            for key in ("origin", "pivot"):
                cube[key][1] = round(cube[key][1]+shift, 3)
    bar = members["alarm_clock_handle"][4]
    bar["origin"][1] = round(5-bar["size"][1], 3)

    offsets = {}
    for source, face in sorted(painted, key=lambda entry: -entry[0].height):
        target = _atlas.tile("alarm_clock", source.width, source.height)
        target.pixels[:] = source.pixels
        offsets[face["uv"][0]] = (target.x, target.y)
    for cube in cubes:
        for face in cube["uv"].values():
            u, v = face["uv"]
            if u < 0:
                face["uv"] = list(offsets[u])
    _kit.assert_rule(cubes)
    return _gear_model.GearModel(tuple(cubes), ("alarm_clock",),
                                  {name: tuple(part) for name, part in members.items()})
