"""SUV front end: the eight-slot grille, round headlamps, marker lamps, and the winch bumper.

The grille has eight slots and no logo, vehicle name or lettering (ADR 0009).
"""

import math

from tool_loader import load_tool

kit_module = load_tool("suv_kit")
kit = kit_module.kit
box, beam, oriented = kit.box, kit.beam, kit.oriented
rx, ry = kit_module.rx, kit_module.ry
GRILLE_SLOTS = 8


def grille():
    """The grille surround with eight tall dark slots."""
    kit.rounded_rect("z", -0.631, -0.735, 0.735, 0.98, 1.493, 0.095, 0.045, "dark", 6)
    kit.rounded_rect("z", -0.658, -0.718, 0.718, 1.002, 1.476, 0.080, 0.012, "body", 6)
    for k in range(GRILLE_SLOTS):
        x = -0.414 + k * (0.828 / (GRILLE_SLOTS - 1))
        kit.rounded_rect("z", -0.672, x - 0.047, x + 0.047, 1.04, 1.434, 0.016, 0.012, "grille", 3)


def headlamps_and_markers():
    """The headlamp housings (the lens and bezel panels come from suv_lamps.py), and the front overfender block with its marker lamp: the lens bottom edge is level
    with the headlamp bottom edge (y 1.181), with an amber turn-signal section at the outboard end that
    wraps the corner."""
    for s in (-1, 1):
        kit.face_disc("z", (s * 0.589, 1.31, -0.67), 0.129, -0.691, -0.677, "dark", 16)
        box(min(s * 0.755, s * 1.13), max(s * 0.755, s * 1.13), 1.10, 1.26, -0.67, -0.59, "body")
        box(min(s * 0.785, s * 1.125), max(s * 0.785, s * 1.125), 1.165, 1.255, -0.676, -0.670, "dark")
        with kit.bone("headlights"):
            box(min(s * 0.80, s * 0.985), max(s * 0.80, s * 0.985), 1.181, 1.247, -0.683, -0.676, "lamp")
        box(min(s * 0.985, s * 1.108), max(s * 0.985, s * 1.108), 1.181, 1.247, -0.683, -0.676, "amber")
        box(min(s * 1.130, s * 1.136), max(s * 1.130, s * 1.136), 1.181, 1.247, -0.670, -0.610, "amber")


# The bumper stands this much further back than in the reference model, so that the winch plate, the
# farthest-forward part, stays within SUV_SPEC.bodyFront while the windshield is far enough ahead of
# the front riders' heads (ADR 0214). It keeps the front overhang within the photos' 0.95 to 1.0 D.
BUMPER_SETBACK = 0.055


def bumper():
    """A winch bumper with open wings and inset fog pods."""
    b = BUMPER_SETBACK
    kit.rounded_rect("z", -0.88 + b, -0.44, 0.44, 0.66, 0.88, 0.055, 0.27, "dark", 4)
    for s in (-1, 1):
        beam((s * 0.40, 0.865, -0.90 + b), (s * 1.035, 0.865, -0.86 + b), 0.065, 0.16, "dark")
        beam((s * 0.40, 0.685, -0.91 + b), (s * 0.99, 0.685, -0.87 + b), 0.060, 0.16, "dark")
        beam((s * 1.015, 0.70, -0.87 + b), (s * 1.06, 0.83, -0.87 + b), 0.065, 0.14, "dark")
        oriented((s * 0.67, 0.765, -0.91 + b), (0.25, 0.125, 0.13), ry(math.radians(s * 8)), "dark")
        with kit.bone("headlights"):
            kit.face_disc("z", (s * 0.69, 0.772, -0.99 + b), 0.055, -0.996 + b, -0.986 + b, "lamp", 12)
        box(min(s * 0.40, s * 0.445), max(s * 0.40, s * 0.445), 0.895, 0.965, -0.90 + b, -0.84 + b, "rim")
    kit.rounded_rect("z", -1.020 + b, -0.17, 0.17, 0.744, 0.815, 0.028, 0.015, "rim", 4)
    kit.rounded_rect("z", -1.030 + b, -0.13, 0.13, 0.759, 0.795, 0.014, 0.006, "dark", 3)
    box(-0.18, 0.18, 0.89, 0.97, -0.83 + b, -0.69 + b, "dark")
    oriented((0, 1.005, -0.74 + b), (0.30, 0.07, 0.12), rx(math.radians(18)), "dark")
