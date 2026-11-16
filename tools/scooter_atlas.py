"""Scooter material regions with deferred, audited atlas coordinates."""

import math
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

regions = load_tool("camper_regions")
Layout = regions.Layout
RegionFace = regions.RegionFace
render_atlas = regions.render_atlas
audit = regions.audit

PAINT_IVORY = (222, 215, 200)
PAINT_EDGE_FACTOR = 0.82
CHROME_STOPS = ((0.0, (250, 252, 253)), (0.25, (170, 183, 190)),
                (0.48, (65, 78, 88)), (0.55, (245, 248, 250)),
                (0.8, (127, 143, 153)), (1.0, (230, 236, 239)))
RUBBER_DARK = (21, 21, 21)
RUBBER_LIGHT = (35, 35, 35)
WHITEWALL = (233, 232, 227)
LEATHER = (169, 109, 52)
LEATHER_SEAM = (118, 72, 32)
HEAD_LENS = (255, 242, 209)
GLOW_RGB = (80, 170, 255)
TAIL_LENS = (138, 15, 18)
AMBER_LENS = (232, 151, 36)
PLATE = (237, 231, 210)
CLEAR = (0, 0, 0, 0)
REGION_TEXELS = 16
SMALL_TEXELS = 4
SEAM_PERIOD_TEXELS = 8
RUBBER_BAND_TEXELS = 2
GUTTER_TEXELS = 2
FACE_NAMES = ("north", "south", "east", "west", "up", "down")


class Material(Enum):
    PAINT = "paint"
    CHROME = "chrome"
    RUBBER = "rubber"
    WHITEWALL = "whitewall"
    LEATHER = "leather"
    LENS = "lens"
    PLATE = "plate"
    CUTOUT = "cutout"


@dataclass(frozen=True)
class Region:
    name: str
    width: int
    height: int
    material: Material
    pixel: Callable[[int, int], tuple[int, int, int, int]]


class RegionRegistry(regions.RegionRegistry):
    def register(self, region):
        if not region.name or region.name in self._regions:
            raise ValueError("Region names must be nonempty and unique")
        if any(type(n) is not int or n <= 0 for n in (region.width, region.height)):
            raise ValueError("Region dimensions must be positive texel counts")
        if not isinstance(region.material, Material) or not callable(region.pixel):
            raise ValueError("Regions require a scooter material and pixel function")
        self._regions[region.name] = region
        self._layout = None
        return regions.RegionRef(self, region)


REGISTRY = RegionRegistry()


def register(name, width, height, material, pixel):
    return REGISTRY.register(Region(name, width, height, material, pixel))


def paint_pixel(width, height):
    def pixel(u, v):
        edge = abs((v + 0.5) / height * 2 - 1)
        factor = 1 - (1 - PAINT_EDGE_FACTOR) * edge * edge
        return tuple(round(c * factor) for c in PAINT_IVORY) + (255,)
    return pixel


def register_paint(name, width, height):
    return register(name, width, height, Material.PAINT, paint_pixel(width, height))


def _solid(color):
    return lambda u, v: (*color, 255)


def _chrome(u, v):
    position = (v + 0.5) / REGION_TEXELS
    for (a, ca), (b, cb) in zip(CHROME_STOPS, CHROME_STOPS[1:]):
        if a <= position <= b:
            return tuple(round(x + (y - x) * (position - a) / (b - a))
                         for x, y in zip(ca, cb)) + (255,)
    return (*CHROME_STOPS[-1][1], 255)


register_paint("paint", REGION_TEXELS, REGION_TEXELS)
register("chrome", REGION_TEXELS, REGION_TEXELS, Material.CHROME, _chrome)
register("rubber", SMALL_TEXELS, SMALL_TEXELS, Material.RUBBER,
         lambda u, v: (*(RUBBER_DARK if v % RUBBER_BAND_TEXELS else RUBBER_LIGHT), 255))
register("whitewall", SMALL_TEXELS, SMALL_TEXELS, Material.WHITEWALL, _solid(WHITEWALL))
register("seat_leather", REGION_TEXELS, REGION_TEXELS, Material.LEATHER,
         lambda u, v: (*(LEATHER_SEAM if v % SEAM_PERIOD_TEXELS == 0 else LEATHER), 255))
for name, color in (("lens_head", HEAD_LENS), ("lens_tail", TAIL_LENS), ("lens_amber", AMBER_LENS)):
    register(name, SMALL_TEXELS, SMALL_TEXELS, Material.LENS, _solid(color))
register("glow", SMALL_TEXELS, SMALL_TEXELS, Material.LENS, _solid(GLOW_RGB))
register("plate", SMALL_TEXELS, SMALL_TEXELS, Material.PLATE, _solid(PLATE))
register("clear", SMALL_TEXELS, SMALL_TEXELS, Material.CUTOUT, lambda u, v: CLEAR)


def outline_pixel(poly_zy, texels_per_px, color_fn):
    if texels_per_px <= 0 or len(poly_zy) < 3:
        raise ValueError("An outline requires a polygon and positive texel density")
    z0, z1 = min(p[0] for p in poly_zy), max(p[0] for p in poly_zy)
    y0, y1 = min(p[1] for p in poly_zy), max(p[1] for p in poly_zy)
    width, height = math.ceil((z1 - z0) * texels_per_px), math.ceil((y1 - y0) * texels_per_px)
    if not width or not height:
        raise ValueError("An outline must have nonzero area")

    def pixel(u, v):
        z, y = z0 + (u + 0.5) * (z1 - z0) / width, y1 - (v + 0.5) * (y1 - y0) / height
        inside = False
        for (za, ya), (zb, yb) in zip(poly_zy, (*poly_zy[1:], poly_zy[0])):
            if (ya > y) != (yb > y) and z < za + (y - ya) * (zb - za) / (yb - ya):
                inside = not inside
        return (*color_fn(u, v)[:3], 255) if inside else CLEAR
    return width, height, pixel


def _region_name(region):
    if isinstance(region, str):
        return region
    return region.region.name if hasattr(region, "region") else region.name


def face(region, u=0, v=0, w=None, h=None):
    name = _region_name(region)
    registered = REGISTRY._regions[name]
    return RegionFace({"uv": [u, v], "uv_size": [registered.width if w is None else w,
                                                 registered.height if h is None else h]}, name)


def faces(region, u=0, v=0, w=None, h=None):
    return {name: face(region, u, v, w, h) for name in FACE_NAMES}


def plate_faces(region):
    return {name: face(region if name in ("east", "west") else "clear") for name in FACE_NAMES}


def pack_layout():
    if REGISTRY._layout is None:
        regions.pack(REGISTRY, gutter_px=GUTTER_TEXELS)
    packed = REGISTRY._layout
    # Bindings belong to a build; cached placement must not retain earlier cubes.
    return Layout(packed.regions, packed.size, {r.name: packed.origin(r.name) for r in packed.regions})


def resolve(cubes, layout):
    for cube in cubes:
        for value in cube["uv"].values():
            if getattr(value, "resolved", False):
                raise ValueError("A scooter face cannot be resolved twice")
            x, y = layout.origin(value.region)
            value["uv"] = [x + value["uv"][0], y + value["uv"][1]]
            value.resolved = True
            layout.bind_face(value.region, value)
