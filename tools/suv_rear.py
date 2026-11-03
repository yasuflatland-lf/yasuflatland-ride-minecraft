"""SUV rear end: bumper, tail lamps, licence plate, tow hooks and the spare carrier.

Lengths are in tyre diameters D (see suv_kit.py).
"""

import math

from tool_loader import load_tool

kit_module = load_tool("suv_kit")
kit = kit_module.kit
box, oriented = kit.box, kit.oriented
ry = kit_module.ry


def bumper_and_lamps():
    """A sculpted rear bumper with tapered end caps and an inset blank plate area, and the tail lamps."""
    kit.rounded_rect("z", 3.65, -0.96, 0.96, 0.64, 0.81, 0.045, 0.18, "dark", 4)
    for s in (-1, 1):
        oriented((s * 0.87, 0.74, 3.68), (0.22, 0.15, 0.30), ry(math.radians(s * 12)), "dark")  # clear of the spinning tyres
        kit.rounded_rect("z", 3.748, min(s * 0.65, s * 0.90), max(s * 0.65, s * 0.90), 0.68, 0.775, 0.025, 0.012, "tire", 3)
        x = s * 0.645
        kit.rounded_rect("z", 3.59, x - 0.098, x + 0.098, 1.08, 1.345, 0.025, 0.075, "dark", 4)
        kit.rounded_rect("z", 3.632, x - 0.083, x + 0.083, 1.095, 1.33, 0.019, 0.009, "rim", 3)
        kit.rounded_rect("z", 3.64, x - 0.062, x + 0.062, 1.118, 1.306, 0.010, 0.006, "dark", 3)
    box(0.48, 0.489, 0.83, 1.39, 3.566, 3.572, "dark")
    box(-0.48, 0.48, 0.83, 0.837, 3.566, 3.572, "dark")
    for y in (0.96, 1.25):
        box(0.44, 0.55, y, y + 0.04, 3.57, 3.60, "body")
    kit.face_disc("x", (-0.77, 1.30, 3.42), 0.085, -0.785, -0.773, "dark", 12)


def spare_carrier():
    """The spare's carrier: a hinge plate flush behind the tailgate and a lower support under the spare. The spare's
    front face stands 3.585 D from the front axle, clear of the tailgate, the rear window and the bumper (ADR 0214)."""
    box(-0.15, 0.15, 1.03, 1.41, 3.56, 3.57, "dark")
    box(-0.16, 0.16, 0.77, 0.80, 3.56, 3.77, "dark")
