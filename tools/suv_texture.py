"""SUV region painter contract and colour/lit texture dispatch."""

from typing import Callable, NamedTuple, Protocol

from tool_loader import load_tool

palette = load_tool("suv_palette")
Paint = palette.Paint
Mer = load_tool("mer").Mer


class RegionSpec(NamedTuple):
    name: str
    w: int
    h: int
    base: str


class RegionPainter(Protocol):
    REGIONS: tuple[RegionSpec, ...]

    def color(self, region: str, u: int, v: int, paint: Paint) -> tuple[int, int, int, int]: ...
    def mer(self, region: str, u: int, v: int, paint: Paint) -> Mer | None: ...
    def lit(self, region: str, u: int, v: int) -> bool: ...
    def lit_color(self, region: str, u: int, v: int, paint: Paint) -> tuple[int, int, int] | None:
        """Return the lit pass RGB of a lit texel, or None to keep its unlit colour."""
        ...
    def relief(self, region: str, u: int, v: int) -> int | None:
        """Return signed depth steps (negative is recessed), or None for flat."""
        ...


def paint_pixel(paint: Paint) -> Callable[[int, int], tuple]:
    # Lazy loading lets painter modules import RegionSpec without an atlas import cycle.
    atlas = load_tool("suv_atlas")
    colors = {name: (*rgb, palette.ALPHA.get(name, 255))
              for name, rgb in {**palette.PALETTE, "body": paint.body}.items()}

    def region_pixel(region, u, v):
        block, spec, _, _ = atlas.region_at(region.x, region.y)
        return atlas.PAINTERS[block].color(spec.name, u, v, paint)

    return lambda x, y: atlas.ATLAS.pixel(colors, x, y, region_pixel)


def is_lit(x: int, y: int) -> bool:
    atlas = load_tool("suv_atlas")
    slot = atlas.ATLAS.swatch_at(x, y)
    if slot is not None:
        return slot in palette.LIT_SLOTS
    hit = atlas.region_at(x, y)
    if hit is None:
        return False
    block, spec, u, v = hit
    return atlas.PAINTERS[block].lit(spec.name, u, v)


def lit_pixel(paint: Paint) -> Callable[[int, int], tuple]:
    pixel = paint_pixel(paint)

    def lit_rgb(x, y):
        atlas = load_tool("suv_atlas")
        hit = atlas.region_at(x, y)
        if hit is not None:
            block, spec, u, v = hit
            rgb = atlas.PAINTERS[block].lit_color(spec.name, u, v, paint)
            if rgb is not None:
                return rgb
        return pixel(x, y)[:3]

    return lit_rgb
