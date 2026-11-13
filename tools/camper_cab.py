"""Build the camper cab area."""

import math
from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
FLOOR = kit.FLOOR
FRONT = kit.FRONT
HW = kit.HW
STEPS_16 = kit.STEPS_16
STEPS_8 = kit.STEPS_8
WS_Z = kit.WS_Z
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
    # --- Cab interior (right-hand drive, like the SUV; ADR 0069) ----------------
    DASH_FACE = FRONT + 8  # the dashboard's rear face, toward the seats
    # The dashboard and everything on it are drawn below with the pad top at 28.6 and then lifted
    # by DASH_RISE, so the pad top sits at 35, just under the windshield's lower frame (SILL, 36),
    # and the frame stays in sight (#422). The y values from here to the defroster vent are
    # before the lift.
    DASH_RISE = 6.4
    dash_start = len(body)
    # Padded green dashboard with a rounded rear edge on top; its body down to the floor is added
    # after the lift.
    body.append(box(-HW + 1, 27, WS_Z + 1.5, HW - 1, 28.6, DASH_FACE + 1, "dash_pad"))
    body.append(box(-HW + 1, 26.2, DASH_FACE + 1, HW - 1, 28.2, DASH_FACE + 1.8, "dash_pad", [45, 0, 0], [0, 27.2, DASH_FACE + 1.4]))
    body.append(box(-HW + 1, 25.6, DASH_FACE, HW - 1, 26.2, DASH_FACE + 0.6, "dark_dash"))
    # Instrument console in front of the driver, after the owner's reference photo (#410): the
    # photo's orange wood trim stays green, and its layout is kept, not mirrored, for the
    # right-hand drive (ADR 0069). Plain shapes and tick marks only, no logos or lettering.
    CON_Z = DASH_FACE + 0.2  # the face of the trim board
    PANEL = (10, 19, 22.2, 24.9)  # x0, y0, x1, y1 of the black instrument panel
    PANEL_Z = CON_Z + 0.2
    body.append(box(4.6, 17.4, DASH_FACE, 22.5, 25.4, CON_Z, "dash_pad"))
    body.append(box(PANEL[0] - 0.3, PANEL[1] - 0.3, CON_Z, PANEL[2] + 0.3, PANEL[3] + 0.3, CON_Z + 0.1, "dark_dash"))
    body.append(box(PANEL[0], PANEL[1], CON_Z + 0.1, PANEL[2], PANEL[3], PANEL_Z, "black"))
    # Round speaker grille at the left end of the trim
    body += disc("z", 7.6, 22.4, CON_Z, 1.7, 0.2, "chrome", steps=STEPS_8)
    body += disc("z", 7.6, 22.4, CON_Z + 0.1, 1.35, 0.15, "grille", steps=STEPS_8)
    # Chrome-framed gauge window: two small square gauges, the strip speedometer, two more gauges
    body.append(box(10.5, 22.9, PANEL_Z, 20.1, 24.5, PANEL_Z + 0.15, "chrome"))
    body.append(box(10.7, 23.1, PANEL_Z + 0.15, 19.9, 24.3, PANEL_Z + 0.2, "gauge"))
    for gx in (11.35, 12.45, 17.95, 19.05):
        body.append(box(gx - 0.42, 23.25, PANEL_Z + 0.2, gx + 0.42, 24.15, PANEL_Z + 0.25, "steel"))
        body.append(box(gx - 0.05, 23.35, PANEL_Z + 0.25, gx + 0.05, 23.95, PANEL_Z + 0.3, "black", [0, 0, 30], [gx, 23.35, PANEL_Z + 0.25]))
    for i in range(11):  # strip speedometer ticks
        tx = 13.4 + i * 0.4
        body.append(box(tx - 0.06, 23.8 if i % 2 else 23.65, PANEL_Z + 0.2, tx + 0.06, 24.15, PANEL_Z + 0.25, "needle"))
    body.append(box(13.3, 23.5, PANEL_Z + 0.2, 17.3, 23.6, PANEL_Z + 0.25, "needle"))
    body.append(box(14.95, 23.2, PANEL_Z + 0.25, 15.15, 23.95, PANEL_Z + 0.3, "amber"))
    # Indicator lamps under the window
    for lx, color in ((11.2, "amber"), (12.3, "red"), (17.9, "steel"), (19.0, "amber")):
        body.append(box(lx - 0.4, 22.2, PANEL_Z, lx + 0.4, 22.6, PANEL_Z + 0.12, color))


    def rocker(x, y, lit):
        """A small rocker switch: a chrome frame with a black or white rocker."""
        return [box(x - 0.35, y - 0.45, PANEL_Z, x + 0.35, y + 0.45, PANEL_Z + 0.12, "chrome"),
                box(x - 0.2, y - 0.3, PANEL_Z + 0.12, x + 0.2, y + 0.3, PANEL_Z + 0.32, "needle" if lit else "black")]


    def round_control(x, y, r):
        return disc("z", x, y, PANEL_Z, r, 0.12, "chrome", steps=STEPS_8) + disc("z", x, y, PANEL_Z + 0.12, r - 0.15, 0.1, "gauge", steps=STEPS_8)


    # Lower rows: rocker switches and round controls. The left pair of rockers stands at x 10.6 and
    # 13.4, either side of the steering column's x (11.3 to 12.7), which meets the dash body below
    # the lifted console.
    for rx, ry in ((10.6, 21.1), (13.4, 21.1), (10.6, 19.9), (13.4, 19.9), (16, 20.5), (18.6, 20.5)):
        body += rocker(rx, ry, False)
    for cx in (14.75, 17.25):
        body += round_control(cx, 20.5, 0.75)
    # Ignition switch at the upper right of the panel
    body += disc("z", 21.2, 24.15, PANEL_Z, 0.7, 0.2, "chrome", steps=STEPS_8)
    body += disc("z", 21.2, 24.15, PANEL_Z + 0.2, 0.38, 0.1, "black", steps=STEPS_8)
    # Right column: rocker switches in pairs and two slide levers, left of x 21.2, where the door
    # armrest reaches in; after the lift the armrest (y 22 to 23.4) is below the console.
    for ry in (22.3, 21.2):
        for rx in (19.95, 20.8):
            body += rocker(rx, ry, True)
    for ly, lx in ((20.0, 21.4), (19.45, 20.8)):
        body.append(box(20.3, ly - 0.12, PANEL_Z, 21.95, ly + 0.12, PANEL_Z + 0.05, "grille"))
        body.append(box(lx - 0.18, ly - 0.2, PANEL_Z + 0.05, lx + 0.18, ly + 0.2, PANEL_Z + 0.35, "chrome"))
    # Round air vent lying flat on the dash top before the driver; it rises 0.25 px over the pad.
    # The pad starts at WS_Z + 1.5, and the ring stays clear of that front edge with a small margin.
    VENT_R = 1.4
    VENT_X, VENT_Y, VENT_Z = 12, 28.6, WS_Z + 1.5 + VENT_R + 0.3
    body += disc("y", VENT_X, VENT_Y, VENT_Z, VENT_R, 0.15, "chrome", steps=STEPS_8)
    body += disc("y", VENT_X, VENT_Y, VENT_Z, 1.1, 0.2, "steel", steps=STEPS_8)
    for sz in (-0.6, 0, 0.6):  # the louvres
        body.append(box(VENT_X - 1, VENT_Y, VENT_Z + sz - 0.12, VENT_X + 1, VENT_Y + 0.25, VENT_Z + sz + 0.12, "black"))
    # Knob cluster and switches in the middle
    for kx, ky in ((-3, 24), (-1, 24), (1, 24), (-3, 21.5), (-1, 21.5), (1, 21.5)):
        body += disc("z", kx, ky, DASH_FACE, 0.55, 0.9, "chrome", steps=(0, 45))
    # Radio with two knobs and a dial on the passenger side, glovebox lid beyond it
    body.append(box(-14, 21, DASH_FACE, -6, 23.6, DASH_FACE + 0.6, "chrome"))
    body.append(box(-11.8, 21.6, DASH_FACE + 0.6, -8.2, 23, DASH_FACE + 0.7, "black"))
    for kx in (-13, -7):
        body += disc("z", kx, 22.3, DASH_FACE + 0.6, 0.6, 0.6, "chrome", steps=(0, 45))
    body.append(box(-21.5, 19.5, DASH_FACE, -15, 24.5, DASH_FACE + 0.3, "wood"))
    body.append(box(-18.9, 23.4, DASH_FACE + 0.3, -17.6, 23.9, DASH_FACE + 0.5, "chrome"))
    body += disc("z", 0, 28.7, DASH_FACE - 2.5, 1.2, 0.01, "grille", steps=(0, 45))  # defroster vent
    for c in body[dash_start:]:
        c["origin"][1] = round(c["origin"][1] + DASH_RISE, 3)
        if "pivot" in c:
            c["pivot"] = [c["pivot"][0], round(c["pivot"][1] + DASH_RISE, 3), c["pivot"][2]]
    body.append(box(-HW + 1, FLOOR, FRONT + 1, HW - 1, 27 + DASH_RISE, DASH_FACE, "dash"))
    # Green vinyl engine cover between the seats, rounded on top
    body.append(box(-6, FLOOR, DASH_FACE, 6, 22, DASH_FACE + 13, "dash"))
    body.append(box(-5.2, 22, DASH_FACE + 0.5, 5.2, 23.6, DASH_FACE + 12.5, "dash"))
    body.append(box(-4, 23.6, DASH_FACE + 1, 4, 24.2, DASH_FACE + 12, "dash_pad"))
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
