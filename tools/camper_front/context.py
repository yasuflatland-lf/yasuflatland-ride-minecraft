"""Dimensions, helpers and ordered staging buffers shared by front zones."""

from dataclasses import dataclass, field
from typing import Any, Callable

from .shape import FrontShape, ridge_dz

# Sill geometry hood.py builds: the top drops this far toward the nose, and the center
# rib stands this far above the white top.
SILL_DROP = 1.5
SILL_RIB_RISE = 0.35


@dataclass(frozen=True)
class FrontContext:
    HW: float
    FW: float
    FRONT: float
    WS_Z: float
    SILL: float
    SILL_LOW: float
    ROOF: float
    UPPER: tuple[float, float]
    LOWER_Y: tuple[float, float]
    BOTTOM: float
    SIDE0: float
    TOP_FRONT: float
    CORNER: float
    SLAT_Y: list[float]
    SLICE: float
    BOLT_REGION: Any
    body: list[dict]
    ATLAS: Any
    box: Callable
    panel: Callable
    disc: Callable
    rib_sides: Callable
    shift_in_slices: Callable
    shape: FrontShape
    front: list[dict] = field(default_factory=list)
    grille_corners: dict[int, list[dict]] = field(default_factory=dict)
    glass_corners: dict[int, list[dict]] = field(default_factory=dict)

    def corner(self, sx, z, y0, y1, color, inset=0.0):
        cx, cz = sx * (self.FW + 1.5), z + 1.5
        return self.box(cx - self.CORNER / 2, y0, cz - 0.5 - inset,
                        cx + self.CORNER / 2, y1, cz + 0.5 - inset,
                        color, [0, -sx * 45, 0], [cx, 0, cz])

    def sill_top_y(self, x, z):
        """Height of the sloping sill's white top at world (x, z), as hood.py builds it."""
        edge_y = getattr(self.shape, "hood_edge_y", self.UPPER[0])
        ridge = getattr(self.shape, "grille_ridge_px", 0.0)
        nose = (self.FRONT + self.shape.lean_dz(edge_y) + ridge_dz(x, ridge, self.HW)
                + max(0, abs(x) - self.FW))
        return self.SILL - SILL_DROP * (self.WS_Z - z) / (self.WS_Z - nose)
