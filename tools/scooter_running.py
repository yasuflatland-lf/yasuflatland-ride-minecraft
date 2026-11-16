"""Scooter running gear: both wheels, the leading-link front suspension and the centre stand."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")

AREA = "running"

OUTLINE_TEXELS_PER_PX = 8
RING_SEGMENTS = 32
HUB_SEGMENTS = 12
CIRCLE_SEGMENTS = 24
REAR_WHEEL_SCALE = 0.96
TYRE_THICKNESS = 0.3
HUB_THICKNESS = 0.035
# Revolved tyre profile (x across the tread, radius from the axle); the bead is hidden by the rim disc.
TYRE_PROFILE = ((-1.05, 3.0), (-1.05, 3.4), (-1.0, 3.95), (-0.7, 4.25),
                (0.7, 4.25), (1.0, 3.95), (1.05, 3.4), (1.05, 3.0))
DISC_HALF_WIDTH = 1.15
DISC_HALF_SIZE = 3.74
DISC_TEXELS = 60
# Photo radii in px of the front wheel: whitewall 2.98..3.71, dark line, bead ring, rim dish, lug circle.
WALL_OUTER, WALL_INNER = 3.71, 2.98
LINE_OUTER, LINE_INNER, BEAD_INNER, DISH_OUTER = 3.0, 2.94, 2.89, 2.85
DISH_RING, LUG_CIRCLE, LUG_RADIUS, LUG_COUNT = 2.63, 1.69, 0.3, 5
HUB_SIDE = 1
HUB_PLATE_X = 1.4
HUB_RING_X = (1.17, 1.39)
HUB_TAPER = 0.81
CAP_RADIUS = {"front": 1.43, "rear": 1.3}
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
LINK_COLOR = (214, 220, 223)
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

STAND_PIXEL = (400, 462)
STAND_FLOOR_Y = 5.29
STAND_LUG_X = 1.6
STAND_LUG_THICKNESS = 0.18
STAND_BRACKET = (1.92, 5.17, 5.34, (-0.83, 0.43))
STAND_FOOT = (3.8, 0.7, -0.6)
STAND_PAD_HALF = (0.23, 0.9, (-0.95, -0.25))
STAND_LEG_SIZE, STAND_BAR_SIZE, STAND_PIVOT_SIZE = 0.32, 0.3, 0.28
STAND_PIVOT_HALF_LENGTH = 0.24
STAND_PIVOT_BACK = 0.2

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


def _stand_lug(pivot_z, pivot_y):
    return [(pivot_z - 0.8, STAND_FLOOR_Y), (pivot_z + 0.4, STAND_FLOOR_Y), (pivot_z + 0.25, pivot_y - 0.13),
            (pivot_z - 0.2, pivot_y - 0.3), (pivot_z - 0.65, pivot_y - 0.13)]


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
            for k in range(LUG_COUNT):
                a = 2 * math.pi * k / LUG_COUNT
                if math.hypot(dy - LUG_CIRCLE * math.cos(a), dz - LUG_CIRCLE * math.sin(a)) < LUG_RADIUS:
                    return (*LUG_COLOR, 255)
            if abs(r - DISH_RING) < 0.05:
                return (*DISH_RING_COLOR, 255)
            shade = (r - cap_radius) / (DISH_OUTER - cap_radius)
            shade = shade + 0.15 * math.cos(angle - math.pi * 1.25)
            return (*_blend(DISH_COLOR, DISH_EDGE_COLOR, max(0.0, min(1.0, shade))), 255)
        return (*(CAP_COLOR if r < cap_radius * HUB_TAPER else CAP_RIM_COLOR), 255)
    return pixel


def _outline_region(name, polygon, material, color):
    width, height, pixel = atlas.outline_pixel(polygon, OUTLINE_TEXELS_PER_PX, lambda u, v: color)
    return atlas.register(name, width, height, material, pixel)


def register_regions(registry=None):
    registry = atlas.REGISTRY if registry is None else registry
    if "running_disc_front" in registry._regions:
        return
    for side, cap in CAP_RADIUS.items():
        atlas.register(f"running_disc_{side}", DISC_TEXELS, DISC_TEXELS, atlas.Material.WHITEWALL,
                       _wheel_pixel(cap))
        _outline_region(f"running_cap_{side}", _circle(cap * HUB_TAPER), atlas.Material.CHROME, CAP_COLOR)
    _outline_region("running_leg", _leg_outline(), atlas.Material.PAINT, atlas.PAINT_IVORY)
    _outline_region("running_link", list(LINK_OUTLINE), atlas.Material.CHROME, LINK_COLOR)
    _outline_region("running_link_shade", list(LINK_SHADE_OUTLINE), atlas.Material.CHROME, LINK_SHADE_COLOR)
    pivot_z, pivot_y = dims.i2m(*STAND_PIXEL)
    _outline_region("running_stand_lug", _stand_lug(pivot_z, pivot_y), atlas.Material.CHROME, LINK_COLOR)


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
    result.add(bone, kit.skin(rings, TYRE_THICKNESS, atlas.faces("rubber"), inside, assembly=name))
    half = DISC_HALF_SIZE * scale
    result.add(bone, kit.box((-DISC_HALF_WIDTH, cy - half, axle_z - half),
                             (DISC_HALF_WIDTH, cy + half, axle_z + half),
                             atlas.plate_faces(f"running_disc_{side}")))
    cap = CAP_RADIUS[side] * scale
    hub = [[[HUB_SIDE * x, cy + radius * math.sin(2 * math.pi * i / HUB_SEGMENTS),
             axle_z + radius * math.cos(2 * math.pi * i / HUB_SEGMENTS)] for i in range(HUB_SEGMENTS + 1)]
           for x, radius in zip(HUB_RING_X, (cap, cap * HUB_TAPER))]
    result.add(bone, kit.skin(hub, HUB_THICKNESS, atlas.faces("chrome"), [0, cy, axle_z], assembly=name))
    result.add(bone, kit.profile_plate(_circle(cap * HUB_TAPER, (axle_z, cy)), HUB_SIDE * HUB_PLATE_X,
                                       CAP_THICKNESS, f"running_cap_{side}"))


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
    result.add("steer", kit.profile_plate(list(LINK_OUTLINE), LINK_X, LINK_THICKNESS, "running_link"))
    result.add("steer", kit.profile_plate(list(LINK_SHADE_OUTLINE), LINK_SHADE_X, LINK_SHADE_THICKNESS,
                                          "running_link_shade"))


def _stand(result):
    chrome = atlas.faces("chrome")
    pivot_z, pivot_y = dims.i2m(*STAND_PIXEL)
    bar_z = pivot_z - STAND_PIVOT_BACK
    half_x, floor_lo, floor_hi, (back, front) = STAND_BRACKET
    result.add("stand", kit.box((-half_x, floor_lo, pivot_z + back), (half_x, floor_hi, pivot_z + front), chrome))
    lug = _stand_lug(pivot_z, pivot_y)
    foot_x, foot_y, foot_z = STAND_FOOT
    pad_x, pad_height, (pad_back, pad_front) = STAND_PAD_HALF
    for sign in (-1, 1):
        x = sign * STAND_LUG_X
        result.add("stand", kit.profile_plate(lug, x, STAND_LUG_THICKNESS, "running_stand_lug"))
        result.add("stand", kit.tube([(x - STAND_PIVOT_HALF_LENGTH, pivot_y, bar_z),
                                      (x + STAND_PIVOT_HALF_LENGTH, pivot_y, bar_z)], STAND_PIVOT_SIZE, chrome))
        result.add("stand", kit.tube([(x, pivot_y, bar_z), (sign * foot_x, foot_y, foot_z)], STAND_LEG_SIZE,
                                     chrome, assembly="running_stand"))
        result.add("stand", kit.box((sign * foot_x - pad_x, 0, pad_back), (sign * foot_x + pad_x, pad_height, pad_front),
                                    atlas.faces("rubber")))
    result.add("stand", kit.tube([(-STAND_LUG_X, pivot_y, bar_z), (STAND_LUG_X, pivot_y, bar_z)], STAND_BAR_SIZE,
                                 chrome))


def build():
    register_regions()
    result = kit.AreaCubes()
    _wheel(result, "front", dims.FRONT_AXLE_Z, 1.0)
    _wheel(result, "rear", dims.REAR_AXLE_Z, REAR_WHEEL_SCALE)
    _fork(result)
    _stand(result)
    return result
