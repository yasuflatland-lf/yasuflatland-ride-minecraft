"""Generate original 16x16 radar-style warp art in the yasu_build namespace.

Run: python3 -I tools/gen_warp_art.py packs/yasu_ride_rp [--check]
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

TRANSPARENT = (0, 0, 0, 0)
CHARCOAL = (35, 40, 46, 255)
PANEL = (22, 28, 35, 255)
SCREEN = (10, 47, 66, 255)
RING = (40, 104, 128, 255)
CROSSHAIR = (25, 77, 98, 255)
CYAN = (90, 225, 245, 255)
WHITE = (238, 250, 255, 255)
DOTS = {(4, 4): CYAN, (11, 5): WHITE, (10, 10): CYAN, (4, 10): WHITE}


def scope(x, y, background):
    dx, dy = x - 7, y - 7
    radius_squared = dx * dx + dy * dy
    # 48, not 49: a radius of exactly 7 adds a lone pixel at each compass point,
    # and the top one would read as a button on the rim, which the brief forbids.
    if radius_squared > 48:
        return background
    if radius_squared >= 36:
        return CHARCOAL
    if abs(dx) + abs(dy) <= 1:
        return WHITE
    if (x, y) in DOTS:
        return DOTS[x, y]
    if 7 <= radius_squared <= 12 or 22 <= radius_squared <= 30:
        return RING
    if dx == 0 or dy == 0:
        return CROSSHAIR
    return SCREEN


def side(x, y):
    radius_squared = (x - 7) ** 2 + (y - 7) ** 2
    if 22 <= radius_squared <= 30:
        return RING
    return CHARCOAL if x in (0, 15) or y in (0, 15) else PANEL


out.png(RP / "textures/items/yasu_build/warp_tool.png", 16, 16,
        lambda x, y: scope(x, y, TRANSPARENT))
out.png(RP / "textures/blocks/yasu_build/warp_block_top.png", 16, 16,
        lambda x, y: scope(x, y, PANEL))
out.png(RP / "textures/blocks/yasu_build/warp_block_side.png", 16, 16, side)

out.finish("Warp art outputs are out of date with tools/gen_warp_art.py. Run `pnpm generate`:")
