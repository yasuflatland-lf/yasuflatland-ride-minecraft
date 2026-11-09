"""Periodic wicker texels for furniture generators, without image dependencies."""

from dataclasses import dataclass
from random import Random
from typing import Literal


@dataclass(frozen=True)
class WeavePalette:
    strand: tuple[int, int, int]
    light: tuple[int, int, int]
    dark: tuple[int, int, int]
    gap: tuple[int, int, int]


# Actual RGB samples at the 50th, 85th, 25th and 5th brightness percentiles
# of daining_table_texture_closeup.png and sofa_textue.png, respectively.
PALETTE_BLACK = WeavePalette((38, 45, 46), (58, 64, 66), (27, 35, 36), (17, 24, 25))
PALETTE_AMBER = WeavePalette((166, 131, 90), (198, 181, 158), (131, 98, 64), (55, 42, 36))


def weave_tile(
    palette: WeavePalette,
    size: int = 16,
    *,
    seed: int = 0,
    direction: Literal["horizontal", "vertical"] = "horizontal",
) -> list[list[tuple[int, int, int, int]]]:
    """Return opaque, palette-only RGBA rows with matching opposite edges.

    Flat horizontal ribbons alternate over and under narrow vertical cords.
    Fine ribs and seeded broad shading use the same repeat as the crossings.
    Write with texture_io.Outputs.png(..., lambda x, y: tile[y][x]).
    """
    if not isinstance(size, int) or isinstance(size, bool) or size < 1:
        raise ValueError("size must be a positive integer")
    if direction not in ("horizontal", "vertical"):
        raise ValueError("direction must be horizontal or vertical")

    rng = Random(seed)
    shades = [[rng.randrange(3) for _ in range(2)] for _ in range(4)]
    # Sample both endpoints of the repeat, including for odd and tiny tiles.
    period = max(1, size - 1)

    def pixel(x, y):
        u = ((x % period) * 2 / period + 0.5) % 2
        v = ((y % period) * 4 / period + 0.5) % 4
        column, row = int(u), int(v)
        across, down = u - column, v - row
        vertical = (column + row) % 2 == 0 and across < 0.375
        edge = across / 0.375 if vertical else down
        along = down if vertical else across
        if edge < 0.04 or edge > 0.96:
            color = palette.gap
        elif edge < 0.16 or edge > 0.88:
            color = palette.dark
        elif edge < 0.38:
            color = palette.light
        else:
            rib = int(edge * 24) % 3
            shade = (shades[row][column] + int(along * 2)) % 3
            color = palette.dark if rib == 0 else (
                palette.light if shade == 0 else palette.strand
            )
        return (*color, 255)

    return [
        [pixel(x, y) if direction == "horizontal" else pixel(y, x)
         for x in range(size)]
        for y in range(size)
    ]
