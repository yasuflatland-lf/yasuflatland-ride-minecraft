"""Generate the 16x16 item icons of the World Edit build tools (ADR 0178).

Run: python3 -I tools/gen_build_tools.py packs/yasu_ride_rp [--check]
--check writes nothing and exits 1 listing every stale output.
"""

import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")

RP = Path(sys.argv[1])
out = texture_io.Outputs("--check" in sys.argv[2:])
ITEM_TEXTURES = RP / "textures/items/yasu_build"

COLORS = {
    ".": (0, 0, 0, 0),
    "Y": (250, 190, 20, 255),  # crane yellow
    "D": (190, 130, 10, 255),  # crane shade
    "N": (25, 38, 58, 255),
    "W": (255, 255, 255, 255),  # badge plate
    "K": (50, 50, 50, 255),  # hook and counterweight
}

SELECTION_WAND = [
    "................",
    "......Y.........",
    "...YYYYYYYYYYYY.",
    "...YDYDYDYDYDYD.",
    "...KY.Y.......D.",
    "..KKY.Y.......K.",
    "......Y.......K.",
    "......YD........",
    "......DY........",
    "......YD........",
    "......DY........",
    "......YD........",
    "......DY........",
    "....YYYYYY......",
    "....DDDDDD......",
    "................",
]

PLATE = 11
PLATE_ORIGIN = 16 - PLATE
GLYPH = 9
GLYPH_ORIGIN = PLATE_ORIGIN + 1

ROTATE_BADGE = [
    "..NNNN...",
    ".N....NNN",
    "N......N.",
    "N........",
    "N.......N",
    "........N",
    ".N......N",
    "NNN....N.",
    "...NNNN..",
]
PLACE_BADGE = [
    "..NNNNNNN",
    "..N.....N",
    "NNNNNNN.N",
    "N.....N.N",
    "N..N..N.N",
    "N.NNN.N.N",
    "N..N..NNN",
    "N.....N..",
    "NNNNNNN..",
]


def draw_badge(rows, badge):
    """Draw a white plate with trimmed corners, then the dark glyph on it."""
    result = [list(row) for row in rows]
    last = PLATE - 1
    corners = {(0, 0), (last, 0), (0, last), (last, last)}
    for y in range(PLATE):
        for x in range(PLATE):
            if (x, y) not in corners:
                result[PLATE_ORIGIN + y][PLATE_ORIGIN + x] = "W"
    for y, row in enumerate(badge):
        for x, pixel in enumerate(row):
            if pixel != ".":
                result[GLYPH_ORIGIN + y][GLYPH_ORIGIN + x] = pixel
    return ["".join(row) for row in result]


for name, rows in (("selection_wand", SELECTION_WAND),
                   ("paste_rotate", draw_badge(SELECTION_WAND, ROTATE_BADGE)),
                   ("paste_place", draw_badge(SELECTION_WAND, PLACE_BADGE))):
    assert len(rows) == 16 and all(len(row) == 16 for row in rows), name
    out.png(ITEM_TEXTURES / f"{name}.png", 16, 16, lambda x, y: COLORS[rows[y][x]])

out.finish("Build tool outputs are out of date with tools/gen_build_tools.py. Run `pnpm model` and commit the result:")
