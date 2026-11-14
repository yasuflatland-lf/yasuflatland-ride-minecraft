"""Non-emissive camper finishes, resolved independently of diffuse colour."""

from tool_loader import load_tool

regions = load_tool("camper_regions")
Material = regions.Material
Layout = regions.Layout
RGBA = bytes
kit = load_tool("camper_kit")

MER_BY_MATERIAL: dict[Material, tuple[int, int, int]] = {
    Material.METAL: (255, 0, 60),
    Material.LACQUER: (0, 0, 80),
    Material.GLASS_COAT: (0, 0, 65),
    Material.VINYL: (0, 0, 180),
    Material.WOOD: (0, 0, 150),
    Material.FABRIC: (0, 0, 245),
    Material.CARPET: (0, 0, 250),
    Material.TILE: (0, 0, 80),
    Material.STONE: (0, 0, 85),
    Material.DARK_LACQUER: (0, 0, 85),
}

MER_BY_SWATCH = {
    "white": (0, 0, 85), "panel": (0, 0, 90), "ivory": (0, 0, 80),
    "steel": (255, 0, 75), "chrome": (255, 0, 50),
    "slat": (255, 0, 80), "aluminium": (255, 0, 80),
    "dash": (0, 0, 185), "dark_dash": (0, 0, 190), "dash_pad": (0, 0, 175),
    "gauge": (0, 0, 65), "needle": (0, 0, 65),
    "wood": (0, 0, 155), "wall_in": (0, 0, 160),
    "tweed": (0, 0, 245), "tweed_line": (0, 0, 245), "curtain": (0, 0, 245),
    "piping": (0, 0, 235), "carpet_beige": (0, 0, 250),
    "khaki": (0, 0, 100), "stripe": (0, 0, 100), "tan": (0, 0, 100),
}
MER_BY_HARDWARE = {
    "rib": (0, 0, 85),
    "door_head": (255, 0, 75), "door_hinge": (255, 0, 75),
    "door_latch": (255, 0, 75), "vent_screws": (255, 0, 75), "bolt": (255, 0, 75),
    "mirror_chrome": (255, 0, 26),
    "burner_cast": (0, 0, 255),
}
MER_DEFAULT = (0, 0, 255)


def _mixed_mer(x, y):
    slot = kit.ATLAS.swatch_at(x, y)
    if slot is not None:
        return MER_BY_SWATCH.get(kit.SLOTS[slot], MER_DEFAULT)
    for region in kit.ATLAS.regions:
        if region.x <= x < region.x + region.w and region.y <= y < region.y + region.h:
            return MER_BY_HARDWARE[region.name]
    return MER_DEFAULT


def build_interior_mer(layout: Layout) -> RGBA:
    width, height = layout.size
    pixels = bytearray((*MER_DEFAULT, 255)) * (width * height)
    for region in layout.regions:
        ox, oy = layout.origin(region.name)
        mixed = region.material == Material.SWATCHES_MIXED
        value = None if mixed else MER_BY_MATERIAL[region.material]
        for y in range(region.height):
            for x in range(region.width):
                rgb = _mixed_mer(x, y) if mixed else value
                offset = ((oy + y) * width + ox + x) * 4
                pixels[offset:offset + 4] = bytes((*rgb, 255))
    return bytes(pixels)
