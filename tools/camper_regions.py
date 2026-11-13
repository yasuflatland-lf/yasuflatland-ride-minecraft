"""Named camper texture regions, deterministic packing, and lossless audits."""

import math
import random
from dataclasses import dataclass
from enum import Enum
from typing import Callable


class Material(Enum):
    SWATCHES_MIXED = "swatches_mixed"
    METAL = "metal"
    LACQUER = "lacquer"
    GLASS_COAT = "glass_coat"
    VINYL = "vinyl"
    WOOD = "wood"
    FABRIC = "fabric"
    CARPET = "carpet"
    TILE = "tile"
    STONE = "stone"
    DARK_LACQUER = "dark_lacquer"


@dataclass(frozen=True)
class Region:
    name: str
    width: int
    height: int
    material: Material
    pixel: Callable[[int, int], tuple[int, int, int, int]]


class RegionRef:
    def __init__(self, registry, region):
        self._registry = registry
        self.region = region

    def uv(self, u: float, v: float) -> tuple[float, float]:
        layout = self._registry._layout
        if layout is None:
            raise ValueError("Pack the registry before resolving UVs")
        x, y = layout.origin(self.region.name)
        layout._uvs.append((self.region.name, (u, v)))
        return (x + u, y + v)


class RegionRegistry:
    def __init__(self):
        self._regions = {}
        self._layout = None

    def register(self, region: Region) -> RegionRef:
        if not region.name or region.name in self._regions:
            raise ValueError("Region names must be nonempty and unique")
        if any(type(n) is not int or n <= 0 for n in (region.width, region.height)):
            raise ValueError("Region dimensions must be positive texel counts")
        if not isinstance(region.material, Material) or not callable(region.pixel):
            raise ValueError("Regions require a material and pixel function")
        self._regions[region.name] = region
        self._layout = None
        return RegionRef(self, region)

    def regions(self) -> list[Region]:
        return list(self._regions.values())


class Layout:
    def __init__(self, regions, size, origins):
        self.regions = tuple(regions)
        self.size = tuple(size)
        self._origins = dict(origins)
        self._uvs = []
        self._faces = []

    def origin(self, name) -> tuple[int, int]:
        return self._origins[name]

    def bind_face(self, name, face):
        """Keep the emitted face live so audits also catch later UV edits."""
        self._faces.append((name, face))


# The spike searched these widths and orders; dimensions remain unconstrained.
PACK_WIDTHS = (416, 448, 480, 512, 576, 640, 704, 768, 896, 1024)
PACK_SEED = 27729
PACK_RANDOM_ORDERS = 40
PACK_ORDER_WEIGHT_RANGE = (0.65, 1.4)


def _overlap(a, b):
    x, y, w, h = a
    xx, yy, ww, hh = b
    return x < xx + ww and xx < x + w and y < yy + hh and yy < y + h


def _contains(a, b):
    x, y, w, h = a
    xx, yy, ww, hh = b
    return x <= xx and y <= yy and xx + ww <= x + w and yy + hh <= y + h


def _attempt(sizes, width, height, order, mode):
    free = [(0, 0, width, height)]
    placed = {}
    for i in order:
        w, h = sizes[i]
        choices = []
        for x, y, fw, fh in free:
            if w <= fw and h <= fh:
                score = ((min(fw - w, fh - h), max(fw - w, fh - h), y, x)
                         if mode == 0 else (y + h, x, fw * fh - w * h))
                choices.append((score, x, y))
        if not choices:
            return None
        _, x, y = min(choices)
        rect = (x, y, w, h)
        placed[i] = rect
        remaining = []
        for a, b, c, d in free:
            if not _overlap((a, b, c, d), rect):
                remaining.append((a, b, c, d))
                continue
            if a < x:
                remaining.append((a, b, x - a, d))
            if x + w < a + c:
                remaining.append((x + w, b, a + c - x - w, d))
            if b < y:
                remaining.append((a, b, c, y - b))
            if y + h < b + d:
                remaining.append((a, y + h, c, b + d - y - h))
        unique = sorted(set(remaining))
        free = [a for a in unique if not any(a != b and _contains(b, a) for b in unique)]
    return placed


def pack(registry: RegionRegistry, gutter_px: int = 2) -> Layout:
    if type(gutter_px) is not int or gutter_px < 0:
        raise ValueError("Gutter must be a nonnegative texel count")
    regions = sorted(registry.regions(), key=lambda r: r.name)
    if not regions:
        raise ValueError("Cannot pack an empty registry")
    sizes = [(r.width + gutter_px, r.height + gutter_px) for r in regions]
    orders = []
    for key in (lambda s: math.prod(s), max, lambda s: s[1], lambda s: s[0], sum):
        orders.append(sorted(range(len(sizes)), key=lambda i: key(sizes[i]), reverse=True))
    rng = random.Random(PACK_SEED)
    for _ in range(PACK_RANDOM_ORDERS):
        scores = [math.prod(s) * rng.uniform(*PACK_ORDER_WEIGHT_RANGE) for s in sizes]
        orders.append(sorted(range(len(sizes)), key=lambda i: scores[i], reverse=True))
    area = sum(math.prod(s) for s in sizes)
    min_width = max(w for w, _ in sizes)
    widths = sorted({min_width, max(min_width, math.ceil(math.sqrt(area))),
                     *(w for w in PACK_WIDTHS if w >= min_width)})
    best = None
    for width in widths:
        low = max(max(h for _, h in sizes), math.ceil(area / width))
        high = sum(h for _, h in sizes)
        while low <= high:
            height = (low + high) // 2
            found = None
            for order in orders:
                for mode in (0, 1):
                    found = _attempt(sizes, width, height, order, mode)
                    if found is not None:
                        break
                if found is not None:
                    break
            if found is None:
                low = height + 1
                continue
            used_w = max(x + w for x, y, w, h in found.values()) - gutter_px
            used_h = max(y + h for x, y, w, h in found.values()) - gutter_px
            origins = tuple(found[i][:2] for i in range(len(regions)))
            candidate = (used_w * used_h, used_w, used_h, origins)
            if best is None or candidate < best:
                best = candidate
            high = height - 1
    _, width, height, origins = best
    layout = Layout(regions, (width, height), {r.name: origin for r, origin in zip(regions, origins)})
    registry._layout = layout
    return layout


def render_atlas(layout: Layout) -> bytes:
    width, height = layout.size
    pixels = bytearray(width * height * 4)
    for region in layout.regions:
        x, y = layout.origin(region.name)
        for v in range(region.height):
            for u in range(region.width):
                offset = ((y + v) * width + x + u) * 4
                pixels[offset:offset + 4] = bytes(region.pixel(u, v))
    return bytes(pixels)


def audit(layout: Layout, atlas) -> list[str]:
    errors = []
    width, height = layout.size
    pixels = bytes(atlas)
    if len(pixels) != width * height * 4:
        errors.append("Atlas RGBA byte length does not match layout")
    rectangles = []
    for region in layout.regions:
        x, y = layout.origin(region.name)
        rect = (x, y, region.width, region.height)
        if x < 0 or y < 0 or x + region.width > width or y + region.height > height:
            errors.append(f"{region.name}: outside atlas")
        for name, other in rectangles:
            if _overlap(rect, other):
                errors.append(f"{region.name}: overlaps {name}")
        rectangles.append((region.name, rect))
        mismatch = False
        for v in range(region.height):
            for u in range(region.width):
                offset = ((y + v) * width + x + u) * 4
                if pixels[offset:offset + 4] != bytes(region.pixel(u, v)):
                    errors.append(f"{region.name}: pixel mismatch at ({u}, {v})")
                    mismatch = True
                    break
            if mismatch:
                break
    points = list(layout._uvs)
    for name, face in layout._faces:
        x, y = layout.origin(name)
        u, v = face['uv']
        du, dv = face['uv_size']
        points.extend(((name, (u - x, v - y)), (name, (u + du - x, v + dv - y))))
    by_name = {r.name: r for r in layout.regions}
    for name, (u, v) in points:
        region = by_name[name]
        if not (math.isfinite(u) and math.isfinite(v) and 0 <= u <= region.width and 0 <= v <= region.height):
            message = f"{name}: UV outside region: ({u}, {v})"
            if message not in errors:
                errors.append(message)
    return errors


CURTAIN_LEVELS = (35.55, 36.3, 37.3, 38.5, 40.15, 42, 44.2, 46.4, 48.95, 49.68)

def curtain_width(y, width):
    narrow = width * .27
    if y >= 40.15:
        return narrow + (width - narrow) * ((y - 40.15) / (49.76 - 40.15)) ** .85
    return narrow + (width * .70 - narrow) * (math.sin((40.15 - y) / (40.15 - 35.55) * math.pi / 2) ** .86)

def _curtain_pixels():
    rng = random.Random(1968)
    pixels = []
    for v in range(120):
        y = 49.76 - (v + .5) / 8
        fade = .48 + .52 * min(1, abs(y - 40.15) / 4)
        width = curtain_width(y, 4.1)
        for u in range(96):
            j = min(3, int(u / 24))
            local = (u - j * 24 + .5) / 24
            ya, yb = next(((a, b) for a, b in zip(CURTAIN_LEVELS, CURTAIN_LEVELS[1:]) if a <= y <= b), (48.95, 49.76))
            wa, wb = curtain_width(ya, 4.1), curtain_width(yb, 4.1)
            t = max(0, min(1, (y - ya) / (yb - ya)))
            p = (local * max(wa, wb) / 4 * 1.05) / width if j == 0 else ((j + .5) / 4 * (wa + (wb - wa) * t) + (local - .5) * max(wa, wb) / 4 * 1.05) / width
            phase = p * 12 * math.pi
            slope = .17 * fade * 12 * math.pi * math.sin(phase) / width
            factor = (.89 + .11 * math.cos(phase)) * (1 + (.8 / .6 - 1) * slope * slope / (1 + slope * slope))
            factor *= 1 - .09 * math.exp(-((y - 39.80) / .16) ** 2)
            if v < 7 and u % 16 in (6, 7, 9, 10):
                factor *= .91
            if 112 <= v < 114:
                factor *= .95
            n = rng.choice((-2, -1, 0, 1, 2)) + (1 if u % 2 == 0 else -1)
            if v % 7 == 0 and (u + 13 * (v // 7)) % 31 < 12: n += 5
            if v % 7 == 1 and (u + 13 * (v // 7)) % 31 < 12: n -= 5
            pixels.append(tuple(max(0, min(255, round(c * factor + n))) for c in (196, 120, 60)) + (255,))
        # The reference consumes a full 114-pixel source row before the next row.
        for _ in range(18):
            rng.choice((-2, -1, 0, 1, 2))
    return pixels

CURTAIN_PIXELS = _curtain_pixels()

def curtain_pixel(x, y):
    return CURTAIN_PIXELS[y * 96 + x]
