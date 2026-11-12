"""SUV hull: chassis, body sides, open wheel arches with overfenders, hood, air intake and cowl.

Lengths are in tyre diameters D (see suv_kit.py). The body widens from the hood front edge to the
windshield base (`widen_body`), as a trapezoid, and keeps its width behind that (ADR 0214).
"""

import math

from tool_loader import load_tool

dims = load_tool("suv_dims")
kit_module = load_tool("suv_kit")
kit = kit_module.kit
box, beam, oriented = kit.box, kit.beam, kit.oriented
rx, ry, rz, mul, matrix = kit_module.rx, kit_module.ry, kit_module.rz, kit_module.mul, kit_module.matrix

REAR_AXLE = 3.02  # z of the rear axle, with the front axle at 0
BODY_HALF = dims.BODY_NOSE_HALF_WIDTH / dims.D  # body at the hood front edge
CABIN_HALF = dims.CABIN_HALF_WIDTH / dims.D  # upper cabin before widening
GROW = dims.BODY_HALF_WIDTH / dims.D - BODY_HALF
FENDER = 0.185  # width of the rear overfender
Z_FRONT = -0.59  # the body starts to widen here
Z_FULL = 0.80  # ... and has its full width from here back, at the windshield base
K_REAR = dims.K_REAR
HOOD_Y = 1.485  # hood top
INTAKE_TOP_Y = 1.545  # top of the hood air intake
# The door openings in the side wall: the doors themselves are built in suv_cab.py.
DOOR_OPENING_Y = (0.91, 1.405)
FRONT_DOOR_SPAN = (0.81, 1.85)
REAR_DOOR_SPAN = (1.91, 2.34)


def kx(z):
    """x scale of the body: 1 at the hood front edge, a trapezoid out to the windshield base, constant behind."""
    t = min(1, max(0, (z - Z_FRONT) / (Z_FULL - Z_FRONT)))
    return 1 + (K_REAR - 1) * t


def chassis():
    """A slim two-rail chassis, axles with their suspension, and the exhaust, with daylight under the floor."""
    box(0.31, 0.395, 0.61, 0.665, -0.53, 3.47, "dark", True)
    box(-0.55, 0.55, 0.705, 0.755, 0.72, 2.38, "dark")
    box(-0.52, 0.52, 0.76, 0.80, 0.70, 3.48, "body")
    for zc in (0, REAR_AXLE):
        box(-0.755, 0.755, 0.455, 0.505, zc - 0.035, zc + 0.035, "dark")  # stops at the tyres' inner faces
        kit.face_disc("z", (0, 0.47, zc), 0.125, zc - 0.09, zc + 0.09, "dark", 8)
        for s in (-1, 1):
            box(s * 0.62 - 0.027, s * 0.62 + 0.027, 0.57, 1.15, zc - 0.027, zc + 0.027, "rim")
            for offset in (-0.28, 0.28):
                beam((s * 0.39, 0.62, zc + offset), (s * 0.74, 0.49, zc + offset), 0.045, 0.045, "dark")
        beam((-0.74, 0.53, zc - 0.09), (0.74, 0.53, zc - 0.09), 0.025, 0.025, "dark")
    box(-0.045, 0.045, 0.56, 0.61, 0.06, 2.98, "dark")
    # Exhaust muffler and four short tips
    kit.rounded_rect("z", 3.43, -0.34, 0.34, 0.40, 0.55, 0.06, 0.18, "rim", 4)
    for x in (-0.49, -0.40, 0.40, 0.49):
        oriented((x, 0.45, 3.58), (0.055, 0.045, 0.27), rx(math.radians(-9)), "dark")
        box(x - 0.023, x + 0.023, 0.424, 0.454, 3.71, 3.715, "tire")


# Side outlines of the two wheel arches as (z, y) points: the open arch under each overfender.
FRONT_ARCH = [(-0.64, 1.11), (-0.54, 1.19), (-0.43, 1.24), (-0.32, 1.255), (0.13, 1.255),
              (0.24, 1.235), (0.33, 1.195), (0.73, 0.77)]
# The rear one ends short of the body's rear edge, just above the bumper corner that receives it (ADR 0225).
REAR_ARCH = [(dims.REAR_ARCH_FRONT_D, 0.78), (2.59, 1.14), (2.70, 1.21), (2.81, 1.235), (3.20, 1.235),
             (3.28, 1.20), (3.35, 1.10), (3.41, 0.94)]


def side_walls():
    """Body side walls with the open arches, the arch liners and the overfenders."""
    b = BODY_HALF
    for s in (-1, 1):
        # The wall between the arches, with an opening behind each of the two doors
        x0, x1 = min(s * 0.57, s * b), max(s * 0.57, s * b)
        box(x0, x1, 0.76, DOOR_OPENING_Y[0], 0.75, 2.38, "body")
        for z0, z1 in ((0.75, FRONT_DOOR_SPAN[0]), (FRONT_DOOR_SPAN[1], REAR_DOOR_SPAN[0]), (2.34, 2.38)):
            box(x0, x1, DOOR_OPENING_Y[0], DOOR_OPENING_Y[1], z0, z1, "body")
        # Tread corners sweep beyond the nominal 0.5 D radius; at z=3.41 they reach y=0.822 D.
        box(x0, x1, 0.84, 1.405, 3.41, 3.56, "body")
    for path in (FRONT_ARCH, REAR_ARCH):
        # The side skin above the arch, in rectangular panels of at most 0.025 D steps
        for (z0, y0), (z1, y1) in zip(path, path[1:]):
            count = max(1, math.ceil(abs(y1 - y0) / 0.025))
            for k in range(count):
                a = z0 + (z1 - z0) * k / count
                b2 = z0 + (z1 - z0) * (k + 1) / count
                bottom = min(y0 + (y1 - y0) * k / count, y0 + (y1 - y0) * (k + 1) / count)
                box(0.56, b, bottom, 1.405, a, b2 + 0.001, "body", True)
        # The inset back wall of the wheel liner; the volume outboard of it stays open
        for (z0, y0), (z1, y1) in zip(path, path[1:]):
            count = max(1, math.ceil(abs(y1 - y0) / 0.035))
            for k in range(count):
                a = z0 + (z1 - z0) * k / count
                b2 = z0 + (z1 - z0) * (k + 1) / count
                top = min(y0 + (y1 - y0) * k / count, y0 + (y1 - y0) * (k + 1) / count) - 0.025
                box(dims.REAR_LINER_INNER_D, 0.54, 0.57, top, a, b2 + 0.001, "dark", True)
        for s in (-1, 1):
            for (z0, y0), (z1, y1) in zip(path, path[1:]):
                n0 = len(kit.cubes)
                if path is FRONT_ARCH:
                    beam((s * 0.96, y0, z0), (s * 0.96, y1, z1), 0.092, 0.37, "body")
                    beam((s * 1.145, y0 - 0.04, z0), (s * 1.145, y1 - 0.04, z1), 0.030, 0.025, "dark")
                else:
                    hw = b * kx((z0 + z1) / 2)
                    beam((s * (hw + FENDER / 2), y0, z0), (s * (hw + FENDER / 2), y1, z1), 0.092, FENDER, "body")
                    beam((s * (hw + FENDER), y0 - 0.04, z0), (s * (hw + FENDER), y1 - 0.04, z1), 0.030, 0.025, "dark")
                for c in kit.cubes[n0:]:
                    c["keep"] = True
                beam((s * 0.57, y0 - 0.01, z0), (s * 0.57, y1 - 0.01, z1), 0.055, 0.055, "dark")


def hood():
    """The engine bay, the hood plane and the shoulders along its sides."""
    box(-0.57, 0.57, 1.02, 1.40, -0.52, 0.72, "dark")
    box(-0.61, 0.61, 1.40, HOOD_Y, -0.59, 0.67, "body")
    for s in (-1, 1):
        box(min(s * 0.61, s * 0.69), max(s * 0.61, s * 0.69), 1.40, 1.476, -0.59, 0.67, "body")
        oriented((s * 0.703, 1.454, 0.04), (0.085, 0.055, 1.27), rz(math.radians(-s * 24)), "body")
        box(min(s * 0.738, s * 0.750), max(s * 0.738, s * 0.750), 1.398, 1.445, -0.59, 0.68, "body")
        box(min(s * 0.739, s * 0.754), max(s * 0.739, s * 0.754), 1.390, 1.400, -0.53, 0.64, "dark")
        box(min(s * 0.715, s * 0.756), max(s * 0.715, s * 0.756), 1.415, 1.49, -0.51, -0.44, "dark")


def intake():
    """The hood air intake: a sloped front face with a lip and an inclined recessed dark opening."""
    top = INTAKE_TOP_Y
    zf0, zf1 = -0.32, -0.22
    box(-0.27, 0.27, top - 0.015, top, zf1, 0.12, "body")

    def slope(t):
        return HOOD_Y + (top - HOOD_Y) * t, zf0 + (zf1 - zf0) * t

    def face(t0, t1, depth, color, recess=0, x=0):
        (y0, z0), (y1, z1) = slope(t0), slope(t1)
        length = math.hypot(y1 - y0, z1 - z0)
        ny, nz = (z1 - z0) / length, -(y1 - y0) / length
        beam((x, y0 - ny * recess, z0 - nz * recess), (x, y1 - ny * recess, z1 - nz * recess), 0.012, depth, color)

    face(0, 0.2, 0.58, "body")
    face(0.8, 1, 0.58, "body")
    for sx in (-1, 1):
        face(0.2, 0.8, 0.06, "body", 0, sx * 0.26)
    face(0.2, 0.8, 0.46, "dark", 0.014)
    for x in (-0.115, 0.115):
        face(0.22, 0.78, 0.012, "body", 0.008, x)
    beam((0, top, 0.12), (0, HOOD_Y, 0.30), 0.012, 0.54, "body")
    for s in (-1, 1):
        beam((s * 0.34, HOOD_Y, -0.01), (s * 0.27, top, -0.01), 0.012, 0.54, "body")
        box(s * 0.25 - 0.04, s * 0.25 + 0.04, top, top + 0.02, -0.01, 0.08, "dark")


def cowl():
    """The cowl where the hood meets the windshield, with its bevel and the vent strip."""
    box(-0.735, 0.735, 1.40, 1.50, 0.64, 0.80, "body")
    oriented((0, 1.515, 0.74), (1.47, 0.045, 0.18), rx(math.radians(-16)), "body")
    box(-0.55, 0.55, 1.542, 1.552, 0.68, 0.76, "dark")
    for x in (-0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5):
        box(x - 0.009, x + 0.009, 1.552, 1.558, 0.68, 0.76, "body")


def _slanted(u0, u1, side, y0, y1, za, zb, mat, pad, core=False):
    """One panel whose outer face follows the trapezoid line exactly (a single turn about y)."""
    A = (u1 * kx(za), za)
    B = (u1 * kx(zb), zb)
    dx, dz = B[0] - A[0], B[1] - A[1]
    length = math.hypot(dx, dz)
    t = (u1 * max(kx(za), kx(zb)) - u0 + pad) if core else (u1 - u0) * kx((za + zb) / 2) + pad
    nx, nz = dz / length, -dx / length
    mx, mz = (A[0] + B[0]) / 2, (A[1] + B[1]) / 2
    cx, cz = mx - nx * t / 2, mz - nz * t / 2
    angle = math.atan2(side * dx, dz)
    oriented((side * cx, (y0 + y1) / 2, cz), (t, y1 - y0, length + 0.012), ry(angle), mat)


def widen_body():
    """Widen the body in x: a constant scale behind the windshield base, slanted panels inside the trapezoid zone."""
    source = list(kit.cubes)
    kit.cubes.clear()
    core_half = 0.45
    for c in source:
        kit.current_bone = c["bone"]
        if c.pop("keep", False) or c["origin"][1] + c["size"][1] <= 0.70:
            kit.cubes.append(c)
            continue
        rot = c["rotation"]
        flat = rot[1] == 0 and rot[2] == 0
        o, sz = c["origin"], c["size"]
        x0, x1 = o[0], o[0] + sz[0]
        y0, y1 = o[1], o[1] + sz[1]
        z0, z1 = o[2], o[2] + sz[2]
        mat = c["material"]

        def put(za, zb, xa, xb, c=c, flat=flat, x0=x0, x1=x1, y0=y0, y1=y1):
            """A copy of c restricted to z in [za, zb] and x in [xa, xb], scaled by the mean k."""
            k = kx((za + zb) / 2)
            d = dict(c)
            d["origin"] = [xa, y0, za]
            d["size"] = [xb - xa, y1 - y0, zb - za]
            d["pivot"] = list(c["pivot"])
            if flat:
                d["origin"][0] = xa * k
                d["size"][0] = (xb - xa) * k
                d["pivot"][0] = c["pivot"][0] * k
            else:
                dx = ((x0 + x1) / 2) * (k - 1)
                d["origin"][0] = x0 + dx
                d["pivot"][0] = c["pivot"][0] + dx
            kit.cubes.append(d)

        if rot[0] == 0 and rot[1] == 0 and rot[2] != 0 and z0 < Z_FULL and z1 > Z_FRONT and abs(x0 + x1) > 0.3:
            # A tilted trim strip gets a yaw so its centre line follows the trapezoid edge.
            cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
            side = 1 if cx > 0 else -1
            slope = abs(cx) * (K_REAR - 1) / (Z_FULL - Z_FRONT)
            m = mul(ry(math.atan2(side * slope, 1)), matrix(rot))
            oriented((cx * kx(cz), cy, cz), sz, m, mat)
            continue
        if not flat or (mat == "dark" and sz[0] > 0.05) or rot[0] != 0 or z1 <= Z_FRONT or z0 >= Z_FULL:
            put(z0, z1, x0, x1)
            continue
        # Split at the ends of the ramp so the straight parts stay single cubes.
        if z0 < Z_FRONT:
            d = dict(c)
            d["size"] = [sz[0], sz[1], Z_FRONT - z0]
            kit.cubes.append(d)
            z0 = Z_FRONT
        tail = None
        if z1 > Z_FULL:
            tail = (Z_FULL, z1)
            z1 = Z_FULL
        if abs(max(abs(x0), abs(x1))) * (kx(z1) - kx(z0)) < 0.012:
            put(z0, z1, x0, x1)
        else:
            lo, hi = max(x0, -core_half), min(x1, core_half)
            if hi > lo and not (x0 >= core_half or x1 <= -core_half):
                d = dict(c)
                d["origin"] = [lo, y0, z0]
                d["size"] = [hi - lo, y1 - y0, z1 - z0]
                kit.cubes.append(d)
            if x1 > core_half:
                u0 = max(x0, core_half)
                _slanted(u0, x1, 1, y0, y1, z0, z1, mat, 0.02, u0 == core_half)
            if x0 < -core_half:
                u0 = max(-x1, core_half)
                _slanted(u0, -x0, -1, y0, y1, z0, z1, mat, 0.02, u0 == core_half)
        if tail:
            put(tail[0], tail[1], x0, x1)
