"""Metalness, emissivity and roughness values for texture maps."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Mer:
    metalness: int
    emissive: int
    roughness: int

    def __post_init__(self):
        if any(not isinstance(value, int) or not 0 <= value <= 255
               for value in (self.metalness, self.emissive, self.roughness)):
            raise ValueError("MER channels must be integers between 0 and 255")

    def rgba(self):
        return (self.metalness, self.emissive, self.roughness, 255)


MER_OFF = Mer(0, 0, 255)
MER_LIT = Mer(0, 255, 255)


def mer_painter(lookup, default=MER_OFF):
    def pixel(x, y):
        value = lookup(x, y)
        return (default if value is None else value).rgba()
    return pixel
