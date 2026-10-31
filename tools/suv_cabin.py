"""SUV seating, steering assembly, floor console and pedals."""

import math

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box


ASSEMBLIES = {"arc": 30}
HUB_RADIUS = 1.0
HUB_SEGMENTS = 16
HUB_FRONT = WHEEL_Z - 0.65
HUB_BACK = WHEEL_Z - 0.35


def pleated_seat(x0, x1, z_back):
    """A black leather bucket seat: pleats running front to back on the cushion and stacked
    across the backrest, between raised side bolsters. The gaps between the pleats show the
    darker base, so the pleats read as stripes like a tuck-and-roll seat."""
    z_front = z_back + 9
    bolster = 1.5
    rib, gap = 0.7, 0.35
    inner0, inner1 = x0 + bolster, x1 - bolster
    count = int((inner1 - inner0 + gap) // (rib + gap))
    margin = (inner1 - inner0 - (count * rib + (count - 1) * gap)) / 2
    cubes = [
        # Cushion and backrest
        box(x0, 7, z_back + 1, x1, 10, z_front, "seat"),
        box(x0, 10, z_back, x1, 19, z_back + 1, "seat"),
        # Side bolsters of the cushion and the backrest
        box(x0, 10, z_back + 1, inner0, 10.8, z_front, "seat"),
        box(inner1, 10, z_back + 1, x1, 10.8, z_front, "seat"),
        box(x0, 10.8, z_back + 1, inner0, 19, z_back + 1.8, "seat"),
        box(inner1, 10.8, z_back + 1, x1, 19, z_back + 1.8, "seat"),
        # Rolled front edge of the cushion
        box(x0, 9.4, z_front, x1, 10.4, z_front + 0.4, "seat_pleat"),
    ]
    for i in range(count):
        a = inner0 + margin + i * (rib + gap)
        cubes.append(box(a, 10, z_back + 1.5, a + rib, 10.4, z_front - 0.5, "seat_pleat"))
    for i in range(7):
        y = 11.2 + i * (rib + gap)
        cubes.append(box(inner0, y, z_back + 1, inner1, y + rib, z_back + 1.4, "seat_pleat"))
    return cubes


def tilted_spin(spin):
    """Euler angles for "turn by spin around z, then tilt around x".

    A cube applies its x rotation first and z last, so a tilted, spun block needs all three angles.
    """
    st, ct = math.sin(math.radians(WHEEL_TILT)), math.cos(math.radians(WHEEL_TILT))
    sz, cz = math.sin(math.radians(spin)), math.cos(math.radians(spin))
    # M = Rx(tilt) @ Rz(spin), decomposed as Rz(c) @ Ry(b) @ Rx(a)
    m00, m10 = cz, ct * sz
    m20, m21, m22 = st * sz, st * cz, ct
    b = math.asin(-m20)
    a = math.atan2(m21, m22)
    c = math.atan2(m10, m00)
    return [round(math.degrees(v), 3) for v in (a, b, c)]


def steering_part(x0, y0, x1, y1, color, z0=WHEEL_Z - 0.5, z1=WHEEL_Z + 0.3, spin=0):
    cube = box(x0, y0, z0, x1, y1, z1, color)
    cube["pivot"] = WHEEL_PIVOT
    cube["rotation"] = tilted_spin(spin)
    return cube


def small(cx, cy, w, h, color, z0=WHEEL_Z - 0.5, z1=WHEEL_Z + 0.3):
    return steering_part(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, color, z0, z1)


# Floor shifters between the front seats, like an old utility 4x4: a tall shift lever in an
# accordion rubber boot, and two shorter transfer levers behind it. Each lever leans back toward
# the seats (a positive x rotation tips +y toward -z in game, see WINDSHIELD_LEAN) and ends in a ball
# knob.
def floor_lever(x, z, height, knob, lean=15):
    pivot = [x, FLOOR_Y, z]

    def leaned(cube):
        cube["pivot"] = pivot
        cube["rotation"] = [lean, 0, 0]
        return cube

    top = FLOOR_Y + height
    return [
        leaned(box(x - 0.2, FLOOR_Y, z - 0.2, x + 0.2, top, z + 0.2, "trim")),  # rod
        leaned(box(x - knob, top - knob * 0.8, z - knob * 0.8, x + knob, top + knob * 0.8, z + knob * 0.8, "grille")),
        leaned(box(x - knob * 0.8, top - knob, z - knob * 0.8, x + knob * 0.8, top + knob, z + knob * 0.8, "grille")),
        leaned(box(x - knob * 0.8, top - knob * 0.8, z - knob, x + knob * 0.8, top + knob * 0.8, z + knob, "grille")),
    ]


# Like the tires, the rim is a ring of thin blocks turned around the column.
def steering_cubes():
    cx, cy = WHEEL_CENTER
    RIM_SEGMENTS, RIM_WIDTH = 16, 0.7
    rim_half_chord = round(WHEEL_RADIUS * math.tan(math.radians(180 / RIM_SEGMENTS)) + 0.05, 3)
    leather = suv_cubes.region_faces(
        "gauges", "leather", {face: (0, 0, 8, 8) for face in ("north", "south", "east", "west", "up", "down")}
    )
    steering = [
        steering_part(
            cx - rim_half_chord, cy + WHEEL_RADIUS - RIM_WIDTH / 2, cx + rim_half_chord, cy + WHEEL_RADIUS + RIM_WIDTH / 2,
            leather, spin=i * 360 / RIM_SEGMENTS,
        )
        for i in range(RIM_SEGMENTS)
    ]
    hub_uv = suv_cubes.region_faces(
        "gauges", "hub", {face: (0, 0, 1, 1) for face in leather}
    )
    hub = suv_cubes.disc("z", WHEEL_PIVOT, HUB_RADIUS / math.sqrt(2), HUB_FRONT, HUB_BACK,
                         [i * 90 / HUB_SEGMENTS for i in range(HUB_SEGMENTS)], hub_uv)
    for cube in hub:
        cube["rotation"] = tilted_spin(cube["rotation"][2])
    # One inset highlight face avoids competing UVs on the disc's coplanar squares.
    hub[0]["origin"][2] -= 0.01
    hub[0]["size"][2] += 0.01
    hub[0]["uv"]["north"] = suv_cubes.region_faces(
        "gauges", "hub", {"north": (0, 0, 16, 16)}
    )["north"]
    steering += hub
    steering += [
        small(cx - 1.2, cy, 1.2, 0.5, "spoke"),  # spoke (left)
        small(cx + 1.2, cy, 1.2, 0.5, "spoke"),  # spoke (right)
        small(cx, cy - 1.2, 0.5, 1.2, "spoke"),  # spoke (bottom)
        small(cx, cy - 0.15, 0.8, 0.8, "grille", WHEEL_Z + 0.4, COLUMN_END_Z),  # column
    ]
    return steering


def floor_console_cubes():
    result = []
    SHIFT_X, SHIFT_Z = 0, 8.5
    SHIFT_LEAN = 22  # Keep the tall rod and knob behind the dashboard's lower edge.
    TUNNEL_TOP_Y = FLOOR_Y + 0.6
    result.append(box(-1.8, FLOOR_Y, 4, 1.8, TUNNEL_TOP_Y, 11, "trim"))  # transmission tunnel
    BOOT_RINGS = ((1.0, 0.5), (0.75, 0.4), (0.85, 0.4), (0.6, 0.4), (0.7, 0.35), (0.45, 0.4))  # (half width, height)
    for i, (half, height) in enumerate(BOOT_RINGS):
        y = TUNNEL_TOP_Y + sum(h for _, h in BOOT_RINGS[:i])
        result.append(box(SHIFT_X - half, y, SHIFT_Z - half, SHIFT_X + half, y + height, SHIFT_Z + half, "tire"))  # boot
    result += floor_lever(SHIFT_X, SHIFT_Z, 7.2, 0.55, SHIFT_LEAN)
    for x in (-1.1, 1.1):
        result.append(box(x - 0.4, TUNNEL_TOP_Y, 6.1, x + 0.4, TUNNEL_TOP_Y + 0.5, 6.9, "tire"))  # boot
        result += floor_lever(x, 6.5, 4.6, 0.4)
    return result


def pedal_cubes():
    result = []
    # Pedals in the driver's footwell (+x side): clutch and brake are square rubber pads with ribs on
    # arms hanging from under the dashboard, and the accelerator is a long, narrow pad hinged at the
    # floor, its rear end raised (a negative x rotation lifts -z toward +y in game, see WINDSHIELD_LEAN).
    for px in (4.4, 6.6):  # clutch, brake
        result += [
            box(px - 0.15, 9.4, 11.7, px + 0.15, 13, 12, "trim"),  # arm
            box(px - 0.9, 8.2, 11.4, px + 0.9, 9.6, 11.7, "grille"),  # pad
        ]
        result += [box(px - 0.8, y, 11.3, px + 0.8, y + 0.2, 11.4, "trim") for y in (8.45, 8.8, 9.15)]  # ribs
    accelerator = box(8.3, FLOOR_Y, 10.2, 9.3, FLOOR_Y + 0.3, 12.8, "grille")
    accelerator["pivot"] = [8.8, FLOOR_Y, 12.8]
    accelerator["rotation"] = [-25, 0, 0]
    result.append(accelerator)
    return result
