"""Build the camper cab area."""

import math
from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
FLOOR = kit.FLOOR
FRONT = kit.FRONT
HW = kit.HW
STEPS_16 = kit.STEPS_16
box = kit.box
disc = kit.disc

AREA = "cab"


# The front cushions sit 0.4 blocks above where they started, with minecraft:rideable's
# front seats at 1.5, so a seated player's eyes clear the windshield's lower frame (36).
# Raised and laid back with the front seats so its lower rim clears the cushion and its
# upper rim stays under the driver's line of sight to the windshield's lower frame.
STEERING_PIVOT, STEERING_LEAN = [12, 33, FRONT + 15], 65


def build() -> AreaCubes:
    body = []
    DASH_FACE = FRONT + 8
    body.extend(load_tool("camper_dash").build_dash(kit.REGISTRY)["body"])
    # Pedals in the driver's footwell
    body.append(box(12.5, FLOOR + 1, DASH_FACE + 0.5, 15, FLOOR + 3.5, DASH_FACE + 1, "black", [-25, 0, 0], [0, FLOOR + 1, DASH_FACE + 1]))
    body.append(box(8.5, FLOOR + 0.5, DASH_FACE + 1, 10.5, FLOOR + 5, DASH_FACE + 1.4, "black", [-30, 0, 0], [0, FLOOR + 0.5, DASH_FACE + 1.2]))
    # Ivory door trim with an armrest on both cab walls
    for sx in (1, -1):
        x_in = sx * (HW - 1.2)
        body.append(box(x_in, FLOOR, -53, x_in - sx * 0.3, 27, -41, "ivory"))
        body.append(box(x_in, 22, -51, x_in - sx * 1.6, 23.4, -43, "ivory"))




    # Steering wheel, as on the reference (#410): a thin ivory rim of 32 segments with finger grips
    # on its inner edge, one straight spoke bar through the hub held level as when driving straight
    # ahead (the photo's wheel is turned), a chrome half horn ring below it, and a plain round hub.
    # Built facing the driver (+z) in its own bone, which lays it back like a bus wheel.
    RIM_R = 7.2


    def arc_z(r, t, color, a0, a1, n):
        out = []
        span = math.radians(a1 - a0)
        seg = abs(span) * r / n * 1.1
        for i in range(n):
            a = math.radians(a0) + span * (i + 0.5) / n
            x, y = r * math.cos(a), r * math.sin(a)
            out.append(box(x - seg / 2, y - t / 2, -t / 2, x + seg / 2, y + t / 2, t / 2, color, [0, 0, math.degrees(a) + 90], [x, y, 0]))
        return out


    steering = arc_z(RIM_R, 0.9, "ivory", 0, 360, 32)
    for i in range(36):  # finger grips, left out where the spokes meet the rim
        a = i * 10 + 5
        if min(a % 180, 180 - a % 180) < 15:
            continue
        rad = math.radians(a)
        gx, gy = (RIM_R - 0.55) * math.cos(rad), (RIM_R - 0.55) * math.sin(rad)
        steering.append(box(gx - 0.18, gy - 0.2, -0.3, gx + 0.18, gy + 0.2, 0.3, "ivory", [0, 0, a + 90], [gx, gy, 0]))
    steering.append(box(-RIM_R + 0.3, -0.6, -0.35, RIM_R - 0.3, 0.6, 0.35, "ivory"))  # the spoke bar
    steering.append(box(-RIM_R + 0.8, -0.15, 0.35, RIM_R - 0.8, 0.15, 0.45, "chrome"))
    steering += arc_z(RIM_R - 2.2, 0.35, "chrome", 180, 360, 16)  # the half horn ring
    steering += disc("z", 0, 0, -0.6, 2.2, 1.2, "hub")
    steering += disc("z", 0, 0, 0.6, 1.6, 0.4, "chrome", steps=STEPS_16)
    steering += disc("z", 0, 0, 1.0, 1.25, 0.3, "black", steps=STEPS_16)
    steering.append(box(-0.7, -0.7, -16, 0.7, 0.7, -0.6, "dark_dash"))  # column down to the dashboard
    return AreaCubes({'body': body, 'steering': steering})
