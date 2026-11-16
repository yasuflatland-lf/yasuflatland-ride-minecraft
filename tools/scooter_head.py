"""Steering casting, controls, instruments, and mirrors from the agreed spike."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
tilt = load_tool("cube_tilt")
AREA = "head"

COLLAR = ((17.25, -6.65, .56), (17.35, -6.65, .65),
          (18.35, -6.35, .64), (18.5, -6.3, .52))
JOINT = ((-6, 18.05), (-6.68, 18.05), (-7.25, 17.15), (-7.47, 16.55),
         (-7.15, 16.45), (-6.65, 17.22), (-6.05, 17.6))
HORN = ((524, 148, 165, 1), (538, 143, 168, 1.08), (556, 133, 167, 1.08),
        (574, 121, 166, 1.22), (590, 111, 166, 1.38), (600, 110, 165, 1.45))
REAR_CAPS = ((.02, .35), (.7, .25))
BIB = ((0, 20.65, 17.95, -8.25, -5), (.65, 20.5, 18.1, -8.1, -5.05),
       (1.2, 20.12, 18.46, -7.7, -5.05), (1.8, 19.55, 18.66, -6.9, -5.1),
       (2.4, 19.12, 18.48, -6.2, -5.15), (2.85, 19.02, 18.41, -6, -5.25))
WING_X = (-2.85, -2.4, -1.8, -1.2, -.65, 0, .65, 1.2, 1.8, 2.4, 2.85)
METER_RINGS = ((0, .56), (.1, .59), (.18, .5))
LAMP_RINGS = ((1.42, .1), (1.46, -.12), (1.38, -.3), (1.23, -.32))
CONTROL_RINGS = ((2.8, 18.73, -5.65, .34), (3.12, 18.682, -5.5, .4),
                 (3.63, 18.6055, -5.25, .4), (3.85, 18.5725, -5.2, .34))
GRIP_CENTERS = ((3.85, 18.5725, -5.2), (5.65, 18.3025, -5.2))
LEVER = ((3.55, 18.8, -5.8), (4, 18.79, -6.05), (5.65, 18.54, -6.22),
         (6.05, 18.52, -6.12))
MIRROR_STEM = ((2.6, 18.7, -5.9), (2.6, 19.5, -5.9))
MIRROR_RINGS = ((.95, -.2), (.95, .15))
LENS_STOPS = ((0, (255, 255, 255)), (.35, (233, 237, 239)), (.5, (82, 93, 99)),
              (.65, (250, 252, 251)), (.9, (52, 62, 67)), (1, (233, 236, 238)))
DIAL_STOPS = ((0, (255, 254, 244)), (.72, (222, 220, 203)), (.85, (145, 155, 155)),
              (.91, (255, 255, 255)), (1, (89, 102, 109)))
BACK_STOPS = ((0, (228, 237, 240)), (.16, (255, 255, 255)), (.24, (39, 48, 55)),
              (.5, (16, 24, 28)), (.58, (227, 237, 239)), (.78, (255, 255, 255)),
              (1, (135, 150, 157)))
LENS_GRADIENT = ((54, 50, 6), (64, 64, 62))
DIAL_GRADIENT = ((78, 64, 6), (96, 96, 94))
LENS_SHADOW = (((7, 23), (27, 9), (34, 12), (42, 20)),
               ((42, 20), (24, 40), (23, 62), (34, 83)),
               ((12, 100), (-1, 70), (0, 48), (7, 23)))
LENS_CROSSBAR = ((7, 66), (40, 61), (95, 76), (122, 57))
LENS_ELLIPSES = ((64, 68, 13, 17, (81, 90, 96)), (60, 61, 8, 10, (246, 248, 245)))
LENS_ARC = (64, 64, 52, .3, 2.2, 7)
LENS_FLUTES = (15, 118, 7, 1, .28)
LENS_CROSSBAR_STYLE = (5, .65, (35, 43, 46))
LENS_SHADOW_RGB = (36, 43, 48)
DIAL_TICKS = (96, 96, 62, 74, .75, 1.5, 12, 3)
DIAL_NEEDLE = ((96, 96), (64, 58), 4, (155, 56, 43))
DIAL_HUB = (96, 96, 6, (84, 91, 89))
DIAL_ARC = (94, 94, 80, 3.7, 5.2, 8)
DIAL_TICK_RGB = (52, 59, 60)
BACK_GRADIENT_VECTOR = (10, 128)
BACK_RIM = (64, 64, 62, 3, (237, 243, 245))


def _smooth(points, x, column):
    i = 0
    while i < len(points)-2 and x > points[i+1][0]:
        i += 1
    a, b = points[i:i+2]
    prev, following = points[max(0, i-1)], points[min(len(points)-1, i+2)]
    t = max(0, min(1, (x-a[0])/(b[0]-a[0])))
    ma = (b[column]-prev[column])/(b[0]-prev[0])
    mb = (following[column]-a[column])/(following[0]-a[0])
    return ((2*t**3-3*t*t+1)*a[column] + (t**3-2*t*t+t)*(b[0]-a[0])*ma
            + (-2*t**3+3*t*t)*b[column] + (t**3-t*t)*(b[0]-a[0])*mb)


def _cos_steps(a, b, n):
    return [a+(b-a)*(1-math.cos(math.pi*i/n))/2 for i in range(n+1)]


def _round_outline(points):
    result = []
    for i, a in enumerate(points):
        c, b, d = points[i-1], points[(i+1) % len(points)], points[(i+2) % len(points)]
        for k in range(dims.HEAD_OUTLINE_STEPS):
            t = k/dims.HEAD_OUTLINE_STEPS
            result.append(tuple((2*v+(-c[j]+b[j])*t+(2*c[j]-5*v+4*b[j]-d[j])*t*t
                                 +(-c[j]+3*v-3*b[j]+d[j])*t**3)/2 for j, v in enumerate(a)))
    return result


def _angles(n):
    return [math.tau*j/n for j in range(n)]


def _side_outline():
    steps = _cos_steps(HORN[0][0], HORN[-1][0], dims.HEAD_SIDE_STEPS)
    outline = []
    for sign, stations in ((-1, steps), (1, reversed(steps))):
        for x in stations:
            top, bottom, width = (_smooth(HORN, x, col) for col in (1, 2, 3))
            f = math.sqrt(max(0, 1-(dims.HEAD_SIDE_X/width)**2))
            outline.append(dims.i2m(x, (top+bottom)/2+sign*(bottom-top)*f/2))
    return outline


def _paint(x, y):
    b = (dims.HEAD_PAINT_BASE + dims.HEAD_PAINT_CROWN_GAIN
         * math.exp(-((y-dims.HEAD_PAINT_CROWN_Y)/dims.HEAD_PAINT_CROWN_SPREAD)**2)
         + dims.HEAD_PAINT_CENTER_GAIN * math.exp(-(x/dims.HEAD_PAINT_CENTER_SPREAD)**2))
    return tuple(round(c*b) for c in dims.HEAD_PAINT_RGB)


def _gradient(stops, t):
    t = max(0, min(1, t))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if a <= t <= b:
            return tuple(round(x+(y-x)*(t-a)/(b-a)) for x, y in zip(ca, cb))
    return stops[-1][1]


def _radial(x, y, circles):
    (ax, ay, ar), (bx, by, br) = circles
    dx, dy, dr = bx-ax, by-ay, br-ar
    px, py = x-ax, y-ay
    a = dx*dx+dy*dy-dr*dr
    b = -2*(px*dx+py*dy+ar*dr)
    c = px*px+py*py-ar*ar
    return max(0, (-b-math.sqrt(max(0, b*b-4*a*c)))/(2*a))


def _distance(x, y, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    t = max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/max(dims.HEAD_PIXEL_EPSILON, dx*dx+dy*dy)))
    return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)


def _bezier(points):
    a, b, c, d = points
    return [tuple((1-t)**3*a[j]+3*(1-t)**2*t*b[j]+3*(1-t)*t*t*c[j]+t**3*d[j]
                  for j in range(2)) for t in (i/dims.HEAD_CURVE_STEPS for i in range(dims.HEAD_CURVE_STEPS+1))]


def _inside(x, y, points):
    hit = False
    for (ax, ay), (bx, by) in zip(points, (*points[1:], points[0])):
        if (ay > y) != (by > y) and x < ax+(y-ay)*(bx-ax)/(by-ay):
            hit = not hit
    return hit


def _arc(x, y, shape):
    cx, cy, radius, start, end, width = shape
    return start <= math.atan2(y-cy, x-cx) % math.tau <= end and abs(math.hypot(x-cx, y-cy)-radius) <= width/2


def _blend(color, overlay, alpha):
    return tuple(round(a*(1-alpha)+b*alpha) for a, b in zip(color, overlay))


def _disc_pixel(kind, size):
    shadow = [p for curve in LENS_SHADOW for p in _bezier(curve)]
    crossbar = _bezier(LENS_CROSSBAR)

    def pixel(u, v):
        x, y = u+.5, v+.5
        if math.hypot(x/size-dims.HEAD_DISC_CENTER, y/size-dims.HEAD_DISC_CENTER) > dims.HEAD_DISC_RADIUS:
            return atlas.CLEAR
        if kind == "glass":
            color = dims.HEAD_GLASS_RGB
        elif kind == "back":
            dx, dy = BACK_GRADIENT_VECTOR
            color = _gradient(BACK_STOPS, (x*dx+y*dy)/(dx*dx+dy*dy))
            cx, cy, r, width, rim = BACK_RIM
            if abs(math.hypot(x-cx, y-cy)-r) <= width/2:
                color = rim
        elif kind == "lens":
            color = _gradient(LENS_STOPS, _radial(x, y, LENS_GRADIENT))
            if _inside(x, y, shadow):
                color = LENS_SHADOW_RGB
            if _arc(x, y, LENS_ARC):
                color = (dims.HEAD_ALPHA,)*3
            start, end, step, width, alpha = LENS_FLUTES
            if any(abs(x-line) <= width/2 for line in range(start, end, step)):
                color = _blend(color, (dims.HEAD_ALPHA,)*3, alpha)
            width, alpha, line_color = LENS_CROSSBAR_STYLE
            if any(_distance(x, y, a, b) <= width/2 for a, b in zip(crossbar, crossbar[1:])):
                color = _blend(color, line_color, alpha)
            for cx, cy, rx, ry, fill in LENS_ELLIPSES:
                if ((x-cx)/rx)**2+((y-cy)/ry)**2 <= 1:
                    color = fill
        else:
            color = _gradient(DIAL_STOPS, _radial(x, y, DIAL_GRADIENT))
            cx, cy, inner, outer, start, sweep, ticks, width = DIAL_TICKS
            for i in range(ticks+1):
                angle = math.pi*(start+i*sweep/ticks)
                a = (cx+inner*math.cos(angle), cy+inner*math.sin(angle))
                b = (cx+outer*math.cos(angle), cy+outer*math.sin(angle))
                if _distance(x, y, a, b) <= width/2:
                    color = DIAL_TICK_RGB
            a, b, width, needle = DIAL_NEEDLE
            if _distance(x, y, a, b) <= width/2:
                color = needle
            cx, cy, r, hub = DIAL_HUB
            if math.hypot(x-cx, y-cy) <= r:
                color = hub
            if _arc(x, y, DIAL_ARC):
                color = _blend(color, (dims.HEAD_ALPHA,)*3, dims.HEAD_DIAL_GLINT_ALPHA)
        return (*color, dims.HEAD_ALPHA)
    return pixel


def _outline_region(name, outline, color):
    width, height, pixel = atlas.outline_pixel(outline, dims.HEAD_TEXELS_PER_PX, color)
    return atlas.Region(name, width, height, atlas.Material.PAINT, pixel)


def _paint_surfaces():
    rings = [[(r*math.cos(a), y, z+r*math.sin(a)) for a in _angles(dims.HEAD_RING_SIDES)]
             for y, z, r in COLLAR]
    yield "head_collar", rings, dims.HEAD_COLLAR_THICK
    rings = []
    for xi in _cos_steps(HORN[0][0], HORN[-1][0], dims.HEAD_LOFT_STEPS):
        top, bottom, width = (_smooth(HORN, xi, col) for col in (1, 2, 3))
        z, top = dims.i2m(xi, top)
        _, bottom = dims.i2m(xi, bottom)
        rings.append([(width*math.cos(a), (top+bottom)/2+(top-bottom)*math.sin(a)/2, z)
                      for a in _angles(dims.HEAD_RING_SIDES)])
    center_y = sum(p[1] for p in rings[0])/len(rings[0])
    caps = [[(x*scale, center_y+(y-center_y)*scale, z+offset) for x, y, z in rings[0]]
            for scale, offset in REAR_CAPS]
    yield "head_headset", caps+rings, dims.HEAD_SHELL_THICK
    rings = []
    for x in WING_X:
        high, low, front, back = (_smooth(BIB, abs(x), col) for col in (1, 2, 3, 4))
        rings.append([(x, (high+low)/2+(high-low)*math.cos(a)/2,
                       (front+back)/2+(back-front)*math.sin(a)/2) for a in _angles(dims.HEAD_BIB_SIDES)])
    yield "head_bib", rings, dims.HEAD_BIB_THICK


def _fitted_skin(rings, thickness, faces, assembly, inside=None):
    cubes = kit.skin(rings, thickness, faces, closed=True, assembly=assembly, inside=inside)
    patches = [(a[j], a[(j+1) % len(a)], b[j], b[(j+1) % len(a)])
               for a, b in zip(rings, rings[1:]) for j in range(len(a))]
    for cube, (a0, a1, b0, b1) in zip(cubes, patches):
        u = [(a1[i]-a0[i]+b1[i]-b0[i])/2 for i in range(3)]
        v = [(b0[i]-a0[i]+b1[i]-a1[i])/2 for i in range(3)]
        ex = [n/math.sqrt(sum(n*n for n in u)) for n in u]
        along = sum(a*b for a, b in zip(v, ex))
        orthogonal = [v[i]-along*ex[i] for i in range(3)]
        ey = [n/math.sqrt(sum(n*n for n in orthogonal)) for n in orthogonal]
        normal = [ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0]]
        old = tilt.cube_matrix(cube.get("rotation", (0, 0, 0)))
        if sum(normal[i]*old[i][2] for i in range(3)) < 0:
            ey, normal = [-n for n in ey], [-n for n in normal]
        matrix = [[ex[i], ey[i], normal[i]] for i in range(3)]
        center = [sum(p[i] for p in (a0, a1, b0, b1))/4 for i in range(3)]
        local = [[sum((p[i]-center[i])*matrix[i][j] for i in range(3)) for j in range(2)]
                 for p in (a0, a1, b0, b1)]
        low = [min(p[i] for p in local)-dims.HEAD_FITTED_OVERLAP for i in range(2)]
        high = [max(p[i] for p in local)+dims.HEAD_FITTED_OVERLAP for i in range(2)]
        # Preserve the spike's tangent frame instead of exposing the enclosing
        # unrolled rectangle at the edges of chrome sleeves and leather grips.
        cube.update(origin=[center[0]+low[0], center[1]+low[1], center[2]-thickness],
                    size=[high[0]-low[0], high[1]-low[1], thickness],
                    pivot=center, rotation=tilt._rotation_of(matrix))
    return cubes


def _paint_panels():
    panels = []
    for assembly, rings, thickness in _paint_surfaces():
        cubes = _fitted_skin(rings, thickness, atlas.faces("paint"), assembly)
        corners = [(a[j], a[(j+1) % len(a)], b[(j+1) % len(a)], b[j])
                   for a, b in zip(rings, rings[1:]) for j in range(len(a))]
        for cube, points in zip(cubes, corners):
            matrix = tilt.cube_matrix(cube.get("rotation", (0, 0, 0)))
            pivot = cube.get("pivot", (0, 0, 0))
            local = [tuple(sum((p[i]-pivot[i])*matrix[i][j] for i in range(3))
                           for j in range(2)) for p in points]
            panels.append((assembly, cube, local, matrix))
    return panels


def _panel_region():
    panels = _paint_panels()
    tile, columns = dims.HEAD_PANEL_TEXELS, dims.HEAD_PANEL_COLUMNS
    width, height = columns*tile, math.ceil(len(panels)/columns)*tile
    def pixel(u, v):
        index = v//tile*columns+u//tile
        if index >= len(panels):
            return atlas.CLEAR
        _, cube, outline, matrix = panels[index]
        pivot = cube.get("pivot", (0, 0, 0))
        lo = [cube["origin"][i]-pivot[i] for i in range(2)]
        sx, sy = cube["size"][:2]
        x, y = lo[0]+(u % tile+.5)*sx/tile, lo[1]+(1-(v % tile+.5)/tile)*sy
        allowance = dims.HEAD_PANEL_EDGE_PADDING*max(sx, sy)
        if not _inside(x, y, outline) and not any(
                _distance(x, y, a, b) <= allowance for a, b in zip(outline, (*outline[1:], outline[0]))):
            return atlas.CLEAR
        wx, wy = (pivot[i]+matrix[i][0]*x+matrix[i][1]*y for i in range(2))
        return (*_paint(wx, wy), dims.HEAD_ALPHA)
    return atlas.Region("head_panels", width, height, atlas.Material.PAINT, pixel)


def register_regions(registry):
    regions = [_panel_region()]
    for name, outline, x in (("head_joint", _round_outline(JOINT), dims.HEAD_JOINT_X),
                              ("head_side", _side_outline(), dims.HEAD_SIDE_X)):
        low, high = min(p[1] for p in outline), max(p[1] for p in outline)
        height = math.ceil((high-low)*dims.HEAD_TEXELS_PER_PX)
        def color(u, v, name=name, x=x, high=high, low=low, height=height):
            y = high-(v+.5)*(high-low)/height
            if name == "head_joint":
                return tuple(round(c-(dims.HEAD_JOINT_SHADE_Y-y)*dims.HEAD_JOINT_SHADE_GAIN)
                             for c in dims.HEAD_JOINT_RGB)
            return _paint(x, y)
        regions.append(_outline_region(name, outline, color))
    regions.append(atlas.Region("head_grip", atlas.SMALL_TEXELS, atlas.SMALL_TEXELS,
                                atlas.Material.LEATHER, lambda u, v: (*dims.HEAD_GRIP_RGB, dims.HEAD_ALPHA)))
    for kind, size, material in (("lens", dims.HEAD_LENS_TEXELS, atlas.Material.LENS),
                                  ("dial", dims.HEAD_DIAL_TEXELS, atlas.Material.PLATE),
                                  ("glass", dims.HEAD_MIRROR_TEXELS, atlas.Material.LENS),
                                  ("back", dims.HEAD_MIRROR_TEXELS, atlas.Material.CHROME)):
        regions.append(atlas.Region("head_"+kind, size, size, material, _disc_pixel(kind, size)))
    for index, (_, y, z) in enumerate(GRIP_CENTERS):
        outline = [(z+dims.HEAD_GRIP_RADIUS*math.sin(a), y+dims.HEAD_GRIP_RADIUS*math.cos(a))
                   for a in _angles(dims.HEAD_CONTROL_SIDES)]
        width, height, pixel = atlas.outline_pixel(outline, dims.HEAD_TEXELS_PER_PX,
                                                  lambda u, v: dims.HEAD_GRIP_RGB)
        regions.append(atlas.Region(f"head_grip_cap_{index}", width, height, atlas.Material.LEATHER, pixel))
    registered = {r.name for r in registry.regions()}
    for region in regions:
        if region.name not in registered:
            registry.register(region)


def _transform(point, position, axis, angle):
    x, y, z = point
    c, s = math.cos(angle), math.sin(angle)
    p = (x, c*y-s*z, s*y+c*z) if axis == "x" else (c*x+s*z, y, -s*x+c*z)
    return tuple(a+b for a, b in zip(p, position))


def _placed_box(lo, hi, faces, position, axis, angle):
    cube = kit.box(lo, hi, faces)
    cube["origin"] = [a+b for a, b in zip(lo, position)]
    cube["pivot"] = list(position)
    cube["rotation"] = [-math.degrees(angle), 0, 0] if axis == "x" else [0, math.degrees(angle), 0]
    return cube


def build() -> kit.AreaCubes:
    register_regions(atlas.REGISTRY)
    result = kit.AreaCubes()
    chrome = atlas.faces("chrome")
    def skin(bone, rings, thickness, faces, assembly, inside=None):
        result.add(bone, _fitted_skin(rings, thickness, faces, assembly, inside))
    for index, (assembly, cube, _, _) in enumerate(_paint_panels()):
        tile = dims.HEAD_PANEL_TEXELS
        u, v = index % dims.HEAD_PANEL_COLUMNS * tile, index // dims.HEAD_PANEL_COLUMNS * tile
        cube["uv"] = atlas.faces("clear")
        cube["uv"]["south"] = atlas.face("head_panels", u, v, tile, tile)
        result.add("steer", cube, assembly)
    for side in (-1, 1):
        result.add("steer", kit.profile_plate(_round_outline(JOINT), side*dims.HEAD_JOINT_X,
                                             dims.HEAD_JOINT_THICK, "head_joint"))
        result.add("steer", kit.profile_plate(_side_outline(), side*dims.HEAD_SIDE_X,
                                             dims.HEAD_SIDE_THICK, "head_side"))
    rings = [[_transform((r*math.cos(a), y, r*math.sin(a)), dims.HEAD_METER_POSITION,
                         "x", dims.HEAD_METER_TILT) for a in _angles(dims.HEAD_RING_SIDES)]
             for y, r in METER_RINGS]
    skin("steer", rings, dims.HEAD_METER_THICK, chrome, "head_meter")
    faces = atlas.faces("clear")
    faces["up"] = atlas.face("head_dial")
    result.add("steer", _placed_box(dims.HEAD_METER_LO, dims.HEAD_METER_HI, faces,
                                    dims.HEAD_METER_POSITION, "x", dims.HEAD_METER_TILT))
    z, y = dims.i2m(*dims.HEAD_LAMP_PHOTO)
    position = (0, y, z)
    rings = [[(r*math.cos(a), y+r*math.sin(a), z+depth) for a in _angles(dims.HEAD_RIM_SIDES)]
             for r, depth in LAMP_RINGS]
    skin("headlights", rings, dims.HEAD_LAMP_THICK, chrome, "head_lamp", position)
    faces = atlas.faces("clear")
    faces["north"] = atlas.face("head_lens")
    result.add("headlights", _placed_box(dims.HEAD_LENS_LO, dims.HEAD_LENS_HI, faces, position, "y", 0))
    for side in (-1, 1):
        rings = [[(side*x, y+r*math.cos(a), z+r*math.sin(a)) for a in _angles(dims.HEAD_CONTROL_SIDES)]
                 for x, y, z, r in CONTROL_RINGS]
        skin("steer", rings, dims.HEAD_CONTROL_THICK, chrome, "head_controls")
        rings = [[(side*x, y+dims.HEAD_GRIP_RADIUS*math.cos(a), z+dims.HEAD_GRIP_RADIUS*math.sin(a))
                  for a in _angles(dims.HEAD_CONTROL_SIDES)] for x, y, z in GRIP_CENTERS]
        skin("steer", rings, dims.HEAD_GRIP_THICK, atlas.faces("head_grip"), "head_controls")
        for index, ring in enumerate(rings):
            result.add("steer", kit.profile_plate([(p[2], p[1]) for p in ring], ring[0][0],
                                                 dims.HEAD_GRIP_CAP_THICK, f"head_grip_cap_{index}"))
        result.add("steer", kit.tube([(side*x, y, z) for x, y, z in LEVER], dims.HEAD_LEVER_SIZE,
                                    chrome, assembly="head_levers"))
        x = side*dims.HEAD_LEVER_PIVOT_X
        y0, y1 = dims.HEAD_LEVER_PIVOT_Y
        z0, z1 = dims.HEAD_LEVER_PIVOT_Z
        result.add("steer", kit.box((x-dims.HEAD_LEVER_PIVOT_HALF_WIDTH, y0, z0),
                                   (x+dims.HEAD_LEVER_PIVOT_HALF_WIDTH, y1, z1), chrome))
        x, y, z = dims.HEAD_MIRROR_POSITION
        position = (side*x, y, z)
        dx, dy, dz = dims.HEAD_MIRROR_SOCKET_OFFSET
        socket = (side*(x+dx), y+dy, z+dz)
        result.add("steer", kit.tube([(side*x, y, z) for x, y, z in MIRROR_STEM]+[socket],
                                    dims.HEAD_MIRROR_STEM_SIZE, chrome, assembly="head_mirrors"))
        angle = side*dims.HEAD_MIRROR_TILT
        rings = [[_transform((r*math.cos(a), r*math.sin(a), depth), position, "y", angle)
                  for a in _angles(dims.HEAD_RIM_SIDES)] for r, depth in MIRROR_RINGS]
        skin("steer", rings, dims.HEAD_MIRROR_THICK, chrome, "head_mirrors", position)
        faces = atlas.faces("clear")
        faces["north"], faces["south"] = atlas.face("head_back"), atlas.face("head_glass")
        result.add("steer", _placed_box(dims.HEAD_MIRROR_LO, dims.HEAD_MIRROR_HI, faces, position, "y", angle))
        result.add("steer", _placed_box(dims.HEAD_MIRROR_SOCKET_LO, dims.HEAD_MIRROR_SOCKET_HI,
                                        chrome, position, "y", angle))
    # The orchestrator mirrors local X without reflecting face UVs. Preserve
    # the spatial direction of alpha outlines and asymmetric instrument art.
    for cubes in result.values():
        for cube in cubes:
            for name in ("north", "south", "up", "down"):
                face = cube["uv"][name]
                face["uv"][0] += face["uv_size"][0]
                face["uv_size"][0] *= -1
    return result
