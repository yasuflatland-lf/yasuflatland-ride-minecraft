"""Procedural door finishes at eight texels per model pixel (ADR 0227)."""

import math
from tool_loader import load_tool

regions = load_tool("camper_regions")
RegionRegistry = regions.RegionRegistry
TEXELS_PER_PX = 8
WOOD_HEIGHT = 42


def _noise(u: int, v: int, seed: int = 0) -> float:
    n = (u * 374761393 + v * 668265263 + seed * 144269) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return ((n ^ (n >> 16)) & 65535) / 32767.5 - 1


def register(registry: RegionRegistry, palette: dict) -> dict:
    def tint(name: str, delta: float) -> tuple:
        return tuple(max(0, min(255, round(c + delta))) for c in palette[name][:3]) + (255,)

    def wood(u: int, v: int) -> tuple:
        warp = .8 * math.sin(v / 67) + .4 * math.sin(v / 23)
        fiber = math.sin((u + warp) * 2.4) + .5 * math.sin(u * .83 + v / 140)
        delta = 2.6 * fiber + 1.4 * _noise(u // 2, v // 24, 8) + .7 * _noise(u, v, 9)
        if math.sin((u + warp) * 3.1) > .93:
            delta -= 5
        return tint("wood", delta)

    def marble(u: int, v: int) -> tuple:
        cloud = math.sin(u / 17 + math.sin(v / 12)) * math.cos(v / 14) * 10
        vein = math.sin(u / 7 + v / 10 + 1.8 * math.sin(u / 21 - v / 17))
        return tint("panel", cloud - 28 * max(0, vein - .65) + _noise(u, v) * 1.5)

    def kick(u: int, v: int) -> tuple:
        line = (u + v * 1.35) % 29
        delta = 1.5 * _noise(u, v, 3) + 2 * math.sin(v / 3)
        if line < 1.5:
            delta += 17
        elif line < 3:
            delta -= 12
        if (u - v * .68) % 47 < 1.1:
            delta -= 7
        return tint("aluminium", delta)

    def cloth(u: int, v: int) -> tuple:
        return tint("ivory", 1.2 * _noise(u, v, 5) + 9 * math.cos(u * math.pi / 8) + (1 if u % 2 else -1))

    return {name: registry.register(regions.Region(name, w, h, material, pixel))
            for name, w, h, material, pixel in (
                ("door wood", 111, 336, regions.Material.WOOD, wood),
                ("door marble", 101, 41, regions.Material.STONE, marble),
                ("door kick", 101, 44, regions.Material.METAL, kick),
                ("door cloth", 16, 104, regions.Material.FABRIC, cloth))}
