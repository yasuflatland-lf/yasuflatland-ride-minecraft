"""Frozen region-sharing packer from before issue #2013."""

import math
from typing import Callable, Hashable

from tool_loader import load_tool


_region_atlas = load_tool("region_atlas")
Region = _region_atlas.Region
RegionRegistry = _region_atlas.RegionRegistry
Layout = _region_atlas.Layout
Placement = _region_atlas.Placement
_pack = _region_atlas._pack
_pixel_rows = _region_atlas._pixel_rows
_oriented_rows = _region_atlas._oriented_rows
_ORIENTATIONS = _region_atlas._ORIENTATIONS


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
