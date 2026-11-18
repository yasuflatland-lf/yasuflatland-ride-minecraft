"""Shared scooter ground speed bands and recorded Vespa engine clips."""

from dataclasses import dataclass


ENGINE_OVERLAP_SECONDS = 0.05


@dataclass(frozen=True)
class SpeedBand:
    """Value object: ground speed in blocks/s, lower inclusive, upper exclusive."""

    index: int
    lower: float
    upper: float | None


_BAND_LOWERS = (0.0, 1.0, 4.5, 8.0, 11.5, 15.0)
SPEED_BANDS: tuple[SpeedBand, ...] = tuple(
    SpeedBand(index, lower, upper)
    for index, (lower, upper) in enumerate(zip(_BAND_LOWERS, (*_BAND_LOWERS[1:], None)))
)


def band_condition(band: SpeedBand) -> str:
    """Molang gate: rider, road form, and the speed range."""
    conditions = ["query.has_rider", "query.property('yasu_ride:form') == 'car'"]
    if band.index != 0:
        conditions.append(f"query.ground_speed >= {band.lower:g}")
    if band.upper is not None:
        conditions.append(f"query.ground_speed < {band.upper:g}")
    return " && ".join(conditions)


@dataclass(frozen=True)
class EngineClip:
    index: int
    seconds: float
    volume: float

    clip_seconds: float


ENGINE_CLIPS: tuple[EngineClip, ...] = (
    EngineClip(0, 2.226167, 0.5, 2.226167),
    EngineClip(1, 1.0, 0.54, 1.0 + ENGINE_OVERLAP_SECONDS),
    EngineClip(2, 1.0, 0.58, 1.0 + ENGINE_OVERLAP_SECONDS),
    EngineClip(3, 1.0, 0.62, 1.0 + ENGINE_OVERLAP_SECONDS),
    EngineClip(4, 1.0, 0.66, 1.0 + ENGINE_OVERLAP_SECONDS),
    EngineClip(5, 1.0, 0.70, 1.0 + ENGINE_OVERLAP_SECONDS),
)


def engine_effect(index: int) -> str:
    return f"scooter_engine_{index}"
