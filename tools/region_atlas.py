"""Kind-neutral region registry, deterministic atlas packing, rendering and audits."""

import math
import random
from dataclasses import dataclass
from enum import Enum
from typing import Callable


@dataclass(frozen=True)
class Region:
    name: str
    width: int
    height: int
    material: Enum
    pixel: Callable[[int, int], tuple[int, int, int, int]]


@dataclass(frozen=True)
class Placement:
    x: int
    y: int
    flip_x: bool = False
    flip_y: bool = False


@dataclass(frozen=True)
class UvRect:
    u: float
    v: float
    w: float
    h: float

    @classmethod
    def of(cls, face: dict) -> "UvRect":
        return cls(*face['uv'], *face['uv_size'])

    def to_atlas(self, placement: Placement, region_width: int, region_height: int) -> "UvRect":
        return UvRect(
            placement.x + (region_width - self.u if placement.flip_x else self.u),
            placement.y + (region_height - self.v if placement.flip_y else self.v),
            -self.w if placement.flip_x else self.w,
            -self.h if placement.flip_y else self.h,
        )

    def apply(self, face: dict) -> None:
        face['uv'] = [self.u, self.v]
        face['uv_size'] = [self.w, self.h]


class RegionFace(dict):
    """Keep face ownership through mirroring without serializing audit metadata."""

    def __init__(self, values: dict, region: str):
        super().__init__(values)
        self.region = region


class RegionRef:
    def __init__(self, registry, region):
        self._registry = registry
        self.region = region

    def bind(self, face):
        """Keep a face on this region live for the atlas audit."""
        self._registry._layout.bind_face(self.region.name, face)

    def uv(self, u: float, v: float) -> tuple[float, float]:
        layout = self._registry._layout
        if layout is None:
            raise ValueError("Pack the registry before resolving UVs")
        point = UvRect(u, v, 0, 0).to_atlas(
            layout.placement(self.region.name), self.region.width, self.region.height)
        layout._uvs.append((self.region.name, (u, v)))
        return (point.u, point.v)


class RegionRegistry:
    def __init__(self):
        self._regions = {}
        self._layout = None

    def register(self, region: Region) -> RegionRef:
        if not region.name or region.name in self._regions:
            raise ValueError("Region names must be nonempty and unique")
        if any(type(n) is not int or n <= 0 for n in (region.width, region.height)):
            raise ValueError("Region dimensions must be positive texel counts")
        if not isinstance(region.material, Enum) or not callable(region.pixel):
            raise ValueError("Regions require a material and pixel function")
        self._regions[region.name] = region
        self._layout = None
        return RegionRef(self, region)

    def regions(self) -> list[Region]:
        return list(self._regions.values())


class Layout:
    regions: tuple[Region, ...]
    size: tuple[int, int]

    def __init__(self, regions, size, placements):
        self.regions = tuple(regions)
        self.size = tuple(size)
        self._placements = dict(placements)
        self._uvs = []
        self._faces = []

    def placement(self, name) -> Placement:
        return self._placements[name]

    def origin(self, name) -> tuple[int, int]:
        placement = self.placement(name)
        if placement.flip_x or placement.flip_y:
            raise ValueError("Flipped placements have no plain origin")
        return (placement.x, placement.y)

    def face_region(self, face) -> str:
        """Find the owning packed rectangle, including reversed face endpoints."""
        if isinstance(face, RegionFace):
            return face.region
        u, v = face['uv']
        du, dv = face['uv_size']
        for region in self.regions:
            rect = UvRect(0, 0, region.width, region.height).to_atlas(
                self.placement(region.name), region.width, region.height)
            x, y = min(rect.u, rect.u + rect.w), min(rect.v, rect.v + rect.h)
            if (x <= min(u, u + du) and max(u, u + du) <= x + region.width
                    and y <= min(v, v + dv) and max(v, v + dv) <= y + region.height):
                return region.name
        raise ValueError(f"Face lies outside every region: {face}")

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


def pack(registry: RegionRegistry, gutter_px: int = 2, max_side: int | None = None) -> Layout:
    if type(gutter_px) is not int or gutter_px < 0:
        raise ValueError("Gutter must be a nonnegative texel count")
    if max_side is not None and (type(max_side) is not int or max_side <= 0):
        raise ValueError("Maximum atlas side must be a positive texel count")
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
    if max_side is not None:
        # Minimum area alone can pick a tall narrow atlas that exceeds a texture limit.
        # Packing includes a trailing gutter that is omitted from the final atlas.
        limit = max_side + gutter_px
        widths = sorted({*widths, *range(min_width, limit + 1, 64), limit})
        widths = [w for w in widths if w <= limit]
    best = None
    for width in widths:
        low = max(max(h for _, h in sizes), math.ceil(area / width))
        high = sum(h for _, h in sizes)
        if max_side is not None:
            high = min(high, limit)
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
    if best is None:
        raise ValueError(f"Regions do not fit within a {max_side} by {max_side} atlas")
    _, width, height, origins = best
    layout = Layout(regions, (width, height), {r.name: Placement(*origin) for r, origin in zip(regions, origins)})
    registry._layout = layout
    return layout


def _texel_indices(region: Region, placement: Placement):
    columns = []
    rows = []
    for u in range(region.width):
        rect = UvRect(u, 0, 1, 1).to_atlas(placement, region.width, region.height)
        columns.append(min(rect.u, rect.u + rect.w))
    for v in range(region.height):
        rect = UvRect(0, v, 1, 1).to_atlas(placement, region.width, region.height)
        rows.append(min(rect.v, rect.v + rect.h))
    return columns, rows


def render_atlas(layout: Layout) -> bytes:
    width, height = layout.size
    pixels = bytearray(width * height * 4)
    for region in layout.regions:
        placement = layout.placement(region.name)
        columns, rows = _texel_indices(region, placement)
        for v in range(region.height):
            for u in range(region.width):
                offset = (rows[v] * width + columns[u]) * 4
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
        placement = layout.placement(region.name)
        columns, rows = _texel_indices(region, placement)
        x, y = placement.x, placement.y
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
                offset = (rows[v] * width + columns[u]) * 4
                if pixels[offset:offset + 4] != bytes(region.pixel(u, v)):
                    errors.append(f"{region.name}: pixel mismatch at ({u}, {v})")
                    mismatch = True
                    break
            if mismatch:
                break
    points = list(layout._uvs)
    by_name = {r.name: r for r in layout.regions}
    for name, face in layout._faces:
        placement = layout.placement(name)
        region = by_name[name]
        rect = UvRect.of(face)
        local = UvRect(rect.u - placement.x, rect.v - placement.y, rect.w, rect.h).to_atlas(
            Placement(0, 0, placement.flip_x, placement.flip_y), region.width, region.height)
        points.extend(((name, (local.u, local.v)), (name, (local.u + local.w, local.v + local.h))))
    for name, (u, v) in points:
        region = by_name[name]
        # Face UVs are stored as origin + offset, so subtracting the origin
        # back leaves float noise of about 1e-14 on a region edge.
        ru, rv = round(u, 6), round(v, 6)
        if not (math.isfinite(u) and math.isfinite(v) and 0 <= ru <= region.width and 0 <= rv <= region.height):
            message = f"{name}: UV outside region: ({u}, {v})"
            if message not in errors:
                errors.append(message)
    return errors


