"""Numeric front profile, independent of geometry and atlas state."""

from dataclasses import dataclass
from math import radians, tan


SILL_LOW = 33  # the front face and corners stop here; the sloping sill caps them
GRILLE_STEP = 0.5


@dataclass(frozen=True)
class FrontShape:
    windshield_ridge_px: float = 0.0
    cap_ridge_px: float = 0.0
    grille_ridge_px: float = 2.0
    lean_deg: float = 5.0
    hood_edge_y: float = SILL_LOW
    grille_half_span: float = 19.5

    def lean_dz(self, y):
        return lean_dz(y, self)


def lean_dz(y, shape=FrontShape()):
    return -(y - shape.hood_edge_y) * tan(radians(shape.lean_deg))


def ridge_dz(x, ridge_px, half_span):
    if ridge_px == 0:
        return 0.0
    return -ridge_px * (1 - abs(x) / half_span)
