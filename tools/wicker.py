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
    # Weave pitch: crossings per tile and the width of the cord relative to its cell.
    columns: int = 2
    rows: int = 4
    cord: float = 0.375
    # Number of loose light and dark bands stacked down the tile (0 disables).
    bands: int = 0


# Actual RGB samples at the 50th, 85th, 25th and 5th brightness percentiles
# of daining_table_texture_closeup.png and sofa_textue.png, respectively.
PALETTE_BLACK = WeavePalette((38, 45, 46), (58, 64, 66), (27, 35, 36), (17, 24, 25))
PALETTE_AMBER = WeavePalette(
    (166, 131, 90), (198, 181, 158), (131, 98, 64), (55, 42, 36),
    columns=4, rows=4, cord=0.5, bands=2,
)


def weave_tile(
    palette: WeavePalette,
    size: int = 16,
    *,
    seed: int = 0,
    direction: Literal["horizontal", "vertical"] = "horizontal",
) -> list[list[tuple[int, int, int, int]]]:
    """Return opaque, palette-only RGBA rows with matching opposite edges.

    The black palette weaves flat horizontal ribbons over and under sparse
    vertical cords; the amber palette packs a finer pitch with loose light and
    dark bands. Sampling uses the whole tile as one period, so column 0 follows
    column size-1 and tiles join without a doubled seam row or column.
    Fine ribs and seeded broad shading use the same repeat as the crossings.
    Write with texture_io.Outputs.png(..., lambda x, y: tile[y][x]).
    """
    if not isinstance(size, int) or isinstance(size, bool) or size < 1:
        raise ValueError("size must be a positive integer")
    if direction not in ("horizontal", "vertical"):
        raise ValueError("direction must be horizontal or vertical")

    pixel = weave_sampler(palette, size, seed)
    return [
        [pixel(x, y) if direction == "horizontal" else pixel(y, x)
         for x in range(size)]
        for y in range(size)
    ]


def weave_sampler(palette: WeavePalette, size: int, seed: int = 0):
    """Return pixel(x, y) for the horizontal weave, periodic in size on both axes."""
    rng = Random(seed)
    cols, rows, cord = palette.columns, palette.rows, palette.cord
    shades = [[rng.randrange(3) for _ in range(cols)] for _ in range(rows)]
    band_shift = [rng.randrange(2) for _ in range(max(1, palette.bands))]

    def pixel(x, y):
        u = ((x % size) * cols / size + 0.5) % cols
        v = ((y % size) * rows / size + 0.5) % rows
        column, row = int(u), int(v)
        across, down = u - column, v - row
        vertical = (column + row) % 2 == 0 and across < cord
        edge = across / cord if vertical else down
        along = down if vertical else across
        if palette.bands and (edge < 0.2 or edge > 0.85):
            color = palette.gap if (edge < 0.2) else palette.dark
        elif palette.bands:
            band = int((y % size) * palette.bands * 2 / size)
            shade = (shades[row][column] + band + band_shift[band // 2]) % 3
            color = (palette.light, palette.strand, palette.dark)[shade]
        elif edge < 0.04 or edge > 0.96:
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

    return pixel
