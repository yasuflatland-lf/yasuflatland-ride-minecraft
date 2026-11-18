"""Recorded Vespa engine clips indexed by the ground speed bands in scooter.ac.json."""

from dataclasses import dataclass


ENGINE_OVERLAP_SECONDS = 0.05


@dataclass(frozen=True)
class EngineClip:
    index: int
    seconds: float
    volume: float

    clip_seconds: float


# Band lower bounds in blocks/s: 0, 1, 4.5, 8, 11.5 and 15.
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
