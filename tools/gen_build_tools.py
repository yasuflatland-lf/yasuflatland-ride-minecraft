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
    "W": (140, 98, 57, 255),  # wand shaft
    "w": (96, 66, 38, 255),  # shaft shade
    "S": (255, 240, 120, 255),  # bright tip
    "s": (255, 200, 40, 255),  # tip glow
    "Y": (250, 190, 20, 255),  # crane yellow
    "D": (190, 130, 10, 255),  # crane shade
    "K": (50, 50, 50, 255),  # hook and counterweight
}

SELECTION_WAND = [
    "................",
    "..........s.....",
    ".........sSs....",
    "........sSSSs...",
    ".........sSs....",
    "..........Ws....",
    ".........Ww.....",
    "........Ww......",
    ".......Ww.......",
    "......Ww........",
    ".....Ww.........",
    "....Ww..........",
    "...Ww...........",
    "..Ww............",
    "..w.............",
    "................",
]

BUILD_TOOL = [
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

for name, rows in (("selection_wand", SELECTION_WAND), ("build_tool", BUILD_TOOL)):
    assert len(rows) == 16 and all(len(row) == 16 for row in rows), name
    out.png(ITEM_TEXTURES / f"{name}.png", 16, 16, lambda x, y: COLORS[rows[y][x]])

out.finish("Build tool outputs are out of date with tools/gen_build_tools.py. Run `pnpm model` and commit the result:")
