"""SUV swatch atlas and per-face UV coordinates."""

from tool_loader import load_tool

palette = load_tool("suv_palette")
# A power of two wide enough for a 4 px cell per swatch
ATLAS = load_tool("swatch_atlas").Atlas(
    palette.NAMES, cell=4, inset=1, width=128, height=16, fill=(0, 0, 0, 255))


def uv(color):
    return {face: ATLAS.face(color) for face in ("north", "south", "east", "west", "up", "down")}
