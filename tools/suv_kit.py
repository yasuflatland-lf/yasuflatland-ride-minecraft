"""Cube kit for the Rubicon-shaped SUV body: boxes, turned boxes, beams, panels and discs.

Parts are written in units of the tyre diameter D (D = 1) in the finished model's frame: x is
right, y is up and the front is -z. `to_construction` converts the finished list to the
generator's construction pixels (forward +z, ADR 0009) and to swatch UVs. Every cube is a
rectangular cube turned by at most the game's Rz(-rz) Ry(ry) Rx(-rx) about its pivot (ADR 0051).
"""

import math
from contextlib import contextmanager

from tool_loader import load_tool

cube_tilt = load_tool("cube_tilt")
suv_cubes = load_tool("suv_cubes")

# Spike colour names and the swatches they map to. Names that are not listed here are swatches.
SWATCH = {"dark": "trim", "glass": "rear_glass", "lamp": "light"}


def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def apply(m, v):
    return [sum(m[i][j] * v[j] for j in range(3)) for i in range(3)]


def rx(a):
    c, s = math.cos(a), math.sin(a)
    return [[1, 0, 0], [0, c, -s], [0, s, c]]


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]]


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]]


def euler(m):
    """The game's `rotation` for a matrix. A pure turn about one axis stays on that axis, even past 90 degrees."""
    eps = 1e-10
    if abs(m[0][0] - 1) < eps and max(abs(m[0][1]), abs(m[0][2]), abs(m[1][0]), abs(m[2][0])) < eps:
        return [-math.degrees(math.atan2(m[2][1], m[1][1])), 0, 0]
    if abs(m[1][1] - 1) < eps and max(abs(m[1][0]), abs(m[1][2]), abs(m[0][1]), abs(m[2][1])) < eps:
        return [0, math.degrees(math.atan2(m[0][2], m[0][0])), 0]
    if abs(m[2][2] - 1) < eps and max(abs(m[2][0]), abs(m[2][1]), abs(m[0][2]), abs(m[1][2])) < eps:
        return [0, 0, -math.degrees(math.atan2(m[1][0], m[0][0]))]
    sin_y = max(-1, min(1, -m[2][0]))
    y = math.asin(sin_y)
    if abs(sin_y) < 1 - 1e-9:
        x = math.atan2(m[2][1], m[2][2])
        z = math.atan2(m[1][0], m[0][0])
    else:
        x = 0
        z = math.atan2(-m[0][1], m[1][1])
    return [-math.degrees(x), math.degrees(y), -math.degrees(z)]


def matrix(rotation):
    return cube_tilt.cube_matrix(rotation)


class Kit:
    """An ordered list of cubes in D units, each tagged with the bone it belongs to."""

    def __init__(self):
        self.cubes = []
        self.current_bone = "body"

    def reset(self):
        self.cubes.clear()
        self.current_bone = "body"

    @contextmanager
    def bone(self, name):
        previous, self.current_bone = self.current_bone, name
        try:
            yield
        finally:
            self.current_bone = previous

    def cube(self, origin, size, color, pivot=None, rotation=(0, 0, 0)):
        assert min(size) > 0, (origin, size)
        cube = {"origin": list(origin), "size": list(size),
                "pivot": list(origin if pivot is None else pivot),
                "rotation": list(rotation), "material": color, "bone": self.current_bone}
        self.cubes.append(cube)
        return cube

    def cube_for(self, m, centre, size, color, bone="body"):
        """A cube centred at `centre` and turned by `m` (None for no turn), made for a bone that is built apart
        from the body list. It is not added to the list."""
        if m is None:
            origin = [centre[i] - size[i] / 2 for i in range(3)]
            return {"origin": origin, "size": list(size), "pivot": list(origin), "rotation": [0, 0, 0],
                    "material": color, "bone": bone}
        before = len(self.cubes)
        cube = self.oriented(centre, size, m, color)
        del self.cubes[before:]
        cube["bone"] = bone
        return cube

    def box(self, x0, x1, y0, y1, z0, z1, color, mirror=False):
        self.cube((x0, y0, z0), (x1 - x0, y1 - y0, z1 - z0), color)
        if mirror:
            self.cube((-x1, y0, z0), (x1 - x0, y1 - y0, z1 - z0), color)

    def oriented(self, center, size, m, color, pivot=None):
        """A cube of `size` centred at `center` and turned by the matrix `m` about `pivot`."""
        pivot = center if pivot is None else pivot
        offset = [center[i] - pivot[i] for i in range(3)]
        local = [sum(m[j][i] * offset[j] for j in range(3)) for i in range(3)]
        return self.cube([pivot[i] + local[i] - size[i] / 2 for i in range(3)], size, color, pivot, euler(m))

    def beam(self, a, b, width, depth, color):
        """A bar from a to b that lies in one principal plane, turned about the one axis it needs."""
        delta = [b[i] - a[i] for i in range(3)]
        length = math.sqrt(sum(v * v for v in delta))
        center = [(a[i] + b[i]) / 2 for i in range(3)]
        if abs(delta[0]) < 1e-9:
            return self.oriented(center, (depth, length + 0.012, width), rx(math.atan2(delta[2], delta[1])), color)
        if abs(delta[1]) < 1e-9:
            return self.oriented(center, (length + 0.012, width, depth), ry(math.atan2(-delta[2], delta[0])), color)
        if abs(delta[2]) < 1e-9:
            return self.oriented(center, (length + 0.012, width, depth), rz(math.atan2(delta[1], delta[0])), color)
        raise ValueError("body beams must lie in one principal plane")

    def face_disc(self, axis, center, radius, a0, a1, color, bars=16):
        """A round face of thin bars through its centre, each turned by 180/bars degrees more than the last."""
        half = radius * math.sin(math.pi / (2 * bars))
        length = 2 * radius * math.cos(math.pi / (2 * bars))
        for k in range(bars):
            a = k * math.pi / bars
            if axis == "x":
                c = ((a0 + a1) / 2, center[1], center[2])
                self.oriented(c, ((a1 - a0), length, half * 2), rx(a), color, pivot=center)
            else:
                c = (center[0], center[1], (a0 + a1) / 2)
                self.oriented(c, (length, half * 2, (a1 - a0)), rz(a), color, pivot=center)

    def rounded_rect(self, axis, constant, u0, u1, v0, v1, r, depth, color, steps=5):
        """A rounded rectangle from stacked panels: u and v are z,y on an x face and x,y on a z face."""
        def rect(a, b, c, d):
            if axis == "x":
                self.box(constant - depth / 2, constant + depth / 2, c, d, a, b, color)
            else:
                self.box(a, b, c, d, constant - depth / 2, constant + depth / 2, color)

        rect(u0, u1, v0 + r, v1 - r)
        rect(u0 + r, u1 - r, v0, v1)
        for k in range(steps):
            y0 = r * k / steps
            y1 = r * (k + 1) / steps
            reach = math.sqrt(max(0, r * r - (r - (y0 + y1) / 2) ** 2))
            rect(u0 + r - reach, u1 - r + reach, v0 + y0, v0 + y1 + 0.0001)
            rect(u0 + r - reach, u1 - r + reach, v1 - y1 - 0.0001, v1 - y0)

    def plane_frame(self, center, width, height, band, depth, mat, color):
        """A rectangular frame of four bars in the local xy plane of the turn `mat`."""
        for offset, size in [((-width / 2 + band / 2, 0, 0), (band, height, depth)),
                             ((width / 2 - band / 2, 0, 0), (band, height, depth)),
                             ((0, -height / 2 + band / 2, 0), (width, band, depth)),
                             ((0, height / 2 - band / 2, 0), (width, band, depth))]:
            off = apply(mat, offset)
            self.oriented(tuple(center[i] + off[i] for i in range(3)), size, mat, color)


kit = Kit()


def to_construction(cubes, scale, z_offset):
    """D-unit cubes of the finished model's frame as construction cubes: scaled to px, turned 180
    degrees about y (the front is +z until export) and given swatch UVs."""
    result = []
    for c in cubes:
        (x, y, z), (w, h, d), (px, py, pz) = c["origin"], c["size"], c["pivot"]
        rx_, ry_, rz_ = c["rotation"]
        cube = {
            "origin": [-(x + w) * scale, y * scale, z_offset - (z + d) * scale],
            "size": [w * scale, h * scale, d * scale],
            "uv": suv_cubes.uv(SWATCH.get(c["material"], c["material"])),
        }
        if any(c["rotation"]):
            cube["pivot"] = [-px * scale, py * scale, z_offset - pz * scale]
            # Platform libm implementations differ in the last bits of Euler angles.
            cube["rotation"] = [round(angle, 10) or 0 for angle in (-rx_, ry_, -rz_)]
        result.append(cube)
    return result
