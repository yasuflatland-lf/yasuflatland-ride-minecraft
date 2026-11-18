"""Scooter paint variants, material finishes, switched lamps and inventory icon."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

atlas = load_tool("scooter_atlas")
mer = load_tool("mer")
texture_io = load_tool("texture_io")
lit_textures = load_tool("lit_textures")
texture_variants = load_tool("texture_variants")

DEFAULT_PAINT = "white"
PAINTS = {
    "khaki": atlas.PAINT_IVORY,
    "green": (75, 117, 87),
    "red": (198, 66, 55),
    "white": atlas.PAINT_IVORY,
    "light_gray": (176, 183, 180),
    "gray": (101, 111, 116),
    "black": (49, 53, 56),
    "orange": (222, 125, 66),
    "yellow": (232, 194, 89),
    "lime": (160, 187, 106),
    "cyan": (64, 151, 153),
    "light_blue": (139, 188, 210),
    "blue": (62, 98, 161),
    "purple": (119, 94, 157),
    "magenta": (177, 88, 139),
    "pink": (224, 157, 164),
}

CHANNEL_MAX = 255
RGBA_CHANNELS = 4
DIELECTRIC_METALNESS = 0
CHROME_METALNESS = 230
CAST_METALNESS = 160
CHROME_ROUGHNESS = 40
PAINT_ROUGHNESS = 90
RUBBER_ROUGHNESS = 240
WHITEWALL_ROUGHNESS = 225
LEATHER_ROUGHNESS = 190
LENS_ROUGHNESS = 35
PLATE_ROUGHNESS = 150
CAST_ROUGHNESS = 170
MER_BY_MATERIAL = {
    atlas.Material.PAINT: mer.Mer(DIELECTRIC_METALNESS, 0, PAINT_ROUGHNESS),
    atlas.Material.CHROME: mer.Mer(CHROME_METALNESS, 0, CHROME_ROUGHNESS),
    atlas.Material.RUBBER: mer.Mer(DIELECTRIC_METALNESS, 0, RUBBER_ROUGHNESS),
    atlas.Material.WHITEWALL: mer.Mer(DIELECTRIC_METALNESS, 0, WHITEWALL_ROUGHNESS),
    atlas.Material.LEATHER: mer.Mer(DIELECTRIC_METALNESS, 0, LEATHER_ROUGHNESS),
    atlas.Material.LENS: mer.Mer(DIELECTRIC_METALNESS, 0, LENS_ROUGHNESS),
    atlas.Material.PLATE: mer.Mer(DIELECTRIC_METALNESS, 0, PLATE_ROUGHNESS),
    atlas.Material.CUTOUT: mer.Mer(CAST_METALNESS, 0, CAST_ROUGHNESS),
}
LIT_REGIONS = atlas.LIT_REGIONS


def _unique_regions(layout):
    seen = set()
    for region in layout.regions:
        p = layout.placement(region.name)
        slot = (p.x, p.y, region.width, region.height)
        if slot not in seen:
            seen.add(slot)
            yield region, p


def recolor(layout, pixels, color):
    if color == atlas.PAINT_IVORY:
        return pixels
    tables = [bytes(min(CHANNEL_MAX, round(target * old / ivory))
                    for old in range(CHANNEL_MAX + 1))
              for target, ivory in zip(color, atlas.PAINT_IVORY)]
    result = bytearray(pixels)
    width, _ = layout.size
    for region, placement in _unique_regions(layout):
        if region.material != atlas.Material.PAINT:
            continue
        ox, oy = placement.x, placement.y
        for y in range(oy, oy + region.height):
            start = (y * width + ox) * RGBA_CHANNELS
            end = start + region.width * RGBA_CHANNELS
            for channel, table in enumerate(tables):
                result[start + channel:end:RGBA_CHANNELS] = pixels[start + channel:end:RGBA_CHANNELS].translate(table)
    return bytes(result)


def mer_bytes(layout):
    width, height = layout.size
    result = bytearray(bytes(mer.MER_OFF.rgba()) * (width * height))
    for region, placement in _unique_regions(layout):
        ox, oy = placement.x, placement.y
        row = bytes(MER_BY_MATERIAL[region.material].rgba()) * region.width
        for y in range(oy, oy + region.height):
            start = (y * width + ox) * RGBA_CHANNELS
            result[start:start + len(row)] = row
    return bytes(result)


ICON_SIZE = 16
ICON = (
    "................",
    "................",
    "...........C....",
    "...........C....",
    "..........CIH...",
    "..........CI....",
    "...LLLL...II....",
    "..RIII....II....",
    "..IIIII...II....",
    "..IIIIIC..II....",
    "...IIIICCCIII...",
    "...TTT....TTT...",
    "..TWWWT..TWWWT..",
    "..TWCWT..TWCWT..",
    "...TTT....TTT...",
    "................",
)
ICON_COLORS = {
    "I": atlas.PAINT_IVORY,
    "L": atlas.LEATHER,
    "C": atlas.CHROME_STOPS[1][1],
    "T": atlas.RUBBER_DARK,
    "W": atlas.WHITEWALL,
    "H": atlas.HEAD_LENS,
    "R": atlas.TAIL_LENS,
}


def icon(x, y):
    color = ICON_COLORS.get(ICON[y][x])
    return atlas.CLEAR if color is None else (*color, CHANNEL_MAX)


def write(outputs, rp, fixed_layout, fixed_pixels, layout, pixels, lit_layout, lit_pixels):
    directory = rp / "textures/entity/yasu_ride"
    # Packaging walks the whole pack, including generated outputs from earlier builds.
    for name in ("scooter", *(f"scooter_{paint}" for paint in PAINTS)):
        for suffix in (".png", "_mer.png", ".texture_set.json"):
            obsolete = directory / (name + suffix)
            if obsolete.exists():
                if outputs.check:
                    outputs.stale.append(f"{obsolete} (obsolete combined scooter atlas)")
                else:
                    obsolete.unlink()
    texture_variants.write_variants(outputs, directory, "scooter_fixed", *fixed_layout.size,
                                    [texture_variants.Variant("scooter_fixed", fixed_pixels, mer_bytes(fixed_layout))])
    width, height = layout.size
    material_pixels = mer_bytes(layout)
    variants = []
    for paint, color in PAINTS.items():
        name = "scooter_paint" if paint == "khaki" else f"scooter_paint_{paint}"
        color_pixels = pixels if color == atlas.PAINT_IVORY else recolor(layout, pixels, color)
        variants.append(texture_variants.Variant(name, color_pixels, material_pixels))
    paint_textures = texture_variants.write_variants(outputs, directory, "scooter_paint", width, height, variants)
    width, height = lit_layout.size
    mask = bytearray(width * height)
    for region in lit_layout.regions:
        if region.name in LIT_REGIONS:
            ox, oy = lit_layout.origin(region.name)
            for y in range(oy, oy + region.height):
                for x in range(ox, ox + region.width):
                    # Clear corners of a round lens must not glow as a square plate.
                    mask[y * width + x] = lit_pixels[(y * width + x) * 4 + 3] != 0
    lit_textures.build_lit_textures(
        outputs, directory, "scooter", width, height,
        texture_io.texel_reader(width, lit_pixels), lambda x, y: mask[y * width + x],
        opaque_unlit_cutouts=True)
    outputs.png(rp / "textures/items/yasu_ride/scooter_item.png", ICON_SIZE, ICON_SIZE, icon)
    return paint_textures
