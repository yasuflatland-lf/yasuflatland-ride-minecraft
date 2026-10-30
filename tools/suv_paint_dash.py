"""dash block painter, owned by SUV detail 15/17."""

from tool_loader import load_tool

palette = load_tool("suv_palette")
RegionSpec = load_tool("suv_texture").RegionSpec
REGIONS = (RegionSpec("grain", 32, 32, "resin"),)


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
