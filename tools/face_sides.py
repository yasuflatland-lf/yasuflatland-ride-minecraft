"""Shared cube face locations and outward corner order (ADR 0259)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class FaceSide:
    name: str
    axis: int
    end: int

    @property
    def sign(self) -> int:
        return 1 if self.end else -1

    @property
    def normal(self) -> tuple[int, int, int]:
        return tuple(self.sign if axis == self.axis else 0 for axis in range(3))


FACE_SIDES = (
    FaceSide("north", 2, 0),
    FaceSide("south", 2, 1),
    FaceSide("east", 0, 0),
    FaceSide("west", 0, 1),
    FaceSide("up", 1, 1),
    FaceSide("down", 1, 0),
)
_BY_NAME = {side.name: side for side in FACE_SIDES}
_CORNER_ORDER = {
    "north": (0, 2, 3, 1),
    "south": (4, 5, 7, 6),
    "east": (0, 4, 6, 2),
    "west": (1, 3, 7, 5),
    "up": (2, 6, 7, 3),
    "down": (0, 1, 5, 4),
}


def face_side(name: str) -> FaceSide:
    return _BY_NAME[name]


def quad(side: FaceSide, lo, hi) -> list[tuple[float, float, float]]:
    return [
        tuple(hi[axis] if corner & (1 << axis) else lo[axis] for axis in range(3))
        for corner in _CORNER_ORDER[side.name]
    ]
