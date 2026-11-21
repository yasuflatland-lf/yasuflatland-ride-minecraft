"""Build the colour and MER textures used when lights are on."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

mer = load_tool("mer")
texture_io = load_tool("texture_io")


def build_lit_textures(out, directory, kind, width, height, pixel, is_lit,
                       lit_mer=mer.MER_LIT, off_mer=mer.MER_OFF, opaque_unlit_cutouts=False):
    def color(x, y):
        rgba = (*pixel(x, y), 255)[:4]
        if is_lit(x, y):
            return (*rgba[:3], 0)
        # Cutout bones never draw in the lit pass; their holes must not mark extra glow.
        return (*rgba[:3], 255) if opaque_unlit_cutouts and rgba[3] == 0 else rgba

    pixels = texture_io.rgba_bytes(width, height, color)
    out.rgba(directory / f"{kind}_lit.png", width, height, pixels, compress_level=-1)
    out.png(directory / f"{kind}_lit_mer.png", width, height,
            mer.mer_painter(lambda x, y: lit_mer if is_lit(x, y) else off_mer))
    texture_io.write_texture_set(out, directory, f"{kind}_lit")
    return pixels


def build_layout_lit_textures(out, directory, kind, layout, pixel, region_name, local_mask):
    build_lit_textures(out, directory, kind, *layout.size, pixel,
                       mer.layout_mask(layout, region_name, local_mask))
