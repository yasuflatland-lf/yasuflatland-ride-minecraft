"""Numeric front profile, independent of geometry and atlas state."""

from dataclasses import dataclass


@dataclass(frozen=True)
class FrontShape:
    windshield_ridge_px: float = 0.0
    cap_ridge_px: float = 0.0
    grille_ridge_px: float = 0.0
    # Reserved for the constant-angle profile; the legacy curve remains in use.
    lean_deg: float = 0.0
    taper_px: float = 2.0
    upper_y: float = 18
    bottom_y: float = 8

    def lean_dz(self, y):
        return lean_dz(y, self)


def lean_dz(y, shape=FrontShape()):
    taper_px, upper_y, bottom_y = shape.taper_px, shape.upper_y, shape.bottom_y
    # Full overhang from the upper grille up; the lamp panel and lower grille below it
    # lean back toward the bumper, as on the front-corner photo.
    if y >= upper_y:
        return -taper_px
    return -taper_px + (taper_px + 0.5) * (upper_y - y) / (upper_y - bottom_y)


def ridge_dz(x, ridge_px, half_span):
    if ridge_px == 0:
        return 0.0
    return -ridge_px * (1 - abs(x) / half_span)
