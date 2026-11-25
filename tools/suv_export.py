"""SUV geometry transforms, animation synchronization and texture writers."""

import json
from pathlib import Path

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
palette = load_tool("suv_palette")
PALETTE = palette.PALETTE
BODY_PAINTS = palette.BODY_PAINTS
texture = load_tool("suv_texture")
material = load_tool("suv_material")
texture_io = load_tool("texture_io")
texture_variants = load_tool("texture_variants")
transform_uv = load_tool("suv_cubes").transform_uv
ATLAS = load_tool("suv_atlas").ATLAS


def turn_around(bones):
    """Rotate 180° around the Y axis (negate x and z)."""
    for bone in bones:
        if "pivot" in bone:
            bone["pivot"] = [-bone["pivot"][0] or 0, bone["pivot"][1], -bone["pivot"][2] or 0]
        for name, (lx, ly, lz) in bone.get("locators", {}).items():
            bone["locators"][name] = [-lx, ly, -lz]
        for cube in bone.get("cubes", []):
            (x, y, z), (w, h, d) = cube["origin"], cube["size"]
            cube["origin"] = [-(x + w), y, -(z + d)]
            if "pivot" in cube:
                cube["pivot"] = [-cube["pivot"][0], cube["pivot"][1], -cube["pivot"][2]]
            if "rotation" in cube:
                rx, ry, rz = cube["rotation"]
                cube["rotation"] = [-rx, ry, -rz]
            cube["uv"] = transform_uv(cube["uv"], "xz")


def scaled(vector):
    return [round(value * SIZE_SCALE, 12) for value in vector]


def scale_geometry(geometry):
    for bone in geometry["bones"]:
        bone["pivot"] = scaled(bone["pivot"])
        for name, locator in bone.get("locators", {}).items():
            bone["locators"][name] = scaled(locator)
        for cube in bone.get("cubes", []):
            for key in ("origin", "size", "pivot"):
                if key in cube:
                    cube[key] = scaled(cube[key])
    description = geometry["description"]
    for key in ("visible_bounds_width", "visible_bounds_height"):
        description[key] *= SIZE_SCALE
    description["visible_bounds_offset"] = scaled(description["visible_bounds_offset"])


def sync_animation(out, path, scaled):
    # Rebuild translations from construction lengths on every run, avoiding cumulative scaling.
    animation = json.loads((Path(__file__).resolve().parent / "templates/suv.anim.json").read_text())
    for name, clip in animation["animations"].items():
        for member, channels in clip.get("bones", {}).items():
            if "position" not in channels:
                continue
            side = 1 if member.endswith("l") else -1
            folded = "wheels_" in name
            offset = scaled([side * (FOLD_OUT if folded else SUB_OUT),
                             -FOLD_DROP if folded else 0, 0])
            position = channels["position"]
            if isinstance(position, list):
                channels["position"] = offset
            else:
                channels["position"] = {t: offset if any(v) else [0, 0, 0]
                                        for t, v in position.items()}
    out.fixture_json(path, animation)


def icon(x, y):
    # 16x16 icon: khaki body and black tires
    if 9 <= y <= 12 and (3 <= x <= 5 or 10 <= x <= 12):
        return (*PALETTE["tire"], 255)
    if 4 <= y <= 9 and 1 <= x <= 14:
        return (*PALETTE["body"], 255)
    if 1 <= y <= 3 and 4 <= x <= 11:
        return (*PALETTE["glass"], 255)
    return (0, 0, 0, 255)


def switch_icon(x, y):
    # 16x16 headlight switch icon: the white high-beam symbol, a D-shaped lamp with light bars.
    blue, light = (248, 248, 250, 255), (196, 202, 214, 255)
    if y in (3, 5, 7, 9, 11) and 0 <= x <= (3 if y in (3, 11) else 4):
        return blue
    reach = abs(y - 7)
    if reach <= 5:
        width = (10, 10, 10, 9, 7, 5)[reach]
        if 6 <= x < 6 + width:
            return light if (x, y) in ((7, 4), (7, 5), (8, 4)) else blue
    return (0, 0, 0, 0)


def booster_icon(x, y):
    # 16x16 booster icon: a red and white rocket climbing to the upper right with a flame trail.
    # u runs along the rocket toward its nose, v across it toward the lower right.
    root = 2 ** 0.5
    dx, dy = x + 0.5 - 8, 8 - (y + 0.5)
    u, v = (dx + dy) / root + 1.2, (dx - dy) / root
    reach = abs(v)
    if -3.4 <= u <= 5.6:
        half = 2.3 if u <= 2.6 else 2.3 * ((5.8 - u) / 3.2) ** 0.5
        if reach <= half:
            if u >= 5.0:
                return (45, 45, 52, 255)
            if u > 2.6:
                return (150, 25, 28, 255) if v > 0.6 else (215, 45, 38, 255)
            if (u - 0.4) ** 2 + v ** 2 <= 1.1:
                return (70, 120, 160, 255) if v < 0.2 else (45, 80, 115, 255)
            return (165, 172, 184, 255) if v > 0.9 else (240, 240, 244, 255)
    if -4.4 <= u <= -0.6 and 2.3 < reach <= 4.2 and u <= -0.6 - (reach - 2.3) * 1.3:
        return (150, 25, 28, 255) if v > 0 else (215, 45, 38, 255)
    if -4.4 <= u < -3.4 and reach <= 1.3:
        return (70, 72, 80, 255)
    if -9 <= u < -4.4:
        taper = 1 - (-4.4 - u) / 4.6
        if reach <= 1.9 * taper:
            if reach <= 0.7 * taper or u > -5.6:
                return (255, 248, 215, 255)
            return (255, 214, 55, 255)
        if reach <= 2.5 * taper:
            return (255, 130, 30, 255)
    return (0, 0, 0, 0)


def nav_icon(x, y):
    if not 1 <= x <= 14:
        return (0, 0, 0, 0)
    top = (5, 5, 4, 4, 3, 3, 4, 4, 5, 5, 4, 4, 3, 3)[x - 1]
    row = y - top
    if not 0 <= row <= 9:
        return (0, 0, 0, 0)
    if row in (0, 9) or x in (1, 14):
        return (107, 85, 58, 255)
    if 9 <= x <= 13 and abs(x - 11) == abs(y - 8):
        return (192, 43, 40, 255)
    if row == 2 + x // 3:
        return (99, 160, 180, 255)
    if 6 <= x <= 9:
        return (204, 185, 139, 255)
    return (249, 232, 180, 255)


def paint_textures(out, directory):
    relief_name = f"suv_{material.RELIEF_KIND}"
    out.png(directory / f"{relief_name}.png", ATLAS.width, ATLAS.height,
            material.relief_pixel(material.RELIEF_KIND))
    for other_kind in material.RELIEF_KINDS:
        if other_kind == material.RELIEF_KIND:
            continue
        out.remove(directory / f"suv_{other_kind}.png")
    variants = [texture_variants.Variant(
        "suv" if paint.name == "khaki" else f"suv_{paint.name}",
        texture_io.rgba_bytes(ATLAS.width, ATLAS.height, texture.paint_pixel(paint)),
        texture_io.rgba_bytes(ATLAS.width, ATLAS.height, material.mer_pixel(paint)),
    ) for paint in BODY_PAINTS]
    texture_variants.write_variants(
        out, directory, "suv", ATLAS.width, ATLAS.height, variants,
        relief=(material.RELIEF_KIND, relief_name))


def item_icons(out, directory):
    out.png(directory / "suv_item.png", 16, 16, icon)
    out.png(directory / "headlight_switch.png", 16, 16, switch_icon)
    out.png(directory / "booster.png", 16, 16, booster_icon)
    out.png(directory / "nav.png", 16, 16, nav_icon)
