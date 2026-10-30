"""SUV paint metalness, emissivity and roughness policy."""

from typing import Callable

from tool_loader import load_tool

palette = load_tool("suv_palette")
Paint = palette.Paint
mer = load_tool("mer")
Mer = mer.Mer
MER_OFF = mer.MER_OFF

PAINT_METALNESS = 110
PAINT_ROUGHNESS = 60
HARDTOP_ROUGHNESS = 220
GLASS_ROUGHNESS = 30
CHROME_METALNESS = 230
CHROME_ROUGHNESS = 40
RESIN_ROUGHNESS = 235
GLOW_EMISSIVE = 255 - palette.ALPHA["glow"]

SWATCH_MER: dict[str, Mer] = {name: MER_OFF for name in palette.NAMES}
SWATCH_MER.update({
    "body": Mer(PAINT_METALNESS, 0, PAINT_ROUGHNESS),
    "hardtop": Mer(0, 0, HARDTOP_ROUGHNESS),
    "hardtop_rib": Mer(0, 0, HARDTOP_ROUGHNESS),
    "glass": Mer(0, 0, GLASS_ROUGHNESS),
    "rear_glass": Mer(0, 0, GLASS_ROUGHNESS),
    "chrome": Mer(CHROME_METALNESS, 0, CHROME_ROUGHNESS),
    "resin": Mer(0, 0, RESIN_ROUGHNESS),
    # Vibrant Visuals may replace the alpha glow mask with the MER emissive channel.
    "glow": Mer(0, GLOW_EMISSIVE, 255),
})


def mer_pixel(paint: Paint) -> Callable[[int, int], tuple]:
    atlas = load_tool("suv_atlas")

    def pixel(x, y):
        slot = atlas.ATLAS.swatch_at(x, y)
        if slot is not None:
            return SWATCH_MER[palette.NAMES[slot]].rgba()
        hit = atlas.region_at(x, y)
        if hit is None:
            return MER_OFF.rgba()
        block, spec, u, v = hit
        value = atlas.PAINTERS[block].mer(spec.name, u, v, paint)
        # Static paint texture sets must not make unlit lamps glow (ADR 0147, 0192).
        value = value if value is not None else SWATCH_MER[spec.base]
        if value.emissive > 0:
            raise ValueError("SUV paint region MER must not be emissive")
        return value.rgba()

    return pixel
