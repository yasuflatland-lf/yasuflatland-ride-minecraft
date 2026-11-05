"""SUV rear end: bumper, tail lamps, fuel door and the spare carrier.

Lengths are in tyre diameters D (see suv_kit.py).
"""

import math

from tool_loader import load_tool

kit_module = load_tool("suv_kit")
kit = kit_module.kit
box, oriented = kit.box, kit.oriented
ry = kit_module.ry


# The rear bumper in D, measured on the Rubicon photos and adjusted by eye in the preview (ADR 0225). Its underside
# stays at about the rock rails' top. The notch lets the spare's lower edge sit below the bumper's top.
BUMPER_TOP = 0.92
BUMPER_BOTTOM = 0.72
BUMPER_FACE_BOTTOM = 0.745
NOTCH_FLOOR = 0.765
NOTCH_HALF_FLOOR = 0.31
NOTCH_HALF_SPREAD = 0.08
NOTCH_STEPS = 5
BUMPER_FACE_HALF = 0.74
BUMPER_FACE_Z = (3.56, 3.74)
# The corner's front edge follows the road tyre's arc: forward under the overfender's end, back at the bottom.
CORNER_X = (0.66, 0.83)
CORNER_TOP = 0.91
CORNER_REAR_Z = 3.61
CORNER_SLICES = 10


def corner_front_z(y):
    return 3.53 - (y - 0.64) * 0.15 / 0.27


def side_box(s, a0, a1, y0, y1, z0, z1, color):
    """A box between the distances a0 and a1 from the centre line on side s."""
    box(min(s * a0, s * a1), max(s * a0, s * a1), y0, y1, z0, z1, color)


def panel_outline(s, a0, a1, y0, y1):
    """A panel drawn as a thin outline only, so it reads as the shallow inset on the photos, not a dark hole."""
    w = 0.007
    z0, z1 = BUMPER_FACE_Z[1], BUMPER_FACE_Z[1] + 0.004
    side_box(s, a0, a1, y0, y0 + w, z0, z1, "tire")
    side_box(s, a0, a1, y1 - w, y1, z0, z1, "tire")
    side_box(s, a0, a0 + w, y0, y1, z0, z1, "tire")
    side_box(s, a1 - w, a1, y0, y1, z0, z1, "tire")


def bumper():
    """The bumper: a notched face, a set-back lower lip, tapered ends and corners running under the overfenders."""
    z0, z1 = BUMPER_FACE_Z
    half = BUMPER_FACE_HALF
    box(-half, half, BUMPER_BOTTOM, BUMPER_FACE_BOTTOM, z0, z1 - 0.015, "dark")
    box(-half, half, BUMPER_FACE_BOTTOM, NOTCH_FLOOR, z0, z1, "dark")
    for s in (-1, 1):
        for i in range(NOTCH_STEPS):
            y0 = NOTCH_FLOOR + (BUMPER_TOP - NOTCH_FLOOR) * i / NOTCH_STEPS
            y1 = NOTCH_FLOOR + (BUMPER_TOP - NOTCH_FLOOR) * (i + 1) / NOTCH_STEPS
            inner = NOTCH_HALF_FLOOR + NOTCH_HALF_SPREAD * (i + 1) / NOTCH_STEPS
            side_box(s, inner, half, y0, y1, z0, z1, "dark")
        side_box(s, half - 0.005, half + 0.005, BUMPER_FACE_BOTTOM, BUMPER_TOP, z1, z1 + 0.005, "tire")
        panel_outline(s, 0.42, 0.49, 0.81, 0.89)
        panel_outline(s, 0.52, 0.70, 0.765, 0.885)
        oriented((s * 0.79, (BUMPER_BOTTOM + BUMPER_TOP) / 2, 3.647),
                 (0.115, BUMPER_TOP - BUMPER_BOTTOM, 0.15), ry(math.radians(s * 18)), "dark")
        for i in range(CORNER_SLICES):
            y0 = BUMPER_BOTTOM + (CORNER_TOP - BUMPER_BOTTOM) * i / CORNER_SLICES
            y1 = BUMPER_BOTTOM + (CORNER_TOP - BUMPER_BOTTOM) * (i + 1) / CORNER_SLICES
            side_box(s, *CORNER_X, y0, y1, corner_front_z((y0 + y1) / 2), CORNER_REAR_Z, "dark")


def fuel_door():
    """A round filler door on the vehicle's left, clear of the overfender, without the logo of the photos."""
    center = (0.77, 1.30, 3.39)
    for radius, outer, color in ((0.085, 0.766, "dark"), (0.066, 0.768, "tire"), (0.05, 0.770, "dark")):
        kit.face_disc("x", center, radius, 0.756, outer, color, 12)


def bumper_and_lamps():
    """The rear bumper, the tail lamps and the fuel door."""
    bumper()
    for s in (-1, 1):
        x = s * 0.645
        kit.rounded_rect("z", 3.59, x - 0.098, x + 0.098, 1.08, 1.345, 0.025, 0.075, "dark", 4)
        kit.rounded_rect("z", 3.632, x - 0.083, x + 0.083, 1.095, 1.33, 0.019, 0.009, "rim", 3)
        kit.rounded_rect("z", 3.64, x - 0.062, x + 0.062, 1.118, 1.306, 0.010, 0.006, "dark", 3)
    box(0.48, 0.489, 0.83, 1.39, 3.566, 3.572, "dark")
    box(-0.48, 0.48, 0.83, 0.837, 3.566, 3.572, "dark")
    for y in (0.96, 1.25):
        box(0.44, 0.55, y, y + 0.04, 3.57, 3.60, "body")
    fuel_door()


def spare_carrier():
    """The spare's carrier: a hinge plate flush behind the tailgate. The spare's
    front face stands 3.585 D from the front axle, clear of the tailgate, the rear window and the bumper (ADR 0214)."""
    box(-0.15, 0.15, 1.03, 1.41, 3.56, 3.57, "dark")
