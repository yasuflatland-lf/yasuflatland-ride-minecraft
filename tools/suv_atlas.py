"""SUV swatches and fixed feature blocks with deterministic region allocation."""

from tool_loader import load_tool

palette = load_tool("suv_palette")
Region = load_tool("swatch_atlas").Region
RegionSpec = load_tool("suv_texture").RegionSpec
# Density is in model pixels before SIZE_SCALE.
TEXELS_PER_PIXEL = 4
ATLAS = load_tool("swatch_atlas").Atlas(
    palette.NAMES, cell=4, inset=1, width=512, height=256, fill=(0, 0, 0, 255))
BLOCKS = {
    name: ATLAS.block(f"block.{name}", *rect)
    for name, rect in (
        ("body", (0, 8, 512, 160)),
        ("headlight", (0, 168, 96, 88)),
        ("tail_lamp", (96, 168, 96, 88)),
        ("dash", (192, 168, 128, 88)),
        ("gauges", (320, 168, 128, 88)),
        ("spare", (448, 168, 64, 88)),
    )
}
PAINTERS = {name: load_tool(f"suv_paint_{module}") for name, module in (
    ("body", "body"), ("headlight", "headlight"), ("tail_lamp", "tail"),
    ("dash", "dash"), ("gauges", "gauges"))}
_REGIONS = {}
for block, painter in PAINTERS.items():
    for spec in painter.REGIONS:
        allocated = BLOCKS[block].allocate(f"{block}.{spec.name}", spec.w, spec.h)
        _REGIONS[block, spec.name] = (allocated, spec)


def region(block: str, name: str) -> Region:
    return _REGIONS[block, name][0]._replace(name=name)


def region_at(x: int, y: int) -> tuple[str, RegionSpec, int, int] | None:
    for (block, _), (r, spec) in _REGIONS.items():
        if r.x <= x < r.x + r.w and r.y <= y < r.y + r.h:
            return block, spec, x - r.x, y - r.y
    return None


def uv(color):
    return {face: ATLAS.face(color) for face in ("north", "south", "east", "west", "up", "down")}
