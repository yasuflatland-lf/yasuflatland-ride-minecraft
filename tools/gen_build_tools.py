"""Generate the 16x16 item icons of the World Edit build tools (ADR 0178).

Run: python3 -I tools/gen_build_tools.py packs/yasu_ride_rp [--check]
--check writes nothing and exits 1 listing every stale output.
"""

import struct
import sys
import zlib
from pathlib import Path

RP = Path(sys.argv[1])
CHECK = "--check" in sys.argv[2:]
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

STALE = []


def png(path, rows):
    raw = b"".join(b"\x00" + b"".join(bytes(COLORS[c]) for c in row) for row in rows)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", 16, 16, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    if CHECK:
        try:
            if path.read_bytes() == data:
                return
        except OSError:
            pass
        STALE.append(str(path))
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


for name, rows in (("selection_wand", SELECTION_WAND), ("build_tool", BUILD_TOOL)):
    assert len(rows) == 16 and all(len(row) == 16 for row in rows), name
    png(ITEM_TEXTURES / f"{name}.png", rows)

if STALE:
    sys.exit("out of date with tools/gen_build_tools.py. Run `pnpm model` and commit the result:\n" + "\n".join(STALE))
