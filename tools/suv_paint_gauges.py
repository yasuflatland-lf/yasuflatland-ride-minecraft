"""gauges block painter, owned by SUV detail 16/17."""

from tool_loader import load_tool

palette = load_tool("suv_palette")
RegionSpec = load_tool("suv_texture").RegionSpec
REGIONS = ()


def color(region, u, v, paint):
    spec = next(spec for spec in REGIONS if spec.name == region)
    rgb = paint.body if spec.base == "body" else palette.PALETTE[spec.base]
    return (*rgb, 255)


def mer(region, u, v, paint):
    return None


def lit(region, u, v):
    return False


def relief(region, u, v):
    return None
