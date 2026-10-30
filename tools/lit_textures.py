"""Build the colour and MER textures used when lights are on."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

mer = load_tool("mer")
write_texture_set = load_tool("texture_io").write_texture_set


def build_lit_textures(out, directory, kind, width, height, pixel, is_lit,
                       lit_mer=mer.MER_LIT, off_mer=mer.MER_OFF):
    def color(x, y):
        return (*pixel(x, y)[:3], 0) if is_lit(x, y) else pixel(x, y)

    out.png(directory / f"{kind}_lit.png", width, height, color)
    out.png(directory / f"{kind}_lit_mer.png", width, height,
            mer.mer_painter(lambda x, y: lit_mer if is_lit(x, y) else off_mer))
    write_texture_set(out, directory, f"{kind}_lit")
