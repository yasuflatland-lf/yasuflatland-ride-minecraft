"""SUV paint material and panel-line relief policy."""

import math
from functools import cache
from typing import Callable, Literal

from tool_loader import load_tool

palette = load_tool("suv_palette")
Paint = palette.Paint
mer = load_tool("mer")
Mer = mer.Mer
MER_OFF = mer.MER_OFF

RELIEF_KIND = "heightmap"
FLAT_HEIGHT = 128
RELIEF_DEPTH_STEP = 32
RELIEF_STRENGTH = 4

PAINT_METALNESS = 110
PAINT_ROUGHNESS = 60
HARDTOP_ROUGHNESS = 220
GLASS_ROUGHNESS = 30
CHROME_METALNESS = 230
CHROME_ROUGHNESS = 40
RESIN_ROUGHNESS = 235
GLOW_EMISSIVE = 255 - palette.ALPHA["glow"]

SWATCH_MER: dict[str, Mer] = {name: MER_OFF for name in palette.NAMES}
SWATCH_MER.update({
    "body": Mer(PAINT_METALNESS, 0, PAINT_ROUGHNESS),
    "hardtop": Mer(0, 0, HARDTOP_ROUGHNESS),
    "hardtop_rib": Mer(0, 0, HARDTOP_ROUGHNESS),
    "glass": Mer(0, 0, GLASS_ROUGHNESS),
    "rear_glass": Mer(0, 0, GLASS_ROUGHNESS),
    "chrome": Mer(CHROME_METALNESS, 0, CHROME_ROUGHNESS),
    "resin": Mer(0, 0, RESIN_ROUGHNESS),
    # Vibrant Visuals may replace the alpha glow mask with the MER emissive channel.
    "glow": Mer(0, GLOW_EMISSIVE, 255),
})


def mer_pixel(paint: Paint) -> Callable[[int, int], tuple]:
    atlas = load_tool("suv_atlas")

    def pixel(x, y):
        slot = atlas.ATLAS.swatch_at(x, y)
        if slot is not None:
            return SWATCH_MER[palette.NAMES[slot]].rgba()
        hit = atlas.region_at(x, y)
        if hit is None:
            return MER_OFF.rgba()
        block, spec, u, v = hit
        value = atlas.PAINTERS[block].mer(spec.name, u, v, paint)
        if value is None:
            value = SWATCH_MER[spec.base]
        # Static paint texture sets must not make unlit lamps glow (ADR 0147, 0192).
        if value.emissive > 0:
            raise ValueError("SUV paint region MER must not be emissive")
        return value.rgba()

    return pixel


@cache
def relief_heights(block, spec):
    atlas = load_tool("suv_atlas")
    painter = atlas.PAINTERS[block]
    return tuple(tuple(max(0, min(255, FLAT_HEIGHT +
        (painter.relief(spec.name, u, v) or 0) * RELIEF_DEPTH_STEP))
        for u in range(spec.w)) for v in range(spec.h))


def relief_pixel(kind: Literal["heightmap", "normal"]) -> Callable[[int, int], tuple]:
    if kind not in ("heightmap", "normal"):
        raise ValueError(f"Unknown relief kind: {kind}")
    atlas = load_tool("suv_atlas")
    flat = (FLAT_HEIGHT, FLAT_HEIGHT, FLAT_HEIGHT, 255) if kind == "heightmap" else (128, 128, 255, 255)

    def pixel(x, y):
        if atlas.ATLAS.swatch_at(x, y) is not None:
            return flat
        hit = atlas.region_at(x, y)
        if hit is None:
            return flat
        block, spec, u, v = hit
        heights = relief_heights(block, spec)
        if kind == "heightmap":
            height = heights[v][u]
            return (height, height, height, 255)
        du = (heights[v][min(spec.w - 1, u + 1)] - heights[v][max(0, u - 1)]) / (2 * 255)
        dv = (heights[min(spec.h - 1, v + 1)][u] - heights[max(0, v - 1)][u]) / (2 * 255)
        # DirectX convention (green points toward increasing image v), not verified in game yet;
        # negate the green term if the grooves look raised under Vibrant Visuals.
        normal = (-du * RELIEF_STRENGTH, -dv * RELIEF_STRENGTH, 1)
        length = math.sqrt(sum(c * c for c in normal))
        return (*(max(0, min(255, round((c / length + 1) / 2 * 255))) for c in normal), 255)

    return pixel
