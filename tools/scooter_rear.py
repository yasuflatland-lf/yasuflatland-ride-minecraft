"""Scooter seat, tail light and plate, ported from the agreed spike shape."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")

AREA = "rear"
SEAT_ASSEMBLY = "rear_seat"
LAMP_ASSEMBLY = "rear_lamp"
PLATE_ASSEMBLY = "rear_plate"
PLATE_NAME = "plate_text"

# Seat side outline and plan width, in pixels of the calibrated side photo.
SEAT_OUTLINE = [(165, 267), (165, 240), (170, 224), (180, 214), (193, 216), (212, 226), (260, 231),
                (310, 230), (354, 226), (386, 220), (393, 229), (397, 242), (391, 251), (360, 258),
                (280, 265), (200, 269)]
SEAT_WIDTH = [(165, 1.86), (170, 2.2), (182, 2.32), (240, 2.32), (270, 2.26), (310, 1.83),
              (350, 1.31), (382, 0.9), (392, 0.82), (396, 0.74), (397, 0.65)]
SEAT_RING_PHOTO_X = (165.05, 170, 182, 205, 240, 295, 345, 382, 396.95)
SEAT_X_MIN, SEAT_X_MAX = 165.05, 396.95
SEAT_ARC_STEPS = 6
SEAT_BELLY_DROP = 0.06
SEAT_BELLY_WIDTH = 0.8
SEAT_SKIN = 0.065
SEAT_CAP_SKIN = 0.04
SEAT_CAP_SCALE = 0.04

# Side-photo calibration of the spike (camera ray and plane intersection).
SIDE_ORIGIN = (67.06044586721978, 19.658432367867558, -9.293375316273526)
SIDE_EULER_YXZ = (0.009094408239098302, 1.5530540217458202, 0.013353457932479265)
SIDE_FOCAL = 1341.9033074952995
SIDE_CENTER = (637.4085583675401, 133.03247667128977)

LAMP_PHOTO = (82, 345)
LAMP_OFFSET = (0, 0.38, 0.45)
LAMP_SCALE = 0.9
LAMP_TILT = -0.23
LAMP_RING_POINTS = 12
LAMP_SQUARENESS = 3.0
LAMP_SHELL_SKIN = 0.09
LAMP_BASE_SKIN = 0.07
LAMP_LENS_SKIN = 0.06
LAMP_CAP_SKIN = 0.09
LAMP_RIM_SIZE = 0.065
LAMP_SHELL = ((0.82, 0.46, -0.48), (1.12, 0.66, 0.02), (1.21, 0.68, 0.48), (1.13, 0.61, 0.72))
LAMP_BASE = ((0.84, 0.48, -0.51), (1.15, 0.69, -0.3))
LAMP_LENS = ((1.15, 0.64, 0.28), (1.13, 0.61, 0.72))
LAMP_CAP = ((1.12, 0.6, 0.72), (1.05, 0.54, 0.87))
LAMP_RIM = (1.17, 0.65, 0.74)

HOOD_RING_POINTS = 8
HOOD_SKIN = 0.07
HOOD_RIM_SIZE = 0.055
HOOD = ((0.46, 0.49, -0.12, 0.91, 2.0), (0.44, 0.55, 0.22, 0.91, 2.0), (0.33, 0.45, 0.65, 0.86, 2.0))
HOOD_TIP = (0.01, 0.01, 0.72, 0.8)
HOOD_BASE_Y = (0.66, 0.8)
HOOD_BASE_RADIUS = 0.5
HOOD_BASE_Z = 0.2
HOOD_BASE_DEPTH = 0.48
HOOD_BASE_SKIN = 0.055
ARM_SIZE = 0.06
ARM = ((0.95, 0.42, 0.87), (0.85, 0.66, 0.25), (0.6, 1.29, -0.03), (0.35, 1.35, -0.03))
SADDLE_SKIN = 0.04
SADDLE = ((0.82, 0.1, -0.72, -0.62), (1.08, 0.13, 0.1, -0.61), (0.92, 0.09, 0.75, -0.54))
SIDE_PLATE_X = 1.03
SIDE_PLATE_THICK = 0.06
SIDE_PLATE = ((-0.85, -0.6), (-0.78, 0.48), (-0.37, 0.63), (0.65, 0.31), (0.85, -0.22),
              (0.45, -0.66), (-0.15, -0.78))
SIDE_INNER_X = 1.065
SIDE_INNER_THICK = 0.025
SIDE_INNER = ((-0.66, -0.47), (-0.57, 0.33), (-0.31, 0.45), (0.45, 0.18), (0.62, -0.18),
              (0.27, -0.49))

PLATE_PHOTO = (63, 381)
PLATE_TILT = -0.36
PLATE_WIDTH = 3.0
PLATE_HEIGHT = 3.3
PLATE_THICK = 0.15
PLATE_BRACKET_Y = -1.72
PLATE_BRACKET_SAG = 0.035
PLATE_BRACKET_HALF = 1.56
PLATE_BRACKET_POINTS = 5
PLATE_BRACKET_SIZE = 0.055
PLATE_BRACKET_Z = 0.09
FASTENER_X = 1.32
FASTENER_Y = 1.47
FASTENER_HALF = 0.065
FASTENER_THICK = 0.04
FASTENER_LIFT = 0.04

TEXELS_PER_PIXEL = 8
PLATE_TEXELS = (24, 26)
PLATE_INK = (29, 60, 107)
PLATE_PAPER = (242, 242, 238)
PLATE_BORDER = 1
LINE_ROWS = ((3, 12), (14, 23))
GLYPH_ROWS = 7
GLYPH_COLS = 5
GLYPH_GAP = 1
GLYPHS = {
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "3": ("01110", "10001", "00001", "00110", "00001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "10001", "01110"),
}
PLATE_LINES = ("MDR", "39")


def _plate_pixel(u, v):
    width, height = PLATE_TEXELS
    if min(u, v, width - 1 - u, height - 1 - v) < PLATE_BORDER:
        return (*PLATE_INK, 255)
    for text, (top, bottom) in zip(PLATE_LINES, LINE_ROWS):
        if top <= v <= bottom:
            span = len(text) * GLYPH_COLS + (len(text) - 1) * GLYPH_GAP
            column = u - (width - span) // 2
            if 0 <= column < span:
                index, within = divmod(column, GLYPH_COLS + GLYPH_GAP)
                if within < GLYPH_COLS:
                    row = (v - top) * GLYPH_ROWS // (bottom - top + 1)
                    if GLYPHS[text[index]][row][within] == "1":
                        return (*PLATE_INK, 255)
    return (*PLATE_PAPER, 255)


def register_regions(registry):
    if PLATE_NAME in registry._regions:
        return
    registry.register(atlas.Region(PLATE_NAME, *PLATE_TEXELS, atlas.Material.PLATE, _plate_pixel))


def _smooth_at(points, x):
    i = 0
    while i < len(points) - 2 and x > points[i + 1][0]:
        i += 1
    a, b = points[i], points[i + 1]
    prev, nxt = points[max(0, i - 1)], points[min(len(points) - 1, i + 2)]
    t = max(0, min(1, (x - a[0]) / (b[0] - a[0])))
    ma = (b[1] - prev[1]) / (b[0] - prev[0])
    mb = (nxt[1] - a[1]) / (nxt[0] - a[0])
    return ((2*t**3 - 3*t*t + 1) * a[1] + (t**3 - 2*t*t + t) * (b[0] - a[0]) * ma
            + (-2*t**3 + 3*t*t) * b[1] + (t**3 - t*t) * (b[0] - a[0]) * mb)


def _span_at(poly, xi):
    ys = []
    for (x0, y0), (x1, y1) in zip(poly, (*poly[1:], poly[0])):
        if (x0 - xi) * (x1 - xi) <= 0 and x0 != x1:
            ys.append(y0 + (xi - x0) / (x1 - x0) * (y1 - y0))
    return min(ys), max(ys)


def _rot_x(point, angle):
    x, y, z = point
    c, s = math.cos(angle), math.sin(angle)
    return [x, y*c - z*s, y*s + z*c]


def _side_surface(xi, yi):
    a, b, c = SIDE_EULER_YXZ
    ray = [(xi - SIDE_CENTER[0]) / SIDE_FOCAL, (SIDE_CENTER[1] - yi) / SIDE_FOCAL, -1]
    ca, sa, cb, sb, cc, sc = math.cos(b), math.sin(b), math.cos(a), math.sin(a), math.cos(c), math.sin(c)
    # Euler order YXZ: R = Ry(b) Rx(a) Rz(c)
    rz = [ray[0]*cc - ray[1]*sc, ray[0]*sc + ray[1]*cc, ray[2]]
    rx = [rz[0], rz[1]*cb - rz[2]*sb, rz[1]*sb + rz[2]*cb]
    ry = [rx[0]*ca + rx[2]*sa, rx[1], -rx[0]*sa + rx[2]*ca]
    t = -SIDE_ORIGIN[0] / ry[0]
    return [SIDE_ORIGIN[i] + ry[i] * t for i in range(3)]


def _superellipse(t, n):
    return math.copysign(abs(t) ** (2 / n), t)


def _ring(w, h, z, cy=0.0, n=LAMP_SQUARENESS, points=LAMP_RING_POINTS):
    out = []
    for j in range(points):
        a = 2 * math.pi * j / points
        out.append([w * _superellipse(math.cos(a), n), cy + h * _superellipse(math.sin(a), n), z])
    return out


def _lamp_frame():
    base = _side_surface(*LAMP_PHOTO)
    origin = [base[i] + LAMP_OFFSET[i] for i in range(3)]

    def place(point):
        scaled = _rot_x([c * LAMP_SCALE for c in point], LAMP_TILT)
        return [origin[i] + scaled[i] for i in range(3)]
    return place


def _seat(result):
    faces = atlas.faces("seat_leather")
    rings = []
    for xi in SEAT_RING_PHOTO_X:
        top, bottom = _span_at(SEAT_OUTLINE, xi)
        z, y_top = dims.i2m(xi, top)
        _, y_bottom = dims.i2m(xi, bottom)
        half = _smooth_at(SEAT_WIDTH, xi)
        ring = []
        for j in range(SEAT_ARC_STEPS + 1):
            a = math.pi * j / SEAT_ARC_STEPS
            ring.append([half * math.cos(a), y_bottom + (y_top - y_bottom) * math.sin(a), z])
        ring += [[-half * SEAT_BELLY_WIDTH, y_bottom - SEAT_BELLY_DROP, z],
                 [half * SEAT_BELLY_WIDTH, y_bottom - SEAT_BELLY_DROP, z]]
        rings.append(ring)
    result.add("body", kit.skin(rings, SEAT_SKIN, faces, closed=True, assembly=SEAT_ASSEMBLY))
    for ring in (rings[0], rings[-1]):
        cy = sum(p[1] for p in ring) / len(ring)
        cap = [[p[0] * SEAT_CAP_SCALE, cy + (p[1] - cy) * SEAT_CAP_SCALE, p[2]] for p in ring]
        result.add("body", kit.skin([ring, cap], SEAT_CAP_SKIN, faces, closed=True, assembly=SEAT_ASSEMBLY))


def _lamp(result):
    place = _lamp_frame()
    chrome, red = atlas.faces("chrome"), atlas.faces("lens_tail")
    dark = atlas.faces("rubber")

    def rings(specs, **kw):
        return [[place(p) for p in _ring(*spec, **kw)] for spec in specs]

    def skin(*args, **kw):
        return kit.skin(*args, assembly=LAMP_ASSEMBLY, **kw)

    def tube(*args):
        return kit.tube(*args, assembly=LAMP_ASSEMBLY)

    def add(bone, cubes):
        result.add(bone, cubes, LAMP_ASSEMBLY)

    add("body", skin(rings(LAMP_SHELL), LAMP_SHELL_SKIN, chrome, closed=True))
    add("body", skin(rings(LAMP_BASE), LAMP_BASE_SKIN, chrome, closed=True))
    rim = [place(p) for p in _ring(*LAMP_RIM)]
    add("body", tube([*rim, rim[0]], LAMP_RIM_SIZE * LAMP_SCALE, chrome))
    add("tail_lights", skin(rings(LAMP_LENS), LAMP_LENS_SKIN, red, closed=True))
    add("tail_lights", skin(rings(LAMP_CAP), LAMP_CAP_SKIN, red, closed=True))

    hood = [[place(p) for p in _ring(w, h, z, cy, n, HOOD_RING_POINTS)] for w, h, z, cy, n in HOOD]
    tip = [place([0, HOOD_TIP[3], HOOD_TIP[2]])] * HOOD_RING_POINTS
    add("tail_lights", skin([*hood, tip], HOOD_SKIN, red, closed=True))
    add("body", tube([*hood[1], hood[1][0]], HOOD_RIM_SIZE * LAMP_SCALE, chrome))
    base = [[place([HOOD_BASE_RADIUS * math.cos(a), y, HOOD_BASE_Z + HOOD_BASE_DEPTH * math.sin(a)])
             for a in (2 * math.pi * j / HOOD_RING_POINTS for j in range(HOOD_RING_POINTS))]
            for y in HOOD_BASE_Y]
    add("body", skin(base, HOOD_BASE_SKIN, chrome, closed=True))
    for side in (-1, 1):
        add("body", tube([place([side * x, y, z]) for x, y, z in ARM], ARM_SIZE * LAMP_SCALE, chrome))
        for x, thick, faces, poly in ((SIDE_PLATE_X, SIDE_PLATE_THICK, chrome, SIDE_PLATE),
                                      (SIDE_INNER_X, SIDE_INNER_THICK, dark, SIDE_INNER)):
            lo_z, hi_z = min(p[0] for p in poly), max(p[0] for p in poly)
            lo_y, hi_y = min(p[1] for p in poly), max(p[1] for p in poly)
            corners = [place([side * x, y, z]) for z, y in ((lo_z, lo_y), (hi_z, lo_y), (lo_z, hi_y), (hi_z, hi_y))]
            inside = place([side * (x - 1), (lo_y + hi_y) / 2, (lo_z + hi_z) / 2])
            add("body", kit.quad(*corners, thick * LAMP_SCALE, faces, inside, LAMP_ASSEMBLY))
    saddle = [[place(p) for p in _ring(w, h, z, cy, n=LAMP_SQUARENESS)] for w, h, z, cy in SADDLE]
    add("body", skin(saddle, SADDLE_SKIN, chrome, closed=True))


def _plate(result):
    base = _side_surface(*PLATE_PHOTO)

    def place(x, y, z):
        local = _rot_x([x, y, z], PLATE_TILT)
        return [base[i] + local[i] for i in range(3)]
    half_w, half_h = PLATE_WIDTH / 2, PLATE_HEIGHT / 2
    chrome = atlas.faces("chrome")
    faces = {**chrome, "south": atlas.face(PLATE_NAME)}
    corners = [place(x, y, PLATE_THICK / 2) for y in (-half_h, half_h) for x in (-half_w, half_w)]
    inside = place(0, 0, -PLATE_THICK)
    result.add("body", kit.quad(corners[0], corners[1], corners[2], corners[3], PLATE_THICK, faces, inside))
    bracket = []
    for i in range(PLATE_BRACKET_POINTS):
        x = -PLATE_BRACKET_HALF + 2 * PLATE_BRACKET_HALF * i / (PLATE_BRACKET_POINTS - 1)
        bracket.append(place(x, PLATE_BRACKET_Y + PLATE_BRACKET_SAG * (x / PLATE_BRACKET_HALF) ** 2,
                             PLATE_BRACKET_Z))
    result.add("body", kit.tube(bracket, PLATE_BRACKET_SIZE, chrome, PLATE_ASSEMBLY))
    z = PLATE_THICK / 2 + FASTENER_LIFT
    for x in (-FASTENER_X, FASTENER_X):
        for y in (-FASTENER_Y, FASTENER_Y):
            fx = [place(x + dx, y + dy, z) for dy in (-FASTENER_HALF, FASTENER_HALF)
                  for dx in (-FASTENER_HALF, FASTENER_HALF)]
            result.add("body", kit.quad(fx[0], fx[1], fx[2], fx[3], FASTENER_THICK, chrome, place(x, y, 0)))


def build():
    register_regions(atlas.REGISTRY)
    result = kit.AreaCubes()
    _seat(result)
    _lamp(result)
    _plate(result)
    return result
