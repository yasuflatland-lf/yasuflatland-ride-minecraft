"""Generate the camper geometry, 16 accent paint textures, and item icon.

Based on the owner's photos of a cab-over motorhome, with no manufacturer name.
Model units are pixels (16 per block), with the front at -z (ADR 0009). Build
coordinates use +x for right; mirror left and right just before writing into
Bedrock's frame. The stripe's W is an explicit exception recorded in ADR 0067.
Run: python3 -I tools/gen_camper.py packs/yasu_ride_rp
"""

import json
import math
import struct
import sys
import zlib
from pathlib import Path

RP = Path(sys.argv[1])
MODELS = RP / "models/entity/yasu_ride"
ENTITY_TEXTURES = RP / "textures/entity/yasu_ride"
ITEM_TEXTURES = RP / "textures/items/yasu_ride"
PALETTE = {
    "white": (238, 235, 226, 255),
    "panel": (226, 222, 210, 255),
    "brown": (152, 98, 52, 255),
    "tan": (186, 140, 92, 255),
    "khaki": (150, 128, 72, 255),
    "steel": (172, 172, 166, 255),
    "stripe": (128, 98, 52, 255),
    "black": (24, 24, 24, 255),
    "tire": (34, 34, 36, 255),
    "rim": (230, 228, 220, 255),
    "chrome": (205, 206, 210, 255),
    "slat": (168, 170, 172, 255),
    "grille": (52, 54, 56, 255),
    "glass": (70, 92, 108, 110),
    "lens": (235, 235, 215, 255),
    "amber": (240, 140, 30, 255),
    "red": (200, 30, 30, 255),
    "dash": (78, 104, 52, 255),
    "dark_dash": (58, 80, 40, 255),
    "gauge": (20, 20, 20, 255),
    "seat": (150, 92, 50, 255),
    "wood": (176, 136, 92, 255),
    "wall_in": (196, 170, 128, 255),
    "curtain": (196, 120, 60, 255),
    "ivory": (232, 226, 204, 255),
    "dash_pad": (88, 118, 60, 255),
    "tweed": (104, 116, 58, 255),
    "tweed_line": (78, 88, 42, 255),
    "piping": (128, 140, 78, 255),
    "needle": (245, 245, 245, 255),
    "hub": (196, 192, 176, 255),
    "harvest": (214, 160, 48, 255),
    "avocado": (120, 132, 54, 255),
}
SLOTS = list(PALETTE)

# Accent bases follow the SUV paints (ADR 0031); the white shell never changes.
ACCENT_BASES = {
    "khaki": PALETTE["khaki"][:3],
    "green": (62, 96, 56),
    "red": (128, 22, 26),
    "white": (222, 222, 216),
    "light_gray": (156, 156, 152),
    "gray": (92, 94, 98),
    "black": (34, 34, 36),
    "orange": (190, 92, 28),
    "yellow": (214, 178, 44),
    "lime": (112, 160, 42),
    "cyan": (30, 118, 124),
    "light_blue": (92, 150, 204),
    "blue": (40, 58, 128),
    "purple": (94, 46, 128),
    "magenta": (160, 52, 140),
    "pink": (214, 132, 162),
}

HW = 24  # half width
FRONT, REAR = -56, 56
BOTTOM, FLOOR, CEIL, ROOF = 8, 16, 61, 64  # roof 4.0 blocks up, the top of the fourth cell from the ground
FRONT_AXLE, REAR_AXLE = -31.5, 31
WHEEL_R = 7.8
# Keep the existing 2.5 px end gaps and 2 px top gap; scaling the gaps crowds the rear hatch.
ARCH_HALF = WHEEL_R + 2.5
ARCH_TOP, ARCH_SLOPE_Y, ARCH_INSET, ARCH_STEP = 2 * WHEEL_R + 2, 10.8, 4.2, 0.25
ARCHES = [(FRONT_AXLE - ARCH_HALF, FRONT_AXLE + ARCH_HALF), (REAR_AXLE - ARCH_HALF, REAR_AXLE + ARCH_HALF)]
DOOR = (-7, 7, 12, 54)  # z0, z1, y0, y1 on the right side; local cell z = 0
# The sides end at the footprint's edge (REAR = 56) and the rear profile (rear_z) never comes
# closer than 56.5, so a block or chest in the last row never shows through the back. The
# rear wall's rows are 1 px deep behind the profile, though, so where the profile is under
# 57 they start inside the last cell row: from 55.5 in the window band (y 37 to 52) and up
# to y 53.5, where the top lean has not yet reached 57. A block there overlaps the wall.
REAR_INNER = REAR


def face(color):
    return {"uv": [SLOTS.index(color), 0], "uv_size": [1, 1]}


def box(x0, y0, z0, x1, y1, z1, color, rotation=None, pivot=None):
    c = {
        "origin": [round(min(x0, x1), 3), round(min(y0, y1), 3), round(min(z0, z1), 3)],
        "size": [round(abs(x1 - x0), 3), round(abs(y1 - y0), 3), round(abs(z1 - z0), 3)],
        "uv": {f: face(color) for f in ("north", "south", "east", "west", "up", "down")},
    }
    if rotation:
        c["rotation"] = rotation
        c["pivot"] = pivot
    return c


def panel(axis, p0, p1, u0, u1, v0, v1, holes, color):
    """A flat panel minus rectangular holes. axis 'x': u = z, v = y; axis 'z': u = x, v = y."""
    breaks = sorted({v0, v1, *[h[2] for h in holes], *[h[3] for h in holes]})
    breaks = [b for b in breaks if v0 <= b <= v1]
    out = []
    for a, b in zip(breaks, breaks[1:]):
        cuts = sorted((h[0], h[1]) for h in holes if h[2] <= a and h[3] >= b)
        u = u0
        for c0, c1 in cuts + [(u1, u1)]:
            if c0 > u:
                if axis == "x":
                    out.append(box(p0, a, u, p1, b, c0, color))
                else:
                    out.append(box(u, a, p0, c0, b, p1, color))
            u = max(u, c1)
    return out


STEPS_32 = tuple(i * 11.25 for i in range(16))
STEPS_16 = tuple(i * 22.5 for i in range(8))
STEPS_8 = tuple(i * 45.0 for i in range(4))


def disc(axis, cx, cy, cz, r, depth, color, steps=STEPS_32):
    """A disc of 2 * len(steps) sides (32 with the default steps) from bars turned about its
    normal: 'x' (wheels), 'y' (stove burners), or 'z' (lamps)."""
    n = 2 * len(steps)
    long, short = 2 * r, 2 * r * math.tan(math.pi / n)
    out = []
    for a in steps:
        if axis == "x":
            out.append(box(cx, cy - short / 2, cz - long / 2, cx + depth, cy + short / 2, cz + long / 2, color, [a, 0, 0], [cx, cy, cz]))
        elif axis == "y":
            out.append(box(cx - long / 2, cy, cz - short / 2, cx + long / 2, cy + depth, cz + short / 2, color, [0, a, 0], [cx, cy, cz]))
        else:
            out.append(box(cx - long / 2, cy - short / 2, cz, cx + long / 2, cy + short / 2, cz + depth, color, [0, 0, a], [cx, cy, cz]))
    return out


def shift_in_slices(cube, cuts, dz_at):
    """Copies of cube cut at the y values in cuts, each moved along z by dz_at(its middle y)."""
    pieces = []
    for a0, a1 in zip(cuts, cuts[1:]):
        dz = dz_at((a0 + a1) / 2)
        piece = json.loads(json.dumps(cube))
        piece["origin"] = [cube["origin"][0], round(a0, 3), round(cube["origin"][2] + dz, 3)]
        piece["size"] = [cube["size"][0], round(a1 - a0, 3), cube["size"][2]]
        if "pivot" in piece:
            piece["pivot"] = [piece["pivot"][0], piece["pivot"][1], round(piece["pivot"][2] + dz, 3)]
        pieces.append(piece)
    return pieces


body = []

# --- Floor, roof and walls -------------------------------------------------
body.append(box(-HW + 1, 13, FRONT + 1, HW - 1, FLOOR, REAR_INNER, "wood"))
body.append(box(-HW, CEIL, FRONT + 8.5, HW, ROOF, REAR_INNER, "white"))  # the cab-over fills the front
body.append(box(-HW + 1, CEIL - 0.2, FRONT + 1, HW - 1, CEIL, REAR_INNER, "panel"))

WIN_Y = (36, 49)
BAND_Y = (34.5, 50.5)
STRIPE_Y = (29.5, 31.5)
# The rear seen from the side, from the rear-corner photo: the top leans out to the roof
# edge, the window band sits back, and the body below it steps out again and leans in
# toward the bottom.
REAR_TOP_LEAN, REAR_BAND_Y, REAR_BAND_DEPTH = (52, 4.5), (37, 52), 4.5
REAR_LOW_STEP, REAR_LOW_LEAN = 1.0, 1.7


REAR_OUT = REAR + REAR_BAND_DEPTH + 0.5  # the roof edge, the rearmost point of the body


def rear_z(y):
    """The rear surface at height y."""
    y = max(y, BOTTOM)  # the bumper follows the bottom of the body
    if y >= REAR_BAND_Y[1]:
        return REAR_OUT - REAR_BAND_DEPTH * (ROOF - y) / (ROOF - REAR_BAND_Y[1])
    if y >= REAR_BAND_Y[0]:
        return REAR_OUT - REAR_BAND_DEPTH
    return REAR_OUT - REAR_LOW_STEP - REAR_LOW_LEAN * (REAR_BAND_Y[0] - y) / (REAR_BAND_Y[0] - BOTTOM)


STRIPE_FRONT = FRONT + 10
# The W, measured on the side close-up: p runs from its rear edge (0) to its front edge (1).
W_WIDTH, W_BOTTOM, W_STEP = 16.5, ARCH_TOP + 1.5, 0.5
W_REAR = FRONT_AXLE + W_WIDTH / 2  # centered over the front wheel
W_MID = STRIPE_Y[1] - 0.32 * (STRIPE_Y[1] - W_BOTTOM)  # top of the middle peak
W_ARM_START, W_ARM_END = (0.0, 0.17), (0.83, 1.0)


def w_z(p):
    return W_REAR - W_WIDTH * p


# Each stroke: its p span at the bottom, its p span at the top, and its bottom and top y.
W_STROKES = [
    ((0.24, 0.41), W_ARM_START, W_BOTTOM, STRIPE_Y[0]),
    ((0.28, 0.45), (0.50, 0.63), W_BOTTOM, W_MID),
    ((0.66, 0.82), (0.50, 0.63), W_BOTTOM, W_MID),
    ((0.62, 0.79), W_ARM_END, W_BOTTOM, STRIPE_Y[0]),
]
CAB_WIN = (-50, -38, 35, 50)
SIDE0 = FRONT + 3  # side walls start behind the chamfered front corners
# Wheel arches: wide at the bottom with the top corners cut, as on the photos.
arch_holes = []
for a0, a1 in ARCHES:  # straight up to ARCH_SLOPE_Y, then sloping in by ARCH_INSET in fine steps
    arch_holes.append((a0, a1, 0, ARCH_SLOPE_Y))
    n = round((ARCH_TOP - ARCH_SLOPE_Y) / ARCH_STEP)
    for i in range(n):
        inset = ARCH_INSET * (i + 0.5) / n
        y = ARCH_SLOPE_Y + i * ARCH_STEP
        arch_holes.append((a0 + inset, a1 - inset, y, y + ARCH_STEP))
# No window between the door and the shower room, above the counter (ADR 0093, 0103).
right_windows = [CAB_WIN, (-35, -10, *WIN_Y), (38, 50, *WIN_Y), (-31, -19, 56, 59)]
left_windows = [CAB_WIN, (-29, -5, *WIN_Y), (-19, -8, 56, 59), (16, 21, *WIN_Y), (40, 49, *WIN_Y)]
for x0, x1, windows in ((HW - 1, HW, right_windows), (-HW, -HW + 1, left_windows)):
    right = x0 > 0
    sgn = 1 if right else -1
    out = x1 if right else x0
    # The front cut-out reaches up to where the cab-over chevron passes SIDE0.
    holes = windows + arch_holes + [(SIDE0, -50.5, 35.4, 52)] + ([DOOR] if right else [])
    body += panel("x", x0, x1, SIDE0, REAR_INNER, BOTTOM, CEIL, holes, "white")
    inner = x0 - 0.2 if right else x1
    body += panel("x", inner, inner + 0.2, FRONT + 8, REAR_INNER, FLOOR, CEIL - 0.2, holes, "wall_in")
    # Tan lower skirt just proud of the wall.
    skirt_holes = arch_holes + ([(DOOR[0], DOOR[1], BOTTOM, 16)] if right else [])
    lo, hi = (out, out + 0.12) if right else (out - 0.12, out)
    body += panel("x", lo, hi, SIDE0, REAR_INNER, BOTTOM, 15, skirt_holes, "tan")
    # As on the side photo: a tan band at window height from the cab window back, and one
    # brown stripe below it. Both continue across the door, which carries its own copies.
    door_cut = [(DOOR[0], DOOR[1], 0, 99)] if right else []
    lo, hi = (out, out + 0.1) if right else (out - 0.1, out)
    band_holes = [w for w in windows if w[:2] != CAB_WIN[:2]] + door_cut
    body += panel("x", lo, hi, CAB_WIN[1] + 1, REAR_INNER, *BAND_Y, band_holes, "khaki")
    lo, hi = (out, out + 0.12) if right else (out - 0.12, out)
    # The stripe dips into a large W ahead of the door; the W's top stays open between
    # its outer arms. The owner chose to keep this logo, an exception recorded in ADR 0067.
    w_open = (w_z(W_ARM_END[0]), w_z(W_ARM_START[1]))  # only between the outer arms
    body += panel("x", lo, hi, STRIPE_FRONT, REAR_INNER, *STRIPE_Y, door_cut + [(*w_open, *STRIPE_Y)], "stripe")
    y = STRIPE_Y[0]
    while y < STRIPE_Y[1] - 1e-6:  # the front end is cut on a slant, its top reaching further
        f = (y + 0.125 - STRIPE_Y[0]) / (STRIPE_Y[1] - STRIPE_Y[0])
        body.append(box(lo, y, STRIPE_FRONT - 3 * f, hi, y + 0.25, STRIPE_FRONT, "stripe"))
        y += 0.25
    for (b0, b1), (t0, t1), y_bottom, y_top in W_STROKES:
        y = y_bottom
        while y < y_top - 1e-6:
            f = min((y + W_STEP - y_bottom) / (y_top - y_bottom), 1.0)
            p0, p1 = b0 + (t0 - b0) * f, b1 + (t1 - b1) * f
            body.append(box(lo, y, w_z(p1), hi, min(y + W_STEP, y_top), w_z(p0), "stripe"))
            y += W_STEP
    for z0, z1, y0, y1 in windows:
        frame = "black" if (z0, z1) == CAB_WIN[:2] else "chrome"
        for fz0, fz1, fy0, fy1 in ((z0 - 0.6, z1 + 0.6, y0 - 0.6, y0), (z0 - 0.6, z1 + 0.6, y1, y1 + 0.6),
                                   (z0 - 0.6, z0, y0, y1), (z1, z1 + 0.6, y0, y1)):
            body.append(box(out, fy0, fz0, out + sgn * 0.15, fy1, fz1, frame))
        body.append(box(x0 + 0.4, y0, z0, x0 + 0.6, y1, z1, "glass"))
        if z0 > -40 and y1 - y0 > 5:  # curtains drawn to the window edges inside
            for cz0, cz1 in ((z0, z0 + 2.5), (z1 - 2.5, z1)):
                body.append(box(inner - sgn * 0.3, y0, cz0, inner, y1 + 1, cz1, "curtain"))
    # Vent wing at the front of the cab window
    body.append(box(out, CAB_WIN[2], -46.5, out + sgn * 0.2, CAB_WIN[3], -45.9, "black"))
    # Side marker lights near the front and rear corners
    body.append(box(out, 10, FRONT + 4, out + sgn * 0.2, 12, FRONT + 6, "amber"))
    mo0, mo1 = sorted((out, out + sgn * 0.2))
    body.append(box(mo0, 29.6, FRONT + 3.5, mo1, 30.9, FRONT + 6.5, "red"))  # oval marker
    body.append(box(mo0, 29.2, FRONT + 4, mo1, 31.3, FRONT + 6, "red"))
    body.append(box(out, 19, REAR - 4, out + sgn * 0.2, 21, REAR - 2, "red"))

body.append(box(HW, WIN_Y[0], -22.8, HW + 0.2, WIN_Y[1], -22.2, "chrome"))  # double window dividers
body.append(box(-HW - 0.2, WIN_Y[0], -17.3, -HW, WIN_Y[1], -16.7, "chrome"))
body.append(box(HW, 56, DOOR[1] + 0.8, HW + 0.5, 58, DOOR[1] + 2.6, "amber"))  # porch light
body.append(box(HW, 13, 10, HW + 0.3, 19, 17, "slat"))  # small louvered vent
# Louvered hatch low at the rear corner of both sides, small utility boxes.
for sx in (HW, -HW):
    o = 0.3 if sx > 0 else -0.3
    body.append(box(sx, 10, 44, sx + o, 22, 55, "panel"))
    for y in range(11, 22, 2):
        body.append(box(sx + o, y, 45, sx + o * 1.6, y + 0.8, 54, "slat"))
body.append(box(-HW - 0.3, 16, 13, -HW, 22, 19, "panel"))  # left side service hatch
body.append(box(-HW - 0.4, 19, 14, -HW - 0.3, 20, 15.5, "chrome"))

# Entry door stays closed until the later parking work; a fold-out step stays below it.
DZ0, DZ1, DY0, DY1 = DOOR
door = [box(HW - 1, DY0, DZ0 + 0.1, HW, DY1, DZ1 - 0.1, "white")]
# The door window lines up with the side windows, as on the close-up photo.
DW0, DW1 = DZ0 + 3, DZ1 - 3
door.append(box(HW, WIN_Y[0], DW0, HW + 0.15, WIN_Y[1], DW1, "glass"))
for fz0, fz1, fy0, fy1 in ((DW0 - 0.6, DW1 + 0.6, WIN_Y[0] - 0.6, WIN_Y[0]), (DW0 - 0.6, DW1 + 0.6, WIN_Y[1], WIN_Y[1] + 0.6),
                           (DW0 - 0.6, DW0, *WIN_Y), (DW1, DW1 + 0.6, *WIN_Y)):
    door.append(box(HW, fy0, fz0, HW + 0.18, fy1, fz1, "chrome"))
door.append(box(HW, STRIPE_Y[0], DZ0 + 0.1, HW + 0.12, STRIPE_Y[1], DZ1 - 0.1, "stripe"))
door.append(box(HW, BAND_Y[0], DZ0 + 0.1, HW + 0.1, BAND_Y[1], DZ1 - 0.1, "khaki"))
door.append(box(HW, DY0, DZ0 + 0.1, HW + 0.12, 15, DZ1 - 0.1, "tan"))
door.append(box(HW, 26, DZ1 - 2.5, HW + 0.6, 27, DZ1 - 1, "chrome"))  # handle outside
door.append(box(HW - 1.6, 26, DZ1 - 2.5, HW - 1, 27, DZ1 - 1, "chrome"))  # handle inside
DOOR_HINGE = [HW, 0, DZ0]
body.append(box(HW, 7, DZ0 + 1, HW + 6, 8, DZ1 - 1, "black"))
body.append(box(HW, 3.5, DZ0 + 1, HW + 6, 4.5, DZ1 - 1, "black"))
for z in (DZ0 + 1, DZ1 - 2):
    body.append(box(HW, 3.5, z, HW + 6, 8, z + 1, "black"))

# --- Front ------------------------------------------------------------------
SILL_LOW = 33  # the front face and corners stop here; the sloping sill caps them
FRONT_START = len(body)
FW = HW - 3  # half width of the flat front face; the corners are cut at 45 degrees
WS_Z = FRONT + 2.5  # the windshield sits behind a ledge over the grille
UPPER = (18, 29.5)  # upper grille, across the face and around the corners
LOWER_Y = (8, 18)  # lower grille between the lamps, narrower at the bottom
CORNER = 3 * math.sqrt(2)
SLAT_Y = [UPPER[0] + 0.6 + i * 1.5 for i in range(int((UPPER[1] - UPPER[0]) / 1.5))]


def corner(sx, z, y0, y1, color, inset=0.0):
    cx, cz = sx * (FW + 1.5), z + 1.5
    return box(cx - CORNER / 2, y0, cz - 0.5 - inset, cx + CORNER / 2, y1, cz + 0.5 - inset, color, [0, -sx * 45, 0], [cx, 0, cz])


for sx in (1, -1):
    body.append(corner(sx, FRONT, BOTTOM, UPPER[0], "white"))
    body.append(corner(sx, FRONT, UPPER[1], SILL_LOW, "white"))
    body.append(corner(sx, FRONT, UPPER[0], UPPER[1], "grille"))
    for y in SLAT_Y:
        body.append(corner(sx, FRONT, y, y + 0.8, "slat", inset=0.3))
    body.append(corner(sx, FRONT, BOTTOM, 15, "tan", inset=0.12))
    # Wraparound corner glass beside the windshield, in black rubber
    body.append(corner(sx, WS_Z, 36, 49.5, "glass"))
    body.append(corner(sx, WS_Z, 35.4, 36, "black", inset=0.2))
body += panel("z", FRONT, FRONT + 1, -FW, FW, LOWER_Y[1], SILL_LOW, [(-19.5, 19.5, *UPPER)], "white")
# The windshield's chrome center post continues as a raised rib over the sill and down the
# face between the two upper panels to the grille, as on the photo.
body.append(box(-0.45, UPPER[1], FRONT - 0.45, 0.45, SILL_LOW, FRONT, "chrome"))
# Upper grille in three sections, as on the lower-front photo; the middle section's slats
# dip in a shallow V whose point reaches down into the lower grille.
GDIV, V_DIP, STEP = 7.5, 1.2, 0.5
body.append(box(-19.5, UPPER[0], FRONT + 0.7, 19.5, UPPER[1], FRONT + 1, "grille"))


def dip(x):
    return V_DIP * (1 - abs(x) / GDIV)


for x0, x1 in ((-19.5, -GDIV), (-GDIV, GDIV), (GDIV, 19.5)):
    middle = x0 == -GDIV
    for y in SLAT_Y:
        if not middle:
            body.append(box(x0 + 0.5, y, FRONT + 0.3, x1 - 0.5, y + 0.8, FRONT + 0.7, "slat"))
            continue
        xa = x0 + 0.5
        while xa < x1 - 0.5 - 1e-6:
            d = dip(xa + STEP / 2)
            body.append(box(xa, y - d, FRONT + 0.3, xa + STEP, y - d + 0.8, FRONT + 0.7, "slat"))
            xa += STEP
    body.append(box(x0, UPPER[1] - 0.5, FRONT + 0.1, x1, UPPER[1], FRONT + 0.7, "chrome"))
    if middle:  # the bottom bar and the backing follow the V down
        xa = x0
        while xa < x1 - 1e-6:
            d = dip(xa + STEP / 2)
            body.append(box(xa, UPPER[0] - d, FRONT + 0.1, xa + STEP, UPPER[0] - d + 0.5, FRONT + 0.7, "chrome"))
            body.append(box(xa, UPPER[0] - d, FRONT + 0.7, xa + STEP, UPPER[0], FRONT + 1, "grille"))
            xa += STEP
    else:
        body.append(box(x0, UPPER[0], FRONT + 0.1, x1, UPPER[0] + 0.5, FRONT + 0.7, "chrome"))
    for fx in (x0, x1 - 0.5):
        body.append(box(fx, UPPER[0], FRONT + 0.1, fx + 0.5, UPPER[1], FRONT + 0.7, "chrome"))
# Below it, black lamp pods at both sides and a lower grille between them that narrows
# toward the bumper; the pods' inner edges follow the grille's slanted sides.


def lower_half(y):
    return 8 + 4 * (y - LOWER_Y[0]) / (LOWER_Y[1] - LOWER_Y[0])


y = LOWER_Y[0]
while y < LOWER_Y[1] - 1e-6:
    g = lower_half(y + STEP / 2)
    body.append(box(-g, y, FRONT - 0.2, g, y + STEP, FRONT + 1, "black"))  # grille backing
    for sx in (1, -1):
        x0, x1 = sorted((sx * (g + 0.5), sx * FW))
        body.append(box(x0, y, FRONT - 0.3, x1, y + STEP, FRONT + 1, "black"))  # lamp pod
        e0, e1 = sorted((sx * g, sx * (g + 0.5)))
        body.append(box(e0, y, FRONT - 0.6, e1, y + STEP, FRONT + 1, "chrome"))  # grille edge
    y += STEP
for i in range(6):
    y = LOWER_Y[1] - 1.6 - i * 1.5
    g = lower_half(y + 0.4)
    body.append(box(-g, y, FRONT - 0.5, g, y + 0.8, FRONT - 0.2, "slat"))
for sx in (1, -1):
    # Headlight at the outer corner of the pod, the turn signal beside it inboard.
    body += disc("z", sx * 17.8, 13.0, FRONT - 0.6, 2.6, 0.5, "chrome")
    body += disc("z", sx * 17.8, 13.0, FRONT - 0.8, 2.1, 0.3, "lens")
    body += disc("z", sx * 13.9, 12.6, FRONT - 0.6, 1.4, 0.4, "chrome")
    body += disc("z", sx * 13.9, 12.6, FRONT - 0.8, 1.1, 0.3, "amber")
# Stainless bumper, thick, wrapping a little around the corners
body.append(box(-HW + 0.5, 3, FRONT - 3, HW - 0.5, 8, FRONT + 1, "steel"))
body.append(box(-HW + 0.5, 7.6, FRONT - 3.1, HW - 0.5, 8, FRONT - 2.9, "chrome"))
for sx in (1, -1):
    x0, x1 = sorted((sx * (HW - 0.5), sx * (HW + 0.5)))
    body.append(box(x0, 3, FRONT - 1.5, x1, 8, FRONT + 3, "steel"))
body.append(box(-4.5, 4, FRONT - 3.2, 4.5, 6.4, FRONT - 3, "white"))  # plate

# Split windshield leaning back in a black rubber frame.
WS_LEAN = [-8, 0, 0]
pivot = [0, 36, WS_Z]
for x0, x1 in ((-FW, -0.6), (0.6, FW)):
    body.append(box(x0, 36, WS_Z + 0.2, x1, 49.5, WS_Z + 0.4, "glass", WS_LEAN, pivot))
for x0, x1, color in ((-0.7, 0.7, "chrome"), (-FW, -FW + 0.6, "black"), (FW - 0.6, FW, "black")):
    body.append(box(x0, 36, WS_Z - 0.2, x1, 49.5, WS_Z + 0.6, color, WS_LEAN, pivot))
for x in (-14, 5):
    body.append(box(x, 36.6, WS_Z - 0.6, x + 8, 37.2, WS_Z, "black", [0, 0, 25], [x, 37, WS_Z]))

# As on the cab close-up, the body under the windshield juts out at the sill and tapers
# back toward the bottom: every front cube below the sill moves forward with its height,
# tall ones cut into slices so the face steps back smoothly, and the side walls are
# carried forward to meet it.
SILL, TAPER, SLICE = 36, 2.0, 0.5


def taper_dz(y):
    # Full overhang from the upper grille up; the lamp panel and lower grille below it
    # lean back toward the bumper, as on the front-corner photo.
    if y >= UPPER[0]:
        return -TAPER
    return -TAPER + (TAPER + 0.5) * (UPPER[0] - y) / (UPPER[0] - BOTTOM)


front, body = body[FRONT_START:], body[:FRONT_START]
for c in front:
    y0, sy = c["origin"][1], c["size"][1]
    rot = c.get("rotation")
    if y0 + sy / 2 >= SILL or (rot and rot[0]):
        body.append(c)
        continue
    cuts = [y0]
    if sy > SLICE * 1.5 and not (rot and rot[2]):
        while cuts[-1] + SLICE < y0 + sy - 1e-6:
            cuts.append(cuts[-1] + SLICE)
    cuts.append(y0 + sy)
    body += shift_in_slices(c, cuts, taper_dz)
# The side walls reach forward to the overhang with a straight upright edge in chrome trim.
EDGE_Z = FRONT - TAPER + 1.5
for sx in (1, -1):
    x0, x1 = sorted((sx * (HW - 1), sx * HW))
    body.append(box(x0, BOTTOM, EDGE_Z, x1, 15, SIDE0, "tan"))
    body.append(box(x0, 15, EDGE_Z, x1, SILL_LOW, SIDE0, "white"))
    t0, t1 = sorted((sx * (HW - 0.4), sx * (HW + 0.2)))
    body.append(box(t0, BOTTOM, EDGE_Z - 0.2, t1, SILL_LOW, EDGE_Z + 0.5, "chrome"))
# The sill: from the windshield foot it slopes down toward the front, as on the photo,
# in quarter-pixel columns whose width follows the chamfered front corners.
SILL_FRONT = FRONT - TAPER
z = SILL_FRONT
while z < WS_Z - 1e-6:
    zc = z + 0.125
    top = SILL - 1.5 * (WS_Z - zc) / (WS_Z - SILL_FRONT)
    half = min(HW, FW + (zc - SILL_FRONT))
    body.append(box(-half, SILL_LOW, z, half, top, z + 0.25, "white"))
    for sx in (1, -1):  # chrome trim along the sloping edge on both sides
        t0, t1 = sorted((sx * (half - 0.4), sx * (half + 0.2)))
        body.append(box(t0, top - 0.4, z, t1, top + 0.05, z + 0.25, "chrome"))
    body.append(box(-0.45, top - 0.2, z, 0.45, top + 0.35, z + 0.25, "chrome"))  # center rib
    z += 0.25
body.append(box(-0.45, SILL_LOW, SILL_FRONT - 0.45, 0.45, SILL - 1.5 + 0.35, SILL_FRONT, "chrome"))  # rib over the nose

# The cab-over, after the owner's reference photos: each side wall ends in a forward-pointing
# chevron edged in chrome. Its nose (the crease) sits 45 % of the way up the cap, level with
# the bumper front. The lower face runs from the crease back to the windshield header, with a
# slanted end facet over each corner glass; the upper face is one flat panel up to the roof
# edge, where the five lamps stand.
CAP_Y0 = 49.5  # the windshield top
CREASE = 56
NOSE = WS_Z - 5.5
TOP_FRONT = WS_Z + 0.5
BOT_C, BOT_S = WS_Z - 0.5, WS_Z + 3  # lower face foot over the windshield and at the side pillar
CAP_BACK = WS_Z + 6
body.append(box(-FW, CAP_Y0, BOT_C, FW, ROOF, CAP_BACK, "white"))
body.append(box(-HW, CAP_Y0, BOT_S, HW, ROOF, CAP_BACK, "white"))


def lerp(a, b, t):
    return a + (b - a) * t


def molding(sx, y0, y1, z):
    x0, x1 = sorted((sx * (HW - 0.3), sx * (HW + 0.2)))
    body.append(box(x0, y0, z - 0.2, x1, y1, z + 0.8, "chrome"))


def chevron_molding(y0, y1, z):
    for sx in (1, -1):
        molding(sx, y0, y1, z)


LAYERS = round((CREASE - CAP_Y0) / 0.25)  # quarter-pixel steps keep both faces smooth
FACET_COL = 0.5
for i in range(LAYERS):
    y0 = CAP_Y0 + 0.25 * i
    t = (i + 0.5) / LAYERS
    zc, ze = lerp(BOT_C, NOSE, t), lerp(BOT_S, NOSE, t)
    body.append(box(-FW, y0, zc, FW, y0 + 0.25, CAP_BACK, "white"))
    x = FW
    while x < HW - 1e-6:  # the end facet's front edge runs from (FW, zc) to (HW, ze)
        z = lerp(zc, ze, (x + FACET_COL / 2 - FW) / (HW - FW))
        for sx in (1, -1):
            x0, x1 = sorted((sx * x, sx * (x + FACET_COL)))
            body.append(box(x0, y0, z, x1, y0 + 0.25, BOT_S + 0.5, "white"))
        x += FACET_COL
    chevron_molding(y0, y0 + 0.25, ze)
UPPER_LAYERS = round((ROOF - CREASE) / 0.25)
for i in range(UPPER_LAYERS):
    y0 = CREASE + 0.25 * i
    zf = lerp(NOSE, TOP_FRONT, (i + 0.5) / UPPER_LAYERS)
    body.append(box(-HW, y0, zf, HW, y0 + 0.25, CAP_BACK, "white"))
    chevron_molding(y0, y0 + 0.25, zf)
    if 60 <= y0 < 62.5:  # the dark window set into the upper face, right of centre on the photo
        body.append(box(-3.5, y0, zf - 0.1, 9.5, y0 + 0.25, zf + 0.3, "grille"))
for sx in (1, -1):  # the molding carries on down the pillar to the corner glass foot
    molding(sx, 35.4, CAP_Y0, BOT_S)
    body.append(corner(sx, WS_Z, 49.2, 49.7, "chrome"))  # header strip over the corner glass
body.append(box(-FW, 49.2, BOT_C - 0.3, FW, 49.7, BOT_C + 2.2, "chrome"))  # windshield header strip
body.append(box(-HW - 0.2, ROOF - 0.6, TOP_FRONT - 0.3, HW + 0.2, ROOF + 0.1, TOP_FRONT + 0.7, "chrome"))
# Roof-lip lamps: a clearance dome near each corner and three identification lamps at the centre,
# the middle one a flat lens.
for x, half, dome in ((-21.5, 0.7, True), (-6, 0.7, True), (0, 1.2, False), (6, 0.7, True), (21.5, 0.7, True)):
    body.append(box(x - half - 0.2, ROOF - 0.1, TOP_FRONT - 0.1, x + half + 0.2, ROOF + 0.1, TOP_FRONT + 1.1, "chrome"))
    body.append(box(x - half, ROOF - 0.1, TOP_FRONT, x + half, ROOF + 0.7, TOP_FRONT + 1.0, "amber"))
    if dome:
        body.append(box(x - 0.4, ROOF + 0.7, TOP_FRONT + 0.2, x + 0.4, ROOF + 1.0, TOP_FRONT + 0.8, "amber"))
for sx in (1, -1):
    # Rectangular side marker high on the wall, just behind the upper leg of the molding
    x0, x1 = sorted((sx * HW, sx * (HW + 0.25)))
    body.append(box(x0, 60.4, -51.8, x1, 61.8, -49.2, "amber"))
    # West-coast mirrors, as on the close-up: a chrome rod standing off the front pillar on
    # two brackets, carrying a tall mirror with rounded corners that faces the rear.
    def xs(a, b):
        return min(sx * a, sx * b), max(sx * a, sx * b)
    mz = WS_Z + 3
    for by in (35.5, 49.5):  # brackets from the pillar out to the rod
        x0, x1 = xs(HW, HW + 3)
        body.append(box(x0, by - 0.3, mz - 0.3, x1, by + 0.3, mz + 0.3, "chrome"))
    x0, x1 = xs(HW + 2.6, HW + 3.4)
    body.append(box(x0, 35.2, mz - 0.4, x1, 49.8, mz + 0.4, "chrome"))  # rod
    MY0, MY1, MX0, MX1 = 37, 47.5, HW + 0.8, HW + 6.2
    for inset, rise in ((1.8, 0), (0.9, 0.4), (0.35, 1.0), (0, 1.8)):  # rounded ends
        x0, x1 = xs(MX0 + inset, MX1 - inset)
        body.append(box(x0, MY0 + rise, mz + 0.4, x1, MY1 - rise, mz + 1.2, "chrome"))
    for ry in [MY0 + 1.6 + i * 1.3 for i in range(6)]:  # ribs across its back, facing forward
        x0, x1 = xs(MX0 + 0.5, MX1 - 0.5)
        body.append(box(x0, ry, mz + 0.15, x1, ry + 0.45, mz + 0.4, "slat"))
    x0, x1 = xs(MX0 + 0.4, MX1 - 0.4)
    body.append(box(x0, MY0 + 0.4, mz + 1.2, x1, MY1 - 0.4, mz + 1.3, "glass"))

# --- Rear -------------------------------------------------------------------
REAR_START = len(body)
REAR_WIN = (-17, 17, 38, 50)
body.append(box(-17, 38, REAR - 0.6, 17, 50, REAR - 0.4, "glass"))
body.append(box(-0.3, 38, REAR - 0.4, 0.3, 50, REAR + 0.1, "chrome"))
for fy0, fy1 in ((37.4, 38), (50, 50.6)):
    body.append(box(-17.6, fy0, REAR, 17.6, fy1, REAR + 0.2, "black"))
for fx in (-17.6, 17):
    body.append(box(fx, 38, REAR, fx + 0.6, 50, REAR + 0.2, "black"))
for x in (-12, -4, 4, 12):
    body += disc("z", x, ROOF - 2.2, REAR + 0.2, 0.7, 0.3, "red", steps=(0, 45))
# Two-door hatch with a tan center bar, a tan band along the bottom, round tail lights.
for x0, x1 in ((-13, -0.6), (0.6, 13)):
    body.append(box(x0, 12, REAR, x1, 26, REAR + 0.2, "white"))
    for fy0, fy1 in ((11.6, 12), (26, 26.4)):
        body.append(box(x0 - 0.4, fy0, REAR, x1 + 0.4, fy1, REAR + 0.3, "slat"))
    for fx in (x0 - 0.4, x1):
        body.append(box(fx, 12, REAR, fx + 0.4, 26, REAR + 0.3, "slat"))
body.append(box(-0.6, 10, REAR, 0.6, 27, REAR + 0.35, "tan"))
body.append(box(-15, 10, REAR, 15, 11, REAR + 0.35, "tan"))
body.append(box(-HW, BOTTOM, REAR, HW, 10, REAR + 0.15, "tan"))
for sx in (1, -1):
    body += disc("z", sx * 19, 15, REAR + 0.2, 1.6, 0.4, "red")
body.append(box(-19, 17.5, REAR, -16, 21, REAR + 0.3, "panel"))  # backup light box
body.append(box(-20, 10.5, REAR, -15, 13.5, REAR + 0.3, "white"))  # plate
body.append(box(-HW - 0.5, 3, REAR - 1, HW + 0.5, 7.5, REAR + 2.5, "black"))  # bumper with step slots
for x0 in (-17, -6, 5):
    body.append(box(x0, 6.5, REAR + 2.5, x0 + 10, 7.6, REAR + 2.6, "grille"))
# Everything above was drawn on a flat rear at REAR; move it onto the profile, in slices.
rear, body = body[REAR_START:], body[:REAR_START]
for c in rear:
    y0, sy = c["origin"][1], c["size"][1]
    rot = c.get("rotation")
    cuts = [y0]
    if sy > 0.75 and not rot and y0 + sy > BOTTOM:
        while cuts[-1] + 0.5 < y0 + sy - 1e-6:
            cuts.append(cuts[-1] + 0.5)
    cuts.append(y0 + sy)
    body += shift_in_slices(c, cuts, lambda y: rear_z(y) - REAR)
# The rear wall itself in half-pixel rows from the inner face out to the profile, with
# the side colors carried around the corner strips.
y = BOTTOM
while y < ROOF - 1e-6:
    yc = y + 0.25
    z1 = rear_z(yc)
    side = ("tan" if yc < 15 else "stripe" if STRIPE_Y[0] <= yc < STRIPE_Y[1]
            else "khaki" if BAND_Y[0] <= yc < BAND_Y[1] else "white")
    for sx in (1, -1):
        x0, x1 = sorted((sx * HW, sx * (HW - 1)))
        body.append(box(x0, y, min(REAR_INNER, z1 - 1), x1, y + 0.5, z1, side))
    if REAR_WIN[2] <= yc < REAR_WIN[3]:
        spans = [(-HW + 1, REAR_WIN[0]), (REAR_WIN[1], HW - 1)]
    else:
        spans = [(-HW + 1, HW - 1)]
    for x0, x1 in spans:
        body.append(box(x0, y, z1 - 1, x1, y + 0.5, z1, "white"))
    y += 0.5
# Ladder on the right of the rear, from the bumper over the roof edge to the rack.
LADDER = (13, 21)
for x in LADDER:
    body.append(box(x, 7.5, REAR_OUT + 0.7, x + 0.8, ROOF + 4, REAR_OUT + 1.5, "chrome"))
    body.append(box(x, ROOF + 3.2, REAR - 4, x + 0.8, ROOF + 4, REAR_OUT + 1.5, "chrome"))  # hoop over the edge
    for y in (12, 30, ROOF - 2):
        body.append(box(x, y, rear_z(y + 0.4) - 0.2, x + 0.8, y + 0.8, REAR_OUT + 0.7, "chrome"))  # standoffs
for y in range(10, ROOF + 4, 4):
    body.append(box(LADDER[0], y, REAR_OUT + 0.8, LADDER[1] + 0.8, y + 0.7, REAR_OUT + 1.4, "chrome"))

# --- Roof -------------------------------------------------------------------
def ac_unit(z0, z1):
    out = [box(-7, ROOF, z0, 7, ROOF + 3.5, z1, "panel"), box(-6.5, ROOF + 3.5, z0 + 0.5, 6.5, ROOF + 4, z1 - 0.5, "panel")]
    for z in range(int(z0) + 2, int(z1) - 2, 2):
        out.append(box(7, ROOF + 0.8, z, 7.2, ROOF + 2.8, z + 1, "black"))
    return out


body += ac_unit(-34, -20)
body += ac_unit(30, 44)
body.append(box(-4, ROOF, -2, 4, ROOF + 1.6, 6, "panel"))  # small vent
body.append(box(-3.5, ROOF + 1.6, -1.5, 3.5, ROOF + 2, 5.5, "white"))
# Round black fan vent near the front left
body.append(box(-18, ROOF, -48, -10, ROOF + 2.6, -40, "black"))
for z in (-46, -42):
    body += disc("z", -14, ROOF + 1.3, z, 1.2, 0.2, "grille", steps=(0, 45))
body.append(box(-HW, ROOF - 0.6, TOP_FRONT, -HW - 0.4, ROOF, REAR_OUT, "slat"))  # drip rails
body.append(box(HW, ROOF - 0.6, TOP_FRONT, HW + 0.4, ROOF, REAR_OUT, "slat"))
# Roof rack around the rear air conditioner
RACK = (22, 55)
for sx in (1, -1):
    body.append(box(sx * 19, ROOF + 3, RACK[0], sx * 20, ROOF + 4, RACK[1], "chrome"))
    for z in range(RACK[0], RACK[1] + 1, 8):
        body.append(box(sx * 19, ROOF, z, sx * 20, ROOF + 3, z + 1, "chrome"))
for z in RACK:
    body.append(box(-20, ROOF + 3, z, 20, ROOF + 4, z + 1, "chrome"))
for x in range(-17, 18, 4):
    body.append(box(x, ROOF + 0.5, RACK[0], x + 0.6, ROOF + 1, RACK[1], "slat"))

# --- Chassis and wheels -----------------------------------------------------
body.append(box(-18, 5, FRONT + 2, 18, BOTTOM + 1, REAR - 2, "black"))
wheels = []
hover = {}
for end, z in (("f", FRONT_AXLE), ("r", REAR_AXLE)):
    for sx in (1, -1):
        cubes = []
        name = end + ("l" if sx < 0 else "r")
        center_x = sx * (HW - 0.6 - 2)
        hover[f"hover_{name}"] = [center_x, 0, z]
        x_out = sx * (HW - 0.6)
        cubes += disc("x", min(x_out, x_out - sx * 4), WHEEL_R, z, WHEEL_R, 4, "tire")
        face_x = x_out if sx > 0 else x_out - 0.3
        cubes += disc("x", face_x, WHEEL_R, z, 5.28, 0.3, "rim")  # white steel wheel
        cubes += disc("x", face_x + sx * 0.15, WHEEL_R, z, 3.6, 0.3, "slat")
        cubes += disc("x", face_x + sx * 0.3, WHEEL_R, z, 2.04, 0.3, "chrome")

        wheels.append({"name": f"wheel_{name}", "parent": "body",
                       "pivot": [center_x, WHEEL_R, z], "cubes": cubes})

# --- Cab interior (right-hand drive, like the SUV; ADR 0069) ----------------
DASH_FACE = FRONT + 8  # the dashboard's rear face, toward the seats
# Padded green dashboard with a rounded rear edge on top
body.append(box(-HW + 1, FLOOR, FRONT + 1, HW - 1, 27, DASH_FACE, "dash"))
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


# Lower rows: rocker switches and round controls. The steering column meets the panel at
# x 11.3 to 12.7 below y 21.3, so the left pair of rockers flanks it instead of sitting on it.
for rx, ry in ((10.6, 21.1), (13.4, 21.1), (10.6, 19.9), (13.4, 19.9), (16, 20.5), (18.6, 20.5)):
    body += rocker(rx, ry, False)
for cx in (14.75, 17.25):
    body += round_control(cx, 20.5, 0.75)
# Ignition switch at the upper right of the panel, above the door armrest (top at y 23.4)
body += disc("z", 21.2, 24.15, PANEL_Z, 0.7, 0.2, "chrome", steps=STEPS_8)
body += disc("z", 21.2, 24.15, PANEL_Z + 0.2, 0.38, 0.1, "black", steps=STEPS_8)
# Right column: rocker switches in pairs and two slide levers. The door armrest reaches in to
# x 21.2 at y 22 to 23.4 and through the whole console, so the rockers stay left of it.
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


# The front cushions sit 0.4 blocks above where they started, with minecraft:rideable's
# front seats at 1.5, so a seated player's eyes clear the windshield's lower frame (36).
FRONT_SEAT_RISE = 6.4


def bucket_seat(x0, x1):
    """A green tweed bucket seat with horizontal pleats and lighter piping."""
    r = FRONT_SEAT_RISE
    out = [box(x0 + 1, FLOOR, -39, x1 - 1, 18 + r, -30, "black")]  # pedestal
    out.append(box(x0, 18 + r, -41, x1, 21.5 + r, -29, "tweed"))
    for z in [-40 + i * 1.4 for i in range(8)]:
        out.append(box(x0 + 0.6, 21.5 + r, z, x1 - 0.6, 21.7 + r, z + 0.4, "tweed_line"))
    out.append(box(x0 - 0.2, 21.2 + r, -41.2, x1 + 0.2, 21.8 + r, -40.8, "piping"))
    pivot = [0, 21.5 + r, -29.5]
    lean = [-12, 0, 0]
    out.append(box(x0, 21.5 + r, -30, x1, 38 + r, -28, "tweed", lean, pivot))
    for y in [23 + r + i * 1.5 for i in range(10)]:
        out.append(box(x0 + 0.6, y, -30.2, x1 - 0.6, y + 0.5, -30, "tweed_line", lean, pivot))
    out.append(box(x0 - 0.2, 37.6 + r, -30.2, x1 + 0.2, 38.3 + r, -27.8, "piping", lean, pivot))
    for xs in (x0 - 0.2, x1 - 0.4):
        out.append(box(xs, 21.5 + r, -30.2, xs + 0.6, 38.3 + r, -27.8, "piping", lean, pivot))
    return out


# Bed at the rear left: two cells (build cell x = -1, z = +2 and +3), 9 px high like the
# future parked bed block (the driving model is visual only).
BED = (-HW + 1, -8, 24, REAR - 1)  # x0, x1, z0, z1
body.append(box(BED[0], FLOOR, BED[2], BED[1], FLOOR + 3, BED[3], "wood"))
body.append(box(BED[0] + 0.3, FLOOR + 3, BED[2] + 0.3, BED[1] - 0.3, FLOOR + 7.5, BED[3] - 0.3, "ivory"))
body.append(box(BED[0] + 0.2, FLOOR + 7.5, BED[2] + 0.2, BED[1] - 0.2, FLOOR + 9, BED[3] - 8, "curtain"))
body.append(box(BED[0] + 0.1, FLOOR + 5, BED[2] + 0.1, BED[1] - 0.1, FLOOR + 7.5, BED[2] + 0.4, "curtain"))  # blanket over the foot
body.append(box(BED[0] + 0.2, FLOOR + 8.6, BED[3] - 9, BED[1] - 0.2, FLOOR + 9.4, BED[3] - 7.5, "ivory"))  # folded sheet
body.append(box(BED[0] + 2, FLOOR + 7.5, BED[3] - 6, BED[1] - 2, FLOOR + 10, BED[3] - 1.5, "white"))  # pillow
# --- Right-hand furniture (ADR 0093) ----------------------------------------
# Each decor slot height in src/domain/vehicle/kinds/camper/furniture.ts is the top of the
# furniture at the middle of its cell; tests/packs/camper.test.ts checks them against this model.
FURN_X = (9, 22.4)  # clear of the curtains (22.5 to 22.8) and the aisle (x < 8)
# Tall open shelf behind the driver (cell z = 1): a closed base, two boards, open to the window.
SHELF_Z = (-23.5, -8.5)
for z0, z1 in ((SHELF_Z[0], SHELF_Z[0] + 0.5), (SHELF_Z[1] - 0.5, SHELF_Z[1])):
    body.append(box(FURN_X[0], FLOOR, z0, FURN_X[1], 49, z1, "wood"))  # end panels
body.append(box(FURN_X[0], FLOOR, -23, FURN_X[1], 25, -9, "wood"))  # base cabinet
body.append(box(8.7, FLOOR + 1, -22.5, FURN_X[0], 24.5, -9.5, "brown"))  # its door
body.append(box(FURN_X[0], 25, -23, FURN_X[1], 26, -9, "brown"))  # low board, top 26
body.append(box(FURN_X[0], 35, -23, FURN_X[1], 36, -9, "brown"))  # high board, top 36
body.append(box(FURN_X[0], 48, SHELF_Z[0], FURN_X[1], 49, SHELF_Z[1], "wood"))  # top
for y in (28, 38):  # fiddle rails along the aisle edge
    body.append(box(FURN_X[0], y, -23, FURN_X[0] + 0.4, y + 0.4, -9, "chrome"))
# Counter behind the door: the sink in cell z = -1, the stove in cell z = -2 (ADR 0100), tops
# at 30. Each cell's middle stays flat at 30 for its decor slot, so the sink and every burner
# part keep off it.
COUNTER_Z = (8.5, 39.5)
STOVE_Z = (24, COUNTER_Z[1])
body.append(box(FURN_X[0], FLOOR, COUNTER_Z[0], 22.8, 29, COUNTER_Z[1], "wood"))
body.append(box(8.5, 29, COUNTER_Z[0], 22.8, 30, STOVE_Z[0], "harvest"))  # counter top
body.append(box(8.7, FLOOR + 1, 9.5, FURN_X[0], 28, 23.5, "avocado"))  # cupboard door
body.append(box(8.3, 25, 22.2, 8.7, 26.5, 23, "chrome"))
body.append(box(11, 30, 17.5, 20, 30.15, 23, "steel"))  # sink, behind the slot
body.append(box(15, 30.15, 19.8, 16, 30.2, 20.8, "black"))  # drain
body.append(box(20.5, 30, 19.5, 21.5, 34, 20.5, "chrome"))  # tap
body.append(box(17.5, 33, 19.5, 21.5, 34, 20.5, "chrome"))  # spout


# Every burner part stays outside the 7 px square around the cooktop middle (16, 32), the
# footprint of the widest decor item (ADR 0100). Decor now stands on a burner grate instead
# (ADR 0107), but the middle stays clear.
BURNER_SCALE = 0.6  # burner reach 2.85 * 0.6 = 1.71 px, so it fits between that square and the flange
GRATE_R = 2.7 * BURNER_SCALE  # half the burner grate's outer width


def burner(cx, cz, turn):
    """One gas burner: drip bowl, dark gap, head with its port band and top disc, a black grate
    ring, and six raised prongs turned by `turn` degrees. Widths scale by BURNER_SCALE, while
    heights and bar thickness stay."""
    k = BURNER_SCALE
    body.extend(disc("y", cx, 30, cz, 2.45 * k, 0.08, "panel", STEPS_16))  # drip bowl
    body.extend(disc("y", cx, 30.08, cz, 1.3 * k, 0.06, "grille", STEPS_16))  # gap around the head
    body.extend(disc("y", cx, 30.14, cz, 0.85 * k, 0.56, "hub", STEPS_8))  # head
    body.extend(disc("y", cx, 30.45, cz, 0.9 * k, 0.08, "grille", STEPS_8))  # port band
    body.extend(disc("y", cx, 30.7, cz, 0.5 * k, 0.1, "steel", STEPS_8))  # top disc
    side, t = 2.3 * k, 0.3
    for dx, dz in ((-1, 0), (1, 0), (0, -1), (0, 1)):  # grate ring
        mx, mz = cx + dx * (GRATE_R - t / 2), cz + dz * (GRATE_R - t / 2)
        hx, hz = (t / 2, side / 2) if dx else (side / 2, t / 2)
        body.append(box(mx - hx, 30.08, mz - hz, mx + hx, 30.4, mz + hz, "black"))
    d = 2.6 * k / math.sqrt(2)
    for dx, dz in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        mx, mz = cx + dx * d, cz + dz * d
        body.append(box(mx - t / 2, 30.08, mz - side / 2, mx + t / 2, 30.4, mz + side / 2, "black", [0, -dx * dz * 45, 0], [mx, 30.08, mz]))
    pivot = [cx, 30.4, cz]
    for n in range(6):  # prongs, laid out toward the aisle and turned into place
        rotation = [0, turn + 60 * n, 0]
        body.append(box(cx - 2.85 * k, 30.4, cz - 0.15, cx - 1.0 * k, 30.7, cz + 0.15, "black", rotation, pivot))
        body.append(box(cx - 2.85 * k, 30.4, cz - 0.15, cx - 2.45 * k, 30.95, cz + 0.15, "black", rotation, pivot))


# Stove (ADR 0100): the sink side is z 24, the far side z 39.5, the knobs face the aisle.
body.append(box(8.5, 29, STOVE_Z[0], 22.8, 30, STOVE_Z[1], "steel"))  # cooktop plate
body.append(box(8.3, 29.2, 24.2, 8.8, 30.2, 39.3, "chrome"))  # rolled front lip
body.append(box(8.8, 30, 39.1, 22.8, 30.3, 39.5, "steel"))  # far-side flange
body.append(box(8.8, 29.9, 24, 22.8, 30.2, 24.3, "chrome"))  # sink-side trim
body.append(box(21.7, 30, 31.6, 22.4, 30.4, 39.1, "steel"))  # rear strip, plain half
body.append(box(21.7, 29.95, 24.3, 22.4, 30.35, 31.6, "grille"))  # rear vent band
for k in range(12):
    z = 24.7 + 0.55 * k
    body.append(box(21.8, 30.35, z, 22.3, 30.38, z + 0.25, "black"))
body.append(box(22.4, 30, STOVE_Z[0], 22.8, 31, STOVE_Z[1], "ivory"))  # ledge at the wall
# Centered on the slot point in x; in z each pair sits between that square and the trim or flange.
for i, bx in enumerate((16 - 3.8, 16 + 3.8)):
    for j, bz in enumerate((26.6, 37.35)):
        burner(bx, bz, 30 * ((i + j) % 2))
# Control panel leaning back 20 degrees with five knobs toward the far end; the sink-side third
# stays blank.
# Every cube stays at x 8 or more before and after the lean, out of the aisle.
LEAN = ([0, 0, -20], [8.5, 26.6, 31.75])  # about its lower front edge, top toward the wall
body.append(box(8.5, 26.6, 24.2, 8.8, 29.2, 39.3, "harvest", *LEAN))
for y in (27.4, 28.4):  # woodgrain lines
    body.append(box(8.48, y, 24.2, 8.5, y + 0.1, 39.3, "wood", *LEAN))
KNOB_Y = 27.9


def knob_octagon(x0, x1, cz, half, color):
    """A knob part as an octagon about its own x axis, `half` from its center to each flat: a
    cross of two bars and the same cross turned 45 degrees. The turned cross pivots on the knob
    axis, so the sign of the game's x turn does not matter; it is moved by the gap between
    turning 20 degrees about that pivot and about the panel's lean pivot, so it leans with the
    rest of the panel (cube turns apply x before z)."""
    rotation, pivot = LEAN
    side = half * math.tan(math.pi / 8)
    s, c = math.sin(math.radians(rotation[2])), math.cos(math.radians(rotation[2]))
    up = KNOB_Y - pivot[1]  # the knob axis above the lean pivot
    dx, dy = -up * s, up * c - up
    axis = [pivot[0] + dx, KNOB_Y + dy, cz]
    for hy, hz in ((half, side), (side, half)):
        body.append(box(x0, KNOB_Y - hy, cz - hz, x1, KNOB_Y + hy, cz + hz, color, *LEAN))
        body.append(box(x0 + dx, axis[1] - hy, cz - hz, x1 + dx, axis[1] + hy, cz + hz, color, [45, 0, rotation[2]], axis))


for z in (29.9, 31.9, 33.9, 35.9, 37.9):
    knob_octagon(8.07, 8.5, z, 0.75, "black")
    knob_octagon(8.4, 8.5, z, 0.85, "chrome")  # skirt
    knob_octagon(8.02, 8.07, z, 0.5, "chrome")  # face cap
    body.append(box(8.0, 27.85, z - 0.45, 8.02, 27.95, z + 0.45, "black", *LEAN))  # pointer
body.append(box(8.45, 26.3, 24.2, 9.0, 26.6, 39.3, "chrome"))  # strip under the panel
# Oven: a chrome bar across the top of a brushed door in a stainless frame.
body.append(box(8.7, 26.1, 24.5, 9.0, 26.3, 39.0, "brown"))  # shadow line
body.append(box(8.1, 25.3, 25.0, 8.45, 25.8, 38.5, "chrome"))  # handle bar
for z in (25.3, 37.7):
    body.append(box(8.45, 25.4, z, 8.7, 25.7, z + 0.5, "chrome"))
body.append(box(8.6, 17, 24.5, 9.0, 26.1, 39.0, "steel"))  # door frame
body.append(box(8.5, 17.8, 25.5, 8.6, 24.8, 38.0, "chrome"))  # door face
body.append(box(8.9, FLOOR, 24.5, 9.0, FLOOR + 1, 39.0, "black"))  # toe kick
for z0, z1 in ((24.0, 24.4), (39.1, 39.5)):  # side trims down the range front
    body.append(box(8.5, FLOOR + 0.5, z0, 9.0, 29, z1, "steel"))
# Wall cabinet over the counter, up at the ceiling (cells z = -1 and -2; ADR 0103): 7 px high with
# its top at CEIL, so no decor stands on it.
CABINET_Y = (CEIL - 7, CEIL)
body.append(box(10, CABINET_Y[0], COUNTER_Z[0], 22.8, CABINET_Y[1], 37.5, "wood"))
for z0, z1 in ((9, 22.8), (23.2, 37)):
    body.append(box(9.7, CABINET_Y[0] + 0.5, z0, 10, CABINET_Y[1] - 0.5, z1, "avocado"))
for z in (21.5, 23.8):
    body.append(box(9.4, CABINET_Y[0] + 1, z, 9.7, CABINET_Y[0] + 2.5, z + 0.7, "chrome"))
# Shower-toilet room in the rear right corner (cell z = -3, two layers), door to the aisle.
SHOWER_Z = (40.5, 41.1)  # front partition, behind the window curtain (38 to 40.5)
body.append(box(8, FLOOR, SHOWER_Z[0], 22.8, CEIL - 0.2, SHOWER_Z[1], "ivory"))
body.append(box(8, FLOOR, SHOWER_Z[1], 8.6, CEIL - 0.2, 42, "ivory"))  # front jamb
body.append(box(8, FLOOR, 54, 8.6, CEIL - 0.2, 55.5, "ivory"))  # rear jamb, short of the rear wall
body.append(box(8, 52, 42, 8.6, CEIL - 0.2, 54, "ivory"))  # header
body.append(box(9, FLOOR, SHOWER_Z[1], 22.8, FLOOR + 0.3, 55.5, "white"))  # shower tray
body.append(box(10.5, FLOOR + 0.3, 52, 11.5, FLOOR + 0.35, 53, "black"))  # drain
body.append(box(14, FLOOR, 45.5, 20, 22, 50.5, "white"))  # toilet bowl
body.append(box(13, 22, 45, 20, 23, 51, "ivory"))  # seat, 7 px up like the dinette
body.append(box(19, 23, 45, 19.5, 31, 51, "ivory"))  # raised lid
body.append(box(19.5, 26, 44.5, 22.6, 34, 51.5, "white"))  # tank
body.append(box(21.5, 46, 53, 22.8, 47, 54.5, "chrome"))  # shower arm
body.append(box(19.5, 44.5, 52.5, 21.5, 46, 55, "chrome"))  # shower head
# The door is its own bone, hinged on its rear edge at the aisle face; it stays closed here.
shower_door = [box(8, FLOOR + 0.5, 42.1, 8.6, 51.9, 53.9, "wood")]
shower_door.append(box(7.4, 32, 43, 8, 33, 44.5, "chrome"))  # handle outside
shower_door.append(box(8.6, 32, 43, 9.2, 33, 44.5, "chrome"))  # handle inside
SHOWER_HINGE = [8, 0, 54]
# Ceiling hook above the dinette table (cell x = 1, z = 0, layer 2): a cord and a hook run from
# the ceiling plate down to the top of that cell, where a hanging decor item's top sits. The
# block model stays inside the cell, so the model draws the part above it (ADR 0099).
HOOK_CELL_TOP = 3 * 16  # the top of layer 2
body.append(box(-17, CEIL - 0.4, -1, -15, CEIL - 0.2, 1, "chrome"))  # base plate
body.append(box(-16.2, HOOK_CELL_TOP + 1.5, -0.2, -15.8, CEIL - 0.4, 0.2, "ivory"))  # cord
body.append(box(-16.5, HOOK_CELL_TOP, -0.5, -15.5, HOOK_CELL_TOP + 1.5, 0.5, "chrome"))  # hook
seat0 = bucket_seat(7, 18)
seat1 = bucket_seat(-18, -7)

# Facing dinette on the left behind the passenger: seat 2 faces the rear, seat 3 forward,
# with the table between them in the middle cell (seats 2 and 3 of minecraft:rideable).
DIN_X = (-HW + 1, -8)
seat2 = [box(DIN_X[0], FLOOR, -23, DIN_X[1], FLOOR + 7, -10, "tweed"),
         box(DIN_X[0], FLOOR + 7, -24, DIN_X[1], FLOOR + 20, -21.5, "tweed")]
seat3 = [box(DIN_X[0], FLOOR, 10, DIN_X[1], FLOOR + 7, 23, "tweed"),
         box(DIN_X[0], FLOOR + 7, 21.5, DIN_X[1], FLOOR + 20, 24, "tweed")]
body.append(box(DIN_X[0], FLOOR + 11, -6, -9, FLOOR + 12, 6, "wood"))  # table
body.append(box(-15, FLOOR, -1, -13, FLOOR + 11, 1, "chrome"))

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
# Raised and laid back with the front seats so its lower rim clears the cushion and its
# upper rim stays under the driver's line of sight to the windshield's lower frame.
STEERING_PIVOT, STEERING_LEAN = [12, 33, FRONT + 15], 65
# Where the spray leaves: the middle of the underside of the shower head that 2/9 modeled on the
# shower-toilet's rear wall, so the water comes out of the visible head (ADR 0094).
SHOWER_HEAD = [20.5, 44.5, 53.75]


def moved(cube, offset):
    """A copy of cube with its origin and pivot moved by offset."""
    copy = dict(cube)
    copy["origin"] = [v + d for v, d in zip(cube["origin"], offset)]
    if "pivot" in cube:
        copy["pivot"] = [v + d for v, d in zip(cube["pivot"], offset)]
    return copy


def carve(cube, hole):
    """Pieces of an unrotated cube outside the box hole = (x0, y0, z0, x1, y1, z1)."""
    lo = cube["origin"]
    hi = [o + d for o, d in zip(lo, cube["size"])]
    if "rotation" in cube or any(hi[i] <= hole[i] or lo[i] >= hole[i + 3] for i in range(3)):
        return [cube]
    pieces, a, b = [], list(lo), list(hi)
    for axis in range(3):
        if a[axis] < hole[axis]:
            pieces.append((list(a), [*b[:axis], hole[axis], *b[axis + 1:]]))
            a[axis] = hole[axis]
        if b[axis] > hole[axis + 3]:
            pieces.append(([*a[:axis], hole[axis + 3], *a[axis + 1:]], list(b)))
            b[axis] = hole[axis + 3]
    out = []
    for p0, p1 in pieces:
        piece = json.loads(json.dumps(cube))
        piece["origin"] = [round(v, 3) for v in p0]
        piece["size"] = [round(v1 - v0, 3) for v0, v1 in zip(p0, p1)]
        out.append(piece)
    return out


# The arches rise above the floor. Thin panels enclose them inside without
# closing the exterior arches; the floor and furniture must leave room for the panels.
for sgn in (1, -1):
    for a0, a1 in ARCHES:
        x_room, x_dark, x_wheel, x_wall = (sgn * (HW - d) for d in (5.7, 5.4, 5.1, 1))
        hole = (min(x_room, x_wall), -99, a0 - 0.3, max(x_room, x_wall), ARCH_TOP + 0.8, a1 + 0.3)
        body = [p for c in body for p in carve(c, hole)]
        seat2 = [p for c in seat2 for p in carve(c, hole)]
        seat3 = [p for c in seat3 for p in carve(c, hole)]
        body.append(box(x_dark, 7, a0, x_wheel, ARCH_TOP + 0.5, a1, "black"))
        body.append(box(x_dark, ARCH_TOP, a0, x_wall, ARCH_TOP + 0.5, a1, "black"))
        for e0, e1 in ((a0, a0 + 0.3), (a1 - 0.3, a1)):
            body.append(box(x_wheel, 13, e0, x_wall, ARCH_TOP, e1, "black"))
        body.append(box(x_room, FLOOR, a0 - 0.3, x_dark, ARCH_TOP + 0.8, a1 + 0.3, "wood"))
        body.append(box(x_room, ARCH_TOP + 0.5, a0 - 0.3, x_wall, ARCH_TOP + 0.8, a1 + 0.3, "wood"))
        for e0, e1 in ((a0 - 0.3, a0), (a1, a1 + 0.3)):
            body.append(box(x_dark, 13, e0, x_wall, ARCH_TOP + 0.5, e1, "wood"))

# Extract lenses after shaping the nose so they follow the same taper as the lamp pods.
lens_slot = SLOTS.index("lens")
headlights = [c for c in body if c["uv"]["north"]["uv"][0] == lens_slot]
body = [c for c in body if c["uv"]["north"]["uv"][0] != lens_slot]

# Glass gets its own bones, listed last, so only glass is alpha-blended and it draws after the
# opaque interior. Blending the whole model let a near pane drawn early hide the cabin behind it
# and show the terrain on the far side (ADR 0091).
glass_slot = SLOTS.index("glass")
glass = [c for c in body if c["uv"]["north"]["uv"][0] == glass_slot]
body = [c for c in body if c["uv"]["north"]["uv"][0] != glass_slot]
door_glass = [c for c in door if c["uv"]["north"]["uv"][0] == glass_slot]
door = [c for c in door if c["uv"]["north"]["uv"][0] != glass_slot]

camper_bones = [
    {"name": "root", "pivot": [0, 0, 0]},
    {"name": "body", "parent": "root", "pivot": [0, 0, 0], "cubes": body,
     "locators": {**hover, "exhaust": [-12, 4, REAR - 4], "shower_head": SHOWER_HEAD}},
    {"name": "headlights", "parent": "body", "pivot": [0, 0, 0], "cubes": headlights},
    *wheels,
    *[{"name": f"seat_{i}", "parent": "body", "pivot": [0, FLOOR, 0], "cubes": cubes}
      for i, cubes in enumerate((seat0, seat1, seat2, seat3))],
    {"name": "door_entry", "parent": "body", "pivot": DOOR_HINGE, "cubes": door},
    {"name": "steering", "parent": "body", "pivot": STEERING_PIVOT, "rotation": [STEERING_LEAN, 0, 0],
     "cubes": [moved(c, STEERING_PIVOT) for c in steering]},
    {"name": "shower_door", "parent": "body", "pivot": SHOWER_HINGE, "cubes": shower_door},
    {"name": "glass", "parent": "body", "pivot": [0, 0, 0], "cubes": glass},
    {"name": "door_glass", "parent": "door_entry", "pivot": DOOR_HINGE, "cubes": door_glass},
]


def mirror_x(bones):
    """Mirror the building frame (+x right) into the game's frame (+x left)."""
    for bone in bones:
        bone["pivot"] = [-bone["pivot"][0], *bone["pivot"][1:]]
        for name, (x, y, z) in bone.get("locators", {}).items():
            bone["locators"][name] = [-x, y, z]
        if "rotation" in bone:
            rx, ry, rz = bone["rotation"]
            bone["rotation"] = [rx, -ry, -rz]
        for c in bone.get("cubes", []):
            c["origin"] = [-(c["origin"][0] + c["size"][0]), *c["origin"][1:]]
            if "pivot" in c:
                c["pivot"] = [-c["pivot"][0], *c["pivot"][1:]]
                rx, ry, rz = c["rotation"]
                # A mirror negates y and z turns, but the game turns z the other way from
                # the right-handed math these cubes are built with, so z stays as written
                # (the sports boat generator keeps z for the same reason, ADR 0058).
                c["rotation"] = [rx, -ry, rz]
    return bones


def rounded(value):
    """Drop floating-point noise and normalize negative zero before writing."""
    if isinstance(value, float):
        return round(value, 3) + 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


mirror_x(camper_bones)
geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [{
        "description": {
            "identifier": "geometry.yasu_ride.camper",
            "texture_width": len(SLOTS), "texture_height": 1,
            "visible_bounds_width": 10, "visible_bounds_height": 5,
            "visible_bounds_offset": [0, 1.5, 0],
        },
        "bones": camper_bones,
    }],
}
MODELS.mkdir(parents=True, exist_ok=True)
(MODELS / "camper.geo.json").write_text(json.dumps(rounded(geo), separators=(",", ":")))


def png(path, width, height, pixel):
    raw = b"".join(b"\x00" + b"".join(bytes(pixel(x, y)) for x in range(width)) for y in range(height))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def scale(color, factor):
    return tuple(max(0, min(255, math.floor(c * factor + 0.5))) for c in color)


ENTITY_TEXTURES.mkdir(parents=True, exist_ok=True)
for paint, base in ACCENT_BASES.items():
    colors = dict(PALETTE)
    if paint != "khaki":
        colors.update(khaki=(*scale(base, 0.85), 255), stripe=(*scale(base, 0.65), 255), tan=(*base, 255))
    name = "camper" if paint == "khaki" else f"camper_{paint}"
    png(ENTITY_TEXTURES / f"{name}.png", len(SLOTS), 1, lambda x, y: colors[SLOTS[x]])

ICON = [
    "................",
    "................",
    ".OOOOOOOOOOOOO..",
    ".OWWWWWWWWWWWWO.",
    ".OKKKKKKKKKGGGO.",
    ".OKGGKKGGKKGGGO.",
    ".OKGGKKGGKKWWWO.",
    ".OWWWWWWWWWWWWO.",
    ".OSSSSSSSSSSSSO.",
    ".OWWWWWWWWWWWWO.",
    ".OTTTTTTTTTTTTO.",
    ".OOBBBOOOOOBBBO.",
    "...BBB.....BBB..",
    "................",
    "................",
    "................",
]
ICON_COLORS = {"W": PALETTE["white"], "K": PALETTE["khaki"], "G": (70, 86, 96, 255),
               "S": PALETTE["stripe"], "T": PALETTE["tan"], "B": (28, 28, 30, 255),
               "O": (60, 60, 60, 255), ".": (0, 0, 0, 0)}
ITEM_TEXTURES.mkdir(parents=True, exist_ok=True)
png(ITEM_TEXTURES / "camper_item.png", 16, 16, lambda x, y: ICON_COLORS[ICON[y][x]])
# The camping gear box a player gets with their first camper (ADR 0093), in the 1970s palette of #347.
BOX_ICON = [
    "................",
    "................",
    "................",
    "..LLLLLLLLLLLL..",
    ".LLLLLLLLLLLLLL.",
    ".OOOOOOOOOOOOOO.",
    ".CCCCCCCCCCCCCC.",
    ".CCCCCCCCCCCCCC.",
    ".GGGGGGGGGGGGGG.",
    ".RRRRRRRRRRRRRR.",
    ".AAAAAAAAAAAAAA.",
    ".CCCCCCCCCCCCCC.",
    ".CCCCCCCCCCCCCC.",
    ".OOOOOOOOOOOOOO.",
    "................",
    "................",
]
BOX_ICON_COLORS = {"L": (222, 184, 135, 255), "C": (196, 150, 98, 255), "O": (110, 74, 40, 255),
                   "G": (218, 165, 32, 255), "R": (204, 85, 0, 255), "A": (86, 130, 3, 255),
                   ".": (0, 0, 0, 0)}
png(ITEM_TEXTURES / "camping_gear_box.png", 16, 16, lambda x, y: BOX_ICON_COLORS[BOX_ICON[y][x]])
print("cubes:", sum(len(b.get("cubes", [])) for b in camper_bones))
