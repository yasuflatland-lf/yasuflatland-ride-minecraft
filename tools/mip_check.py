"""Measure colour loss at swatch centres in a box-filtered mip chain."""

from pathlib import Path
from struct import iter_unpack

from tool_loader import load_tool


def downsample(pixels, width, height):
    result = []
    for y in range(0, height, 2):
        top = y * width
        bottom = min(y + 1, height - 1) * width
        for x in range(0, width, 2):
            right = min(x + 1, width - 1)
            texels = (pixels[top + x], pixels[top + right],
                      pixels[bottom + x], pixels[bottom + right])
            alphas = [texel[3] for texel in texels]
            total_alpha = sum(alphas)
            weights = alphas if total_alpha else (1, 1, 1, 1)
            rgb = [
                round(sum(texel[c] * weight for texel, weight in zip(texels, weights))
                      / (total_alpha or 4))
                for c in range(3)
            ]
            result.append((*rgb, round(total_alpha / 4)))
    return result, (width + 1) // 2, (height + 1) // 2


def mip_chain(pixels, width, height, levels):
    chain = [(pixels, width, height)]
    for _ in range(levels):
        chain.append(downsample(*chain[-1]))
    return chain


def swatch_mip_error(chain, rect, level) -> float:
    x, y, w, h = rect
    source, source_width, _ = chain[0]
    pixels, width, height = chain[level]
    mx = max(0, min(int(x + w / 2) >> level, width - 1))
    my = max(0, min(int(y + h / 2) >> level, height - 1))
    sample = pixels[my * width + mx]
    return float(max(abs(a - b) for a, b in zip(source[y * source_width + x], sample)))


def swatch_rects(atlas):
    rects = {}
    for name in atlas.swatches:
        face = atlas.face(name)
        rects[name] = (*face["uv"], *face["uv_size"])
    return rects


def read_texture(vehicle):
    directory = Path(__file__).resolve().parents[1] / "packs/yasu_ride_rp/textures/entity/yasu_ride"
    width, height, rgba = load_tool("render_preview").read_png_bytes(directory / f"{vehicle}.png")
    return list(iter_unpack("4B", rgba)), width, height
