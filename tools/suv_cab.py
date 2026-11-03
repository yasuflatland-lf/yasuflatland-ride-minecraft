"""SUV cabin shell: hardtop with ribs, pillars, window frames, windshield, door seams, vents and mirrors.

Lengths are in tyre diameters D (see suv_kit.py).
"""

import math

from tool_loader import load_tool

kit_module = load_tool("suv_kit")
hull = load_tool("suv_hull")
dims = load_tool("suv_dims")
kit = kit_module.kit
box, beam, oriented = kit.box, kit.beam, kit.oriented
rx, rz, apply = kit_module.rx, kit_module.rz, kit_module.apply
CAB = hull.CABIN_HALF

FRONT_SIDE_WINDOW = (0.90, 1.855)  # z of the front door window
REAR_SIDE_WINDOW = (1.965, 2.63)  # z of the rear door window
CARGO_SIDE_WINDOW = (2.77, 3.445)  # z of the fixed cargo window
SIDE_WINDOW_Y = (1.49, 1.97)
SIDE_WINDOW_X = 0.706
SIDE_FRAME_WIDTH = 0.018


def door_name(s, rear):
    """The door bone on side s (+1 is the model's left, x > 0) for the front or the rear door."""
    return f"door_{'r' if rear else 'f'}{'l' if s > 0 else 'r'}"


def side_frame(s, z0, z1, y0, y1, width):
    x = s * SIDE_WINDOW_X
    for a, b in [((x, y0, z0), (x, y1, z0)), ((x, y0, z1), (x, y1, z1)),
                 ((x, y0, z0), (x, y0, z1)), ((x, y1, z0), (x, y1, z1))]:
        beam(a, b, width, 0.010, "dark")


FRONT_SIDE_WINDOW_RAKE = 0.34  # how far the front window's front edge moves back from bottom to top


def side_window(s, z0, z1, y0, y1, rake=0):
    """A side window: a thin dark frame, and for the front window an outline that follows the A-pillar."""
    x = s * SIDE_WINDOW_X
    if not rake:
        side_frame(s, z0, z1, y0, y1, SIDE_FRAME_WIDTH)
    else:
        for a, b in [((x, y0, z0), (x, y1, z0 + rake)), ((x, y1, z0 + rake), (x, y1, z1)),
                     ((x, y0, z0), (x, y0, z1)), ((x, y0, z1), (x, y1, z1))]:
            beam(a, b, 0.025, 0.012, "dark")


def upper_cabin():
    """The hollow upper shell, the hardtop with its rounded shoulders, caps and ribs, and the pillars."""
    box(-CAB, CAB, 1.38, 1.46, 0.79, 3.52, "body")
    box(-CAB, CAB, dims.ROOF_Y / dims.D, dims.HARDTOP_TOP_Y / dims.D,
        (dims.FRONT_AXLE_Z - dims.HARDTOP_FRONT_Z) / dims.D,
        (dims.FRONT_AXLE_Z - dims.HARDTOP_REAR_Z) / dims.D, "hardtop")
    for s in (-1, 1):
        oriented((s * 0.686, 2.029, 2.29), (0.065, 0.050, 2.32), rz(math.radians(s * 30)), "hardtop")
        box(min(s * 0.685, s * 0.707), max(s * 0.685, s * 0.707), 1.97, 2.035, 1.17, 3.45, "hardtop")
    oriented((0, 2.033, 1.159), (1.36, 0.05, 0.07), rx(math.radians(-27)), "hardtop")
    oriented((0, 2.033, 3.46), (1.36, 0.05, 0.07), rx(math.radians(27)), "hardtop")
    box(-0.688, 0.688, 2.060, 2.063, 1.90, 1.909, "grille")
    for x in (-0.50, -0.30, -0.10, 0.10, 0.30, 0.50):
        for a, b in ((1.24, 1.87), (1.95, 3.39)):
            box(x - 0.011, x + 0.011, 2.060, 2.064, a, b, "hardtop_rib")


def pillars_and_side_windows():
    """Side pillars, the raked A-pillar and the frames of the three side windows on each side."""
    for s in (-1, 1):
        x = s * CAB
        box(min(s * 0.674, s * 0.699), max(s * 0.674, s * 0.699), 1.44, 1.49, 0.90, 3.46, "body")
        box(min(s * 0.674, s * 0.699), max(s * 0.674, s * 0.699), 1.97, 2.026, 1.20, 3.46, "hardtop")
        for k in range(20):
            ya = 1.445 + k * 0.58 / 20
            yb = ya + 0.58 / 20
            za = 0.77 + (ya - 1.445) * 0.4 / 0.58
            zb = 0.90 + (ya - 1.445) * 0.34 / 0.525
            box(min(s * 0.674, s * 0.699), max(s * 0.674, s * 0.699), ya, yb + 0.0001, za, max(za + 0.025, zb), "body")
        beam((x, 1.445, 0.77), (x, 2.025, 1.17), 0.075, 0.045, "body")
        for a, b in ((1.86, 1.94), (2.65, 2.74)):
            box(x - 0.025, x + 0.025, 1.44, 2.025, a, b, "body")
        beam((x, 1.44, 3.54), (x, 2.024, 3.46), 0.08, 0.045, "body")
        with kit.bone(door_name(s, rear=False)):
            side_window(s, *FRONT_SIDE_WINDOW, *SIDE_WINDOW_Y, rake=FRONT_SIDE_WINDOW_RAKE)
        with kit.bone(door_name(s, rear=True)):
            side_window(s, *REAR_SIDE_WINDOW, *SIDE_WINDOW_Y)
        side_window(s, *CARGO_SIDE_WINDOW, *SIDE_WINDOW_Y)
        xx = s * 0.721
        box(xx - 0.004, xx + 0.004, 1.51, 1.95, 2.44, 2.453, "dark")


WINDSHIELD_BOTTOM = (0, 1.47, 0.77)
WINDSHIELD_TOP = (0, 2.025, 1.17)
WINDSHIELD_WIDTH = 1.34
WINDSHIELD_BAND = 0.035


def windshield_turn():
    """The matrix that leans a vertical plate back to the windshield and the plate's centre and height."""
    wb, wt = WINDSHIELD_BOTTOM, WINDSHIELD_TOP
    dy, dz = wt[1] - wb[1], wt[2] - wb[2]
    centre = (0, (wb[1] + wt[1]) / 2, (wb[2] + wt[2]) / 2)
    return rx(math.atan2(dz, dy)), centre, math.hypot(dy, dz)


def windshield_frame():
    """The windshield frame, a plane leaning back by about 36 degrees."""
    mat, centre, height = windshield_turn()
    kit.plane_frame(centre, WINDSHIELD_WIDTH, height, WINDSHIELD_BAND, 0.018, mat, "dark")


REAR_WINDOW_CENTRE = (0, 1.735, 3.506)
REAR_WINDOW_WIDTH, REAR_WINDOW_HEIGHT = 1.29, 0.56


def rear_window_turn():
    return rx(math.atan2(-0.08, 0.55))


def rear_window_frame():
    kit.plane_frame(REAR_WINDOW_CENTRE, REAR_WINDOW_WIDTH, REAR_WINDOW_HEIGHT, WINDSHIELD_BAND, 0.018, rear_window_turn(), "dark")


def wipers():
    for x in (-0.31, 0.31):
        beam((x + 0.13, 1.525, 0.773), (x - 0.08, 1.525, 0.805), 0.014, 0.014, "dark")
        box(x - 0.27, x + 0.10, 1.542, 1.552, 0.802, 0.818, "dark")


def tailgate_panel():
    box(-0.75, 0.75, 0.80, 1.405, 3.49, 3.56, "body")


DOOR_SEAMS = (
    [(0.81, 1.40), (0.81, 0.90), (0.83, 0.86), (0.88, 0.825), (1.70, 0.825), (1.79, 0.85), (1.85, 0.91), (1.85, 1.47)],
    [(1.91, 1.47), (1.91, 0.91), (1.94, 0.85), (2.02, 0.825), (2.34, 0.825), (2.42, 0.89), (2.64, 1.23), (2.68, 1.46)],
)
FRONT_DOOR_SPAN = hull.FRONT_DOOR_SPAN
REAR_DOOR_SPAN = (1.91, 2.64)  # the skin runs past the wall opening, over the rear arch
DOOR_SKIN_Y = (0.86, 1.405)
DOOR_SKIN_X = (0.69, 0.760)  # the door's thickness; its outer face carries the seams


def door_skins():
    """The door panels: a thick outer skin over the cut-out in the side wall, so the door swings open
    on the cabin."""
    for s in (-1, 1):
        for rear, (z0, z1) in ((False, FRONT_DOOR_SPAN), (True, REAR_DOOR_SPAN)):
            with kit.bone(door_name(s, rear)):
                box(min(s * DOOR_SKIN_X[0], s * DOOR_SKIN_X[1]), max(s * DOOR_SKIN_X[0], s * DOOR_SKIN_X[1]),
                    *DOOR_SKIN_Y, z0, z1, "body")


def seams_and_fittings():
    """Door seams and handles, the side vent behind the front overfender, mirrors and rock rails."""
    for s in (-1, 1):
        x = s * 0.761
        for rear, path in enumerate(DOOR_SEAMS):
            with kit.bone(door_name(s, bool(rear))):
                for (z0, y0), (z1, y1) in zip(path, path[1:]):
                    beam((x, y0, z0), (x, y1, z1), 0.008, 0.006, "dark")
        for z in (1.59, 2.43):
            with kit.bone(door_name(s, z > 2)):
                kit.rounded_rect("x", s * 0.783, z - 0.105, z + 0.105, 1.255, 1.305, 0.018, 0.027, "dark", 3)
        for z in (0.83, 1.95):
            with kit.bone(door_name(s, z > 1.9)):
                for y in (0.96, 1.25):
                    box(min(s * 0.763, s * 0.799), max(s * 0.763, s * 0.799), y - 0.025, y + 0.025, z, z + 0.10, "body")
                    box(min(s * 0.798, s * 0.804), max(s * 0.798, s * 0.804), y - 0.022, y + 0.022, z + 0.01, z + 0.023, "dark")
        side_vent(s)
        # Mirror arms and rounded mirror housing, inside the outside-tyre span; the front doors carry them.
        with kit.bone(door_name(s, rear=False)):
            box(min(s * 0.72, s * 0.84), max(s * 0.72, s * 0.84), 1.44, 1.485, 0.85, 0.92, "dark")
            kit.rounded_rect("z", 0.895, min(s * 0.80, s * dims.MIRROR_OUTER_X / dims.D), max(s * 0.80, s * dims.MIRROR_OUTER_X / dims.D), 1.49, 1.70, 0.027, 0.135, "dark", 4)
        # Rock rail and the three cross bars under it
        box(min(s * 0.79, s * 0.90), max(s * 0.79, s * 0.90), 0.68, 0.735, 0.77, 2.36, "dark")
        for z in (1.0, 1.8, 2.25):
            box(min(s * 0.54, s * 0.88), max(s * 0.54, s * 0.88), 0.69, 0.72, z, z + 0.045, "dark")


VENT_TOP_Y = 1.255  # where the front overfender top line ends
VENT_DEPTH = 0.20
VENT_WIDTH = 0.365  # at the top edge
VENT_SLICES = 10


def side_vent(s):
    """A recessed triangle right behind the front overfender: flat top, steep rear edge, apex down, with a
    dark and grey mesh along the front edge and a raised body-colour lip behind it. The front edge follows
    the overfender's rear diagonal (0.33, 1.195) to (0.73, 0.77)."""
    top = VENT_TOP_Y

    def z_front(y):
        return 0.413 + (1.195 - y) * 0.941

    def z_back(y):
        return z_front(top) + VENT_WIDTH - 0.88 * (top - y)

    def panel(y0, y1, za, zb, off, color):
        xs = s * (0.761 + off)
        box(min(xs, xs + s * 0.003), max(xs, xs + s * 0.003), y0, y1, za, zb, color)

    bottom = top - VENT_DEPTH
    for i in range(VENT_SLICES):
        y0 = bottom + (top - bottom) * i / VENT_SLICES
        y1 = bottom + (top - bottom) * (i + 1) / VENT_SLICES
        ym = (y0 + y1) / 2
        if z_back(ym) - z_front(ym) < 0.01:
            continue
        panel(y0, y1 + 0.0003, z_front(ym), z_back(ym), 0, "vent")
        if bottom + 0.04 <= ym <= top - 0.05:
            panel(y0, y1 + 0.0003, z_front(ym) + 0.012, z_front(ym) + 0.060, 0.003, "dark" if i % 2 == 0 else "vent")
            panel(y0, y1 + 0.0003, z_front(ym) + 0.060, z_front(ym) + 0.072, 0.004, "body")
    panel(top - 0.008, top, z_front(top), z_back(top), 0.003, "dark")


def sealed_windows():
    """Opaque plates that fill the window openings in flight and under water (ADR 0026, 0040): the
    windshield plate leans with the frame, and each side window gets plates flush inside its frame.
    Built after the body is widened, so every x is scaled like the frames."""
    k = hull.K_REAR
    plates = []
    mat, centre, height = windshield_turn()
    outward = apply(mat, (0, 0, -0.004))
    centre = tuple(centre[i] + outward[i] for i in range(3))
    width = (WINDSHIELD_WIDTH - WINDSHIELD_BAND) * k
    plates.append(kit.cube_for(mat, centre, (width, height - WINDSHIELD_BAND, 0.008), "glass"))
    slices = 12
    inset = SIDE_FRAME_WIDTH / 2 + 1e-8  # at the frame's inner edge, a hair clear of it
    for s in (-1, 1):
        x = s * SIDE_WINDOW_X * k
        for index, (z0, z1) in enumerate((FRONT_SIDE_WINDOW, REAR_SIDE_WINDOW, CARGO_SIDE_WINDOW)):
            y0, y1 = SIDE_WINDOW_Y[0] + inset, SIDE_WINDOW_Y[1] - inset
            rake = FRONT_SIDE_WINDOW_RAKE if index == 0 else 0
            for i in range(slices if rake else 1):
                a = y0 + (y1 - y0) * i / slices if rake else y0
                b = y0 + (y1 - y0) * (i + 1) / slices if rake else y1
                front = z0 + inset + rake * ((a + b) / 2 - y0) / (y1 - y0)
                plates.append(kit.cube_for(None, (x, (a + b) / 2, (front + z1 - inset) / 2),
                                           (0.0075, b - a + (0.0002 if rake else 0), z1 - inset - front), "glass"))
    return plates


def rear_glass():
    """The opaque rear window plate, shown in flight to hide the riders (ADR 0026)."""
    mat = rear_window_turn()
    outward = apply(mat, (0, 0, 0.004))
    centre = tuple(REAR_WINDOW_CENTRE[i] + outward[i] for i in range(3))
    width = (REAR_WINDOW_WIDTH - WINDSHIELD_BAND) * hull.K_REAR
    return [kit.cube_for(mat, centre, (width, REAR_WINDOW_HEIGHT - WINDSHIELD_BAND, 0.008), "glass")]
