"""Path-free values shared by camping gear builders and orchestration."""

from dataclasses import dataclass


@dataclass(frozen=True)
class GearSpec:
    id: str
    width_px: float
    height_px: float
    glass: bool
    hanging: bool

    @classmethod
    def from_row(cls, row):
        return cls(*(row[key] for key in ("id", "width_px", "height_px", "glass", "hanging")))


@dataclass(frozen=True)
class GearModel:
    cubes: tuple[dict, ...]
    texture_request: tuple[str, ...]
