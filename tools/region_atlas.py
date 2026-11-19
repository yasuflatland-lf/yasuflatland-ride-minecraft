"""Kind-neutral region registry, deterministic atlas packing, rendering and audits."""

import math
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable, Hashable


sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

atlas_pack = load_tool("atlas_pack")


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
class TexelRect:
    """Half-open texel cells [x0, x1) by [y0, y1)."""

    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def area(self) -> int:
        return max(0, self.x1 - self.x0) * max(0, self.y1 - self.y0)

    def intersect(self, other: "TexelRect") -> "TexelRect | None":
        rect = TexelRect(max(self.x0, other.x0), max(self.y0, other.y0),
                         min(self.x1, other.x1), min(self.y1, other.y1))
        return rect if rect.area else None


@dataclass(frozen=True)
class AtlasImage:
    width: int
    height: int
    pixels: bytes

    def __post_init__(self):
        if len(self.pixels) != self.width * self.height * 4:
            raise ValueError("Atlas RGBA bytes must match its dimensions")

    def alpha_bounds(self, rect: TexelRect) -> TexelRect | None:
        clipped = rect.intersect(TexelRect(0, 0, self.width, self.height))
        if clipped is None:
            return None
        x0, y0, x1, y1 = clipped.x1, clipped.y1, clipped.x0, clipped.y0
        for y in range(clipped.y0, clipped.y1):
            for x in range(clipped.x0, clipped.x1):
                if self.pixels[(y * self.width + x) * 4 + 3] > 0:
                    x0, y0 = min(x0, x), min(y0, y)
                    x1, y1 = max(x1, x + 1), max(y1, y + 1)
        return TexelRect(x0, y0, x1, y1) if x0 < x1 and y0 < y1 else None

    def is_clear(self, rect: TexelRect) -> bool:
        return self.alpha_bounds(rect) is None


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

    def texels(self) -> TexelRect:
        def axis(origin, size):
            if size == 0:
                start = math.floor(round(origin, 6))
                return start, start + 1
            start = math.floor(round(min(origin, origin + size), 6))
            return start, max(start + 1, math.ceil(round(max(origin, origin + size), 6)))

        x0, x1 = axis(self.u, self.w)
        y0, y1 = axis(self.v, self.h)
        return TexelRect(x0, y0, x1, y1)

    def apply(self, face: dict) -> None:
        face['uv'] = [self.u, self.v]
        face['uv_size'] = [self.w, self.h]


class RegionFace(dict):
    """Keep face ownership through mirroring without serializing audit metadata."""

    # A face on a shared sheet tile samples its stored copy mirrored on these axes.
    flip_x = False
    flip_y = False

    def __init__(self, values: dict, region: str, flip_x: bool = False, flip_y: bool = False):
        super().__init__(values)
        self.region = region
        if flip_x or flip_y:
            self.flip_x, self.flip_y = flip_x, flip_y


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
        self._pixels = {}
        self._shared = {}

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


def _pack(registry: RegionRegistry, gutter_px: int = 2, max_side: int | None = None) -> Layout:
    if type(gutter_px) is not int or gutter_px < 0:
        raise ValueError("Gutter must be a nonnegative texel count")
    if max_side is not None and (type(max_side) is not int or max_side <= 0):
        raise ValueError("Maximum atlas side must be a positive texel count")
    regions = sorted(registry.regions(), key=lambda r: r.name)
    if not regions:
        raise ValueError("Cannot pack an empty registry")
    request = atlas_pack.PackRequest(
        tuple(atlas_pack.Size(r.width + gutter_px, r.height + gutter_px) for r in regions),
        gutter_px, max_side)
    result = atlas_pack.search(request)
    layout = Layout(regions, result.size,
                    {r.name: Placement(*origin) for r, origin in zip(regions, result.origins)})
    registry._layout = layout
    return layout


def _pixel_rows(layout, region):
    if region.name not in layout._pixels:
        layout._pixels[region.name] = tuple(
            bytes(channel for u in range(region.width) for channel in region.pixel(u, v))
            for v in range(region.height))
    return layout._pixels[region.name]


def _oriented_rows(rows, flip_x, flip_y):
    if flip_x:
        rows = tuple(b''.join(row[u:u + 4] for u in range(len(row) - 4, -1, -4)) for row in rows)
    return tuple(reversed(rows)) if flip_y else rows


_ORIENTATIONS = ((False, False), (True, False), (False, True), (True, True))


@dataclass(frozen=True)
class TileShare:
    """A tile's stored slot and the flip that maps the tile's pixels onto it."""
    slot: int
    flip_x: bool = False
    flip_y: bool = False


def share_tiles(tiles) -> tuple[list[int], list[TileShare]]:
    """Store sheet tiles once when they repeat, also as left-right or top-bottom mirrors.

    A region packs many tiles into one sheet, so region-level sharing cannot see
    mirrored panel pairs inside it. ``tiles`` holds ``(width, height, rgba)``.
    Returns the indices of the stored tiles in input order and every tile's share;
    a face on a tile reaches its stored copy through ``UvRect.to_atlas`` with a
    ``Placement`` at the slot origin carrying the share's flips.
    """
    stored = []
    shares = []
    signatures = {}
    for index, (width, height, data) in enumerate(tiles):
        if len(data) != width * height * 4:
            raise ValueError("A tile's RGBA bytes must match its dimensions")
        rows = tuple(bytes(data[v * width * 4:(v + 1) * width * 4]) for v in range(height))
        share = signatures.get((width, height, rows))
        if share is None:
            share = TileShare(len(stored))
            stored.append(index)
            for fx, fy in _ORIENTATIONS:
                signatures.setdefault((width, height, _oriented_rows(rows, fx, fy)),
                                      TileShare(share.slot, fx, fy))
        shares.append(share)
    return stored, shares


def pack(registry: RegionRegistry, gutter_px: int = 2, max_side: int | None = None,
         share_key: Callable[[Region], Hashable] | None = None) -> Layout:
    if share_key is None:
        return _pack(registry, gutter_px, max_side)
    regions = sorted(registry.regions(), key=lambda r: r.name)
    cache = Layout(regions, (0, 0), {})
    representatives = RegionRegistry()
    matches = {}
    signatures = {}
    for region in regions:
        rows = _pixel_rows(cache, region)
        key = (share_key(region), region.width, region.height)
        match = signatures.get((key, rows))
        if match is None:
            representatives.register(region)
            match = (region.name, False, False)
            for fx, fy in _ORIENTATIONS:
                signatures.setdefault((key, _oriented_rows(rows, fx, fy)), (region.name, fx, fy))
        matches[region.name] = match
    # Heuristic packing is not monotonic when rectangles are removed. Keeping
    # the old representative slots is always a valid upper bound on area.
    try:
        plain = _pack(registry, gutter_px, max_side)
    except ValueError:
        plain = None
    try:
        packed = _pack(representatives, gutter_px, max_side)
    except ValueError:
        if plain is None:
            raise
        packed = plain
    if plain is not None and math.prod(plain.size) < math.prod(packed.size):
        packed = plain
    placements = {}
    for region in regions:
        representative, fx, fy = matches[region.name]
        p = packed.placement(representative)
        placements[region.name] = Placement(p.x, p.y, fx, fy)
    layout = Layout(regions, packed.size, placements)
    layout._pixels = cache._pixels
    layout._shared = {name: match[0] for name, match in matches.items()}
    registry._layout = layout
    return layout


def render_atlas(layout: Layout) -> bytes:
    width, height = layout.size
    pixels = bytearray(width * height * 4)
    written = set()
    for region in layout.regions:
        p = layout.placement(region.name)
        slot = (p.x, p.y, region.width, region.height)
        if slot in written:
            continue
        written.add(slot)
        rows = _oriented_rows(_pixel_rows(layout, region), p.flip_x, p.flip_y)
        for v, row in enumerate(rows):
            start = ((p.y + v) * width + p.x) * 4
            pixels[start:start + len(row)] = row
    return bytes(pixels)


def audit(layout: Layout, atlas) -> list[str]:
    errors = []
    width, height = layout.size
    pixels = bytes(atlas)
    if len(pixels) != width * height * 4:
        errors.append("Atlas RGBA byte length does not match layout")
    rectangles = []
    oriented = {}
    for region in layout.regions:
        placement = layout.placement(region.name)
        x, y = placement.x, placement.y
        rect = atlas_pack.Rect(x, y, region.width, region.height)
        if x < 0 or y < 0 or x + region.width > width or y + region.height > height:
            errors.append(f"{region.name}: outside atlas")
        for name, other in rectangles:
            shared = layout._shared.get(region.name, region.name) == layout._shared.get(name, name)
            if rect.overlaps(other) and not (rect == other and shared):
                errors.append(f"{region.name}: overlaps {name}")
        rectangles.append((region.name, rect))
        expected = _oriented_rows(_pixel_rows(layout, region), placement.flip_x, placement.flip_y)
        oriented[region.name] = expected
        for v, row in enumerate(expected):
            offset = ((y + v) * width + x) * 4
            actual = pixels[offset:offset + len(row)]
            if actual != row:
                local_v = region.height - 1 - v if placement.flip_y else v
                for u in range(region.width):
                    local_u = region.width - 1 - u if placement.flip_x else u
                    if actual[u * 4:u * 4 + 4] != row[u * 4:u * 4 + 4]:
                        errors.append(f"{region.name}: pixel mismatch at ({local_u}, {local_v})")
                        break
                break
    points = list(layout._uvs)
    by_name = {r.name: r for r in layout.regions}
    checked_faces = set()
    for name, face in layout._faces:
        placement = layout.placement(name)
        region = by_name[name]
        rect = UvRect.of(face)
        local = UvRect(rect.u - placement.x, rect.v - placement.y, rect.w, rect.h).to_atlas(
            Placement(0, 0, placement.flip_x, placement.flip_y), region.width, region.height)
        points.extend(((name, (local.u, local.v)), (name, (local.u + local.w, local.v + local.h))))
        if (name, rect) in checked_faces:
            continue
        checked_faces.add((name, rect))
        endpoints = (local.u, local.v, local.u + local.w, local.v + local.h)
        if not all(math.isfinite(n) for n in endpoints):
            continue
        if not (0 <= round(min(endpoints[0::2]), 6) <= round(max(endpoints[0::2]), 6) <= region.width
                and 0 <= round(min(endpoints[1::2]), 6) <= round(max(endpoints[1::2]), 6) <= region.height):
            continue
        # Clamp boundary samples to the owning region's outermost cell.
        cells = local.texels()
        u0 = min(region.width - 1, max(0, cells.x0))
        u1 = min(region.width, max(u0 + 1, cells.x1))
        v0 = min(region.height - 1, max(0, cells.y0))
        v1 = min(region.height, max(v0 + 1, cells.y1))
        x0, x1 = (region.width - u1, region.width - u0) if placement.flip_x else (u0, u1)
        y0, y1 = (region.height - v1, region.height - v0) if placement.flip_y else (v0, v1)
        sample_x = math.floor(rect.u) if rect.w == 0 else placement.x + x0
        sample_y = math.floor(rect.v) if rect.h == 0 else placement.y + y0
        for row_index in range(y0, y1):
            start = ((sample_y + row_index - y0) * width + sample_x) * 4
            if pixels[start:start + (x1 - x0) * 4] != oriented[name][row_index][x0 * 4:x1 * 4]:
                errors.append(f"{name}: face pixel mismatch")
                break
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


