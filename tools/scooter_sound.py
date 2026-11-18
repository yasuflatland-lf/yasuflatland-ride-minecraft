"""Recorded Vespa engine clips indexed by the ground speed bands in scooter.ac.json."""

from dataclasses import dataclass


@dataclass(frozen=True)
class EngineClip:
    index: int
    seconds: float
    volume: float


# Band lower bounds in blocks/s: 0, 1, 4.5, 8, 11.5 and 15.
ENGINE_CLIPS: tuple[EngineClip, ...] = (
    EngineClip(0, 2.226167, 0.5),
    EngineClip(1, 1.0, 0.54),
    EngineClip(2, 1.0, 0.58),
    EngineClip(3, 1.0, 0.62),
    EngineClip(4, 1.0, 0.66),
    EngineClip(5, 1.0, 0.70),
)


def engine_effect(index: int) -> str:
    return f"scooter_engine_{index}"
