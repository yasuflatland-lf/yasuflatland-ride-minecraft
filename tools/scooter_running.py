"""Scooter running gear: both wheels, the leading-link front suspension."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")

AREA = "running"

RING_SEGMENTS = 64
HUB_SEGMENTS = 40
CIRCLE_SEGMENTS = 64
CAP_TEXELS_PER_UNIT = 32
HARDWARE_TEXELS_PER_UNIT = 64
REAR_WHEEL_SCALE = 0.96
TYRE_THICKNESS = 0.3
HUB_THICKNESS = 0.035
# Revolved tyre profile (x across the tread, radius from the axle); the bead and the inner side are hidden by the rim disc.
# The smooth crown reaches the 4.3 rolling radius.
TYRE_PROFILE = ((-1.05, 3.4), (-0.7, 4.3), (0.7, 4.3), (1.05, 3.4))
DISC_HALF_WIDTH = 1.15
DISC_HALF_SIZE = 3.74
# Keep whitewall boundary error below 0.04 model units without adding wheel cubes.
DISC_TEXELS = 256
# Photo radii in px of the front wheel: whitewall 2.98..3.71, dark line, bead ring, rim dish, lug circle.
WALL_OUTER, WALL_INNER = 3.71, 2.98
LINE_OUTER, LINE_INNER, BEAD_INNER, DISH_OUTER = 3.0, 2.94, 2.72, 2.68
DISH_RING = 2.12
SCREW_CIRCLE, SCREW_RADIUS, SCREW_COUNT = 2.43, 0.19, 6
SCREW_SLOT_HALF_WIDTH = 0.035
RIM_RING_INNER, RIM_RING_OUTER = 2.24, 2.69
NUT_COUNT, NUT_CIRCLE, NUT_RADIUS, NUT_DEPTH = 4, 0.82, 0.25, 0.32
NUT_PHASE = math.pi / 4
NUT_WASHER_RADIUS, NUT_WASHER_DEPTH = 0.32, 0.065
NUT_FACE_TAPER = 0.73
HARDWARE_SEGMENTS = 16
HARDWARE_SKIN_THICKNESS = 0.012
CENTRE_RADIUS, CENTRE_DEPTH = 0.30, 0.16
CENTRE_RING_RADIUS, CENTRE_RING_DEPTH = 0.43, 0.07
CENTRE_BOSS_RADIUS, CENTRE_BOSS_DEPTH = 0.55, 0.14
BEAD_PROFILE = ((1.16, 2.72), (1.28, 2.82), (1.16, 2.94))
DISH_LIP_PROFILE = ((1.16, 2.68), (1.31, 2.66), (1.31, 2.64))
DISH_PROFILE = ((1.16, 2.21), (1.18, 2.18), (1.18, 1.83), (1.39, 1.63), (1.39, 1.32))
DISH_STEP_WIDTH, DISH_STEP_HIGHLIGHT = 0.15, 0.04
FLANGE_RADIUS, FLANGE_HALF_WIDTH = 2.77, 0.045
HUB_SIDE = 1
HUB_PLATE_X = 1.4
HUB_RING_X = (1.26, 1.39)
HUB_TAPER = 0.81
CAP_RADIUS = {"front": 1.65, "rear": 1.65}
CAP_THICKNESS = 0.06

WALL_COLOR = (230, 228, 221)
WALL_EDGE_COLOR = (199, 198, 191)
LINE_COLOR = (55, 59, 57)
BEAD_COLOR = (219, 220, 212)
DISH_COLOR = (183, 174, 152)
DISH_EDGE_COLOR = (147, 138, 118)
DISH_RING_COLOR = (115, 113, 103)
LUG_COLOR = (102, 106, 101)
CAP_COLOR = (238, 242, 244)
CAP_RIM_COLOR = (170, 183, 190)
NUT_BORDER_COLOR = (87, 96, 98)
WASHER_COLOR = (109, 118, 120)
RIM_PAINT_COLOR = (151, 145, 128)
SCREW_COLOR = (105, 113, 114)
LINK_SHADE_COLOR = (75, 83, 84)

STEER_LEAN = 0.4
SUSPENSION_X = 1.22
LEG_X = (0.98, 1.66)
LEG_PLATE_X, LEG_PLATE_THICKNESS = 1.32, 0.68
LEG_AXIS_Z0, LEG_AXIS_Y0 = -13.05, 5.35
SPRING_Y0, SPRING_Y1 = 4.45, 7.95
SPRING_TURNS, SPRING_SEGMENTS_PER_TURN = 7, 8
SPRING_RADIUS, SPRING_WIRE = 0.31, 0.13
SPRING_TILT_Y, SPRING_TILT_Z = 0.3714, 0.9285
SPRING_ROD = ((4.3, 8.05), 0.18)
LINK_X, LINK_THICKNESS = 2.04, 0.2
LINK_SHADE_X, LINK_SHADE_THICKNESS = 2.155, 0.025
PIN_SIZE, PIN_X = 0.23, (1.2, 2.22)
PIN_HEADS = (2.13, 2.25)
PIN_HEAD_HALF = 0.27
PINS = ((4.3, -11.8), (5.35, -13.05))
FORK_TABS = (((1.5, 8.45), (1.75, 8.6), 8.55, 0.12), ((1.18, 7.98), (1.69, 8.13), 8.02, 0.12))
SEAT_HALF = (0.3, 0.12, 0.4)
SEAT_YS = (4.38, 8.02)

LEG_OUTLINE_OFFSETS = (0.3, -0.38, -0.34, -0.34)
LINK_OUTLINE = ((-11.45, 3.65), (-11.04, 3.75), (-10.99, 4.13), (-13.45, 6.03),
                (-13.85, 6.02), (-14.02, 5.69), (-13.77, 5.32), (-11.82, 3.73))
LINK_SHADE_OUTLINE = ((-11.35, 3.95), (-11.3, 4.13), (-13.65, 5.84), (-13.74, 5.69))


def _axis_z(y):
    return LEG_AXIS_Z0 + STEER_LEAN * (y - LEG_AXIS_Y0)


def _spring_z(y):
    return dims.FRONT_AXLE_Z + STEER_LEAN * (y - dims.AXLE_Y)


def _leg_outline():
    top_a, top_b, mid, low = LEG_OUTLINE_OFFSETS
    return [(_axis_z(8.55) + top_a, 8.55), (_axis_z(8.55) + top_b, 8.55), (_axis_z(7.5) + mid, 7.5),
            (_axis_z(5.2) + low, 5.2), (-13.37, 5.32), (-13.03, 5.03), (-12.67, 5.37),
            (_axis_z(7.3) + 0.32, 7.3)]


def _circle(radius, center=(0, 0)):
    return [(center[0] + radius * math.cos(2 * math.pi * i / CIRCLE_SEGMENTS),
             center[1] + radius * math.sin(2 * math.pi * i / CIRCLE_SEGMENTS)) for i in range(CIRCLE_SEGMENTS)]


def _blend(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def _wheel_pixel(cap_radius):
    def pixel(u, v):
        dy = (u + 0.5) / DISC_TEXELS * 2 * DISC_HALF_SIZE - DISC_HALF_SIZE
        dz = (v + 0.5) / DISC_TEXELS * 2 * DISC_HALF_SIZE - DISC_HALF_SIZE
        r = math.hypot(dy, dz)
        angle = math.atan2(dz, dy)
        if r > WALL_OUTER:
            return atlas.CLEAR
        if r > LINE_OUTER:
            edge = max(0.0, (r - WALL_INNER) / (WALL_OUTER - WALL_INNER) - 0.78) / 0.22
            return (*_blend(WALL_COLOR, WALL_EDGE_COLOR, min(1.0, edge)), 255)
        if r > LINE_INNER:
            return (*LINE_COLOR, 255)
        if r > BEAD_INNER:
            return (*BEAD_COLOR, 255)
        if r > DISH_OUTER:
            return (*LINE_COLOR, 255)
        if r > cap_radius:
            for k in range(SCREW_COUNT):
                a = 2 * math.pi * k / SCREW_COUNT
                radial = dy * math.cos(a) + dz * math.sin(a) - SCREW_CIRCLE
                tangent = -dy * math.sin(a) + dz * math.cos(a)
                if math.hypot(radial, tangent) < SCREW_RADIUS:
                    return (*(LINE_COLOR if abs(tangent) < SCREW_SLOT_HALF_WIDTH else SCREW_COLOR), 255)
            if RIM_RING_INNER < r < RIM_RING_OUTER:
                return (*RIM_PAINT_COLOR, 255)
            if abs(r - DISH_RING) < FLANGE_HALF_WIDTH or abs(r - FLANGE_RADIUS) < FLANGE_HALF_WIDTH:
                return (*DISH_RING_COLOR, 255)
            if cap_radius < r < cap_radius + DISH_STEP_WIDTH:
                return (*DISH_RING_COLOR, 255)
            if cap_radius + DISH_STEP_WIDTH < r < cap_radius + DISH_STEP_WIDTH + DISH_STEP_HIGHLIGHT:
                return (*BEAD_COLOR, 255)
            shade = (r - cap_radius) / (DISH_OUTER - cap_radius)
            shade = shade + 0.15 * math.cos(angle - math.pi * 1.25)
            return (*_blend(DISH_COLOR, DISH_EDGE_COLOR, max(0.0, min(1.0, shade))), 255)
        return (*(CAP_COLOR if r < cap_radius * HUB_TAPER else CAP_RIM_COLOR), 255)
    return pixel


def _outline_region(name, polygon, material, color, density=dims.OUTLINE_TEXELS_PER_PX):
    width, height, pixel = atlas.outline_pixel(polygon, density, lambda u, v: color)
    return atlas.register(name, width, height, material, pixel)


def register_regions(registry=None):
    registry = atlas.REGISTRY if registry is None else registry
    if "running_disc_front" in registry._regions:
        return
    for side, cap in CAP_RADIUS.items():
        atlas.register(f"running_disc_{side}", DISC_TEXELS, DISC_TEXELS, atlas.Material.WHITEWALL,
                       _wheel_pixel(cap))
        _outline_region(f"running_cap_{side}", _circle(cap * HUB_TAPER), atlas.Material.CHROME, CAP_RIM_COLOR, CAP_TEXELS_PER_UNIT)
    hexagon = [(math.cos(i * math.pi / 3), math.sin(i * math.pi / 3)) for i in range(6)]
    # One cutout face per prism avoids crossed chrome bands from overlapping faces.
    for name, radius, border, centre, points in (
            ("running_nut", NUT_RADIUS, NUT_BORDER_COLOR, CAP_COLOR, hexagon),
            ("running_nut_washer", NUT_WASHER_RADIUS, LINE_COLOR, WASHER_COLOR, _circle(1)),
            ("running_centre_nut", CENTRE_RADIUS, LINE_COLOR, LUG_COLOR, hexagon),
            ("running_centre", CENTRE_RING_RADIUS, LINE_COLOR, CAP_RIM_COLOR, _circle(1)),
            ("running_centre_boss", CENTRE_BOSS_RADIUS, WASHER_COLOR, CAP_RIM_COLOR, _circle(1))):
        polygon = [(z * radius, y * radius) for z, y in points]
        def face_color(u, v, r=radius, outer=border, inner=centre, shape=points,
                       half_y=max(y for z, y in polygon)):
            width = math.ceil(2 * r * HARDWARE_TEXELS_PER_UNIT)
            height = math.ceil(2 * half_y * HARDWARE_TEXELS_PER_UNIT)
            z = -r + (u + 0.5) * 2 * r / width
            y = half_y - (v + 0.5) * 2 * half_y / height
            if shape is hexagon:
                distance = max(abs(y), abs(z * math.sqrt(3) / 2 + y / 2),
                               abs(z * math.sqrt(3) / 2 - y / 2)) / (r * math.sqrt(3) / 2)
            else:
                distance = math.hypot(z, y) / r
            return inner if distance < NUT_FACE_TAPER else outer
        width, height, pixel = atlas.outline_pixel(polygon, HARDWARE_TEXELS_PER_UNIT, face_color)
        atlas.register(name, width, height, atlas.Material.CHROME, pixel)
    atlas.register("running_polished", 4, 4, atlas.Material.CHROME, lambda u, v: (*BEAD_COLOR, 255))
    atlas.register("running_dish", 4, 4, atlas.Material.CHROME, lambda u, v: (*CAP_RIM_COLOR, 255))
    _outline_region("running_leg", _leg_outline(), atlas.Material.PAINT, atlas.PAINT_IVORY)
    _outline_region("running_link", list(LINK_OUTLINE), atlas.Material.CHROME, dims.LINK_COLOR)
    _outline_region("running_link_shade", list(LINK_SHADE_OUTLINE), atlas.Material.CHROME, LINK_SHADE_COLOR)


register_regions()


def _wheel(result, side, axle_z, scale):
    cy = dims.AXLE_Y
    name = f"running_wheel_{side}"
    rings = []
    for i in range(RING_SEGMENTS + 1):
        a = 2 * math.pi * i / RING_SEGMENTS
        rings.append([[x, cy + r * scale * math.cos(a), axle_z + r * scale * math.sin(a)]
                      for x, r in TYRE_PROFILE])

    def inside(k, j):
        a = 2 * math.pi * (k + 0.5) / RING_SEGMENTS
        return [0, cy + 2.0 * scale * math.cos(a), axle_z + 2.0 * scale * math.sin(a)]
    bone = f"wheel_{side}"
    result.add(bone, kit.skin(rings, TYRE_THICKNESS, atlas.faces("rubber"), inside,
                              assembly=name, tangent_frame=True))
    half = DISC_HALF_SIZE * scale
    result.add(bone, kit.box((-DISC_HALF_WIDTH, cy - half, axle_z - half),
                             (DISC_HALF_WIDTH, cy + half, axle_z + half),
                             atlas.plate_faces(f"running_disc_{side}")))
    cap = CAP_RADIUS[side] * scale
    for face in (HUB_SIDE, -HUB_SIDE):
        hub = [[[face * x, cy + radius * math.sin(2 * math.pi * i / HUB_SEGMENTS),
                 axle_z + radius * math.cos(2 * math.pi * i / HUB_SEGMENTS)] for i in range(HUB_SEGMENTS + 1)]
               for x, radius in zip(HUB_RING_X, (cap, cap * HUB_TAPER))]
        result.add(bone, kit.skin(hub, HUB_THICKNESS, atlas.faces("running_polished"), [0, cy, axle_z],
                                  assembly=name, tangent_frame=face < 0))
        result.add(bone, kit.profile_plate(_circle(cap * HUB_TAPER, (axle_z, cy)), face * HUB_PLATE_X,
                                           CAP_THICKNESS, f"running_cap_{side}"))

    for face in (-HUB_SIDE,):
        bead = [[[face * x, cy + radius * scale * math.cos(2 * math.pi * i / RING_SEGMENTS),
                  axle_z + radius * scale * math.sin(2 * math.pi * i / RING_SEGMENTS)]
                 for x, radius in BEAD_PROFILE] for i in range(RING_SEGMENTS + 1)]
        result.add(bone, kit.skin(bead, HUB_THICKNESS, atlas.faces("running_polished"), [0, cy, axle_z],
                                  assembly=name, tangent_frame=True))

    # The fixed spring occupies the other face; only the exposed dish gains depth.
    for face in (-HUB_SIDE,):
        # Leave the painted screw flange exposed between the rolled lip and inner dish.
        for profile in (DISH_LIP_PROFILE, DISH_PROFILE):
            dish = [[[face * x, cy + radius * scale * math.cos(2 * math.pi * i / HUB_SEGMENTS),
                      axle_z + radius * scale * math.sin(2 * math.pi * i / HUB_SEGMENTS)]
                     for x, radius in profile] for i in range(HUB_SEGMENTS + 1)]
            result.add(bone, kit.skin(dish, HUB_THICKNESS, atlas.faces("running_dish"), [0, cy, axle_z],
                                      assembly=name, tangent_frame=True))

    def raised_face(y, z, radius, depth, region, base, segments):
        polygon = [(z + radius * scale * math.cos(i * 2 * math.pi / segments),
                    y + radius * scale * math.sin(i * 2 * math.pi / segments)) for i in range(segments)]
        rings = [[(x, py, pz) for pz, py in (*polygon, polygon[0])] for x in (base, base - depth * scale)]
        result.add(bone, kit.skin(rings, HARDWARE_SKIN_THICKNESS, atlas.faces("running_polished"), [0, y, z],
                                  assembly=name, tangent_frame=True))
        result.add(bone, kit.profile_plate(polygon, base - depth * scale, HARDWARE_SKIN_THICKNESS, region), name)

    base = -HUB_PLATE_X - CAP_THICKNESS / 2
    raised_face(cy, axle_z, CENTRE_BOSS_RADIUS, CENTRE_BOSS_DEPTH, "running_centre_boss", base, HARDWARE_SEGMENTS)
    washer_base = base - CENTRE_BOSS_DEPTH * scale - HARDWARE_SKIN_THICKNESS
    raised_face(cy, axle_z, CENTRE_RING_RADIUS, CENTRE_RING_DEPTH, "running_centre", washer_base, HARDWARE_SEGMENTS)
    raised_face(cy, axle_z, CENTRE_RADIUS, CENTRE_DEPTH, "running_centre_nut",
                washer_base - CENTRE_RING_DEPTH * scale - HARDWARE_SKIN_THICKNESS, 6)
    for i in range(NUT_COUNT):
        a = 2 * math.pi * i / NUT_COUNT + NUT_PHASE
        y, z = cy + NUT_CIRCLE * scale * math.cos(a), axle_z + NUT_CIRCLE * scale * math.sin(a)
        raised_face(y, z, NUT_WASHER_RADIUS, NUT_WASHER_DEPTH, "running_nut_washer", base, HARDWARE_SEGMENTS)
        raised_face(y, z, NUT_RADIUS, NUT_DEPTH, "running_nut", base - NUT_WASHER_DEPTH * scale - HARDWARE_SKIN_THICKNESS, 6)


def _fork(result):
    chrome = atlas.faces("chrome")
    leg = _leg_outline()
    result.add("steer", kit.profile_plate(leg, LEG_PLATE_X, LEG_PLATE_THICKNESS, "running_leg"))
    result.add("steer", kit.skin([[(x, y, z) for z, y in leg] for x in LEG_X], 0.045, atlas.faces("paint"),
                                 [LEG_PLATE_X, 6.5, -13.0], closed=True))
    for lo, hi, y, half in FORK_TABS:
        result.add("steer", kit.box((lo[0], lo[1], _axis_z(y) - half), (hi[0], hi[1], _axis_z(y) + half), chrome))
    (rod_lo, rod_hi), rod_size = SPRING_ROD
    result.add("steer", kit.tube([(SUSPENSION_X, rod_lo, _spring_z(rod_lo)), (SUSPENSION_X, rod_hi, _spring_z(rod_hi))],
                                 rod_size, chrome))
    coil = []
    steps = SPRING_TURNS * SPRING_SEGMENTS_PER_TURN
    for i in range(steps + 1):
        u = i / steps
        a = u * SPRING_TURNS * 2 * math.pi
        y = SPRING_Y0 + (SPRING_Y1 - SPRING_Y0) * u
        coil.append((SUSPENSION_X + SPRING_RADIUS * math.cos(a), y - SPRING_RADIUS * SPRING_TILT_Y * math.sin(a),
                     _spring_z(y) + SPRING_RADIUS * SPRING_TILT_Z * math.sin(a)))
    # Two crossed square sections, the second rolled 45 degrees about the segment axis, read as a round wire.
    for roll in (0, 45):
        result.add("steer", kit.tube(coil, SPRING_WIRE, chrome, assembly="running_spring", roll=roll))
    for y in SEAT_YS:
        z = _spring_z(y)
        result.add("steer", kit.box((SUSPENSION_X - SEAT_HALF[0], y - SEAT_HALF[1], z - SEAT_HALF[2]),
                                    (SUSPENSION_X + SEAT_HALF[0], y + SEAT_HALF[1], z + SEAT_HALF[2]), chrome))
    for y, z in PINS:
        result.add("steer", kit.tube([(PIN_X[0], y, z), (PIN_X[1], y, z)], PIN_SIZE, chrome))
        result.add("steer", kit.box((PIN_HEADS[0], y - PIN_HEAD_HALF, z - PIN_HEAD_HALF),
                                    (PIN_HEADS[1], y + PIN_HEAD_HALF, z + PIN_HEAD_HALF), chrome))
    result.add("steer", kit.profile_plate(list(LINK_OUTLINE), LINK_X, LINK_THICKNESS, "running_link", outer="east"))
    result.add("steer", kit.profile_plate(list(LINK_SHADE_OUTLINE), LINK_SHADE_X, LINK_SHADE_THICKNESS,
                                          "running_link_shade", outer="east"))


def _pedal(result):
    z0, y0 = dims.i2m(465, 415)
    z1, _ = dims.i2m(515, 415)
    # The pivot starts on the deck; final x mirroring puts it on the rider's right.
    result.add("body", kit.box((1.4, 5.32, z0 - 0.6), (1.9, y0 + 0.02, z0),
                               atlas.faces("chrome")), "running_pedal")
    result.add("body", kit.box((1.3, y0 - 0.15, z1), (2.0, y0 + 0.25, z0),
                               atlas.faces("chrome")), "running_pedal")
    result.add("body", kit.box((1.25, y0 + 0.2, z1 + 0.2), (2.05, y0 + 0.45, z1 + 1.4),
                               atlas.faces("rubber")), "running_pedal")


def build():
    register_regions()
    result = kit.AreaCubes()
    _wheel(result, "front", dims.FRONT_AXLE_Z, 1.0)
    _wheel(result, "rear", dims.REAR_AXLE_Z, REAR_WHEEL_SCALE)
    _fork(result)
    _pedal(result)
    return result
