"""SUV geometry transforms, animation synchronization and texture writers."""

import json

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
palette = load_tool("suv_palette")
PALETTE = palette.PALETTE
BODY_PAINTS = palette.BODY_PAINTS
ALPHA = palette.ALPHA
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
            # Face directions also swap (north <-> south, east <-> west). The faces are solid colors, so the UVs can stay as they are


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
    if path.exists():
        animation = json.loads(path.read_text())
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
        out.json(path, animation, indent=2)


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
    # 16x16 headlight switch icon: a glowing round lamp on a dark switch plate
    if (x - 7.5) ** 2 + (y - 6.5) ** 2 <= 16:
        return (*PALETTE["light"], 255)
    if 3 <= x <= 12 and 11 <= y <= 14:
        return (*PALETTE["trim"], 255)
    return (0, 0, 0, 0)


def paint_pixel(body_color):
    colors = {name: (*rgb, ALPHA.get(name, 255))
              for name, rgb in {**PALETTE, "body": body_color}.items()}
    return lambda x, y: ATLAS.pixel(colors, x, y)


def paint_textures(out, directory):
    for paint in BODY_PAINTS:
        name = "suv" if paint.name == "khaki" else f"suv_{paint.name}"
        out.png(directory / f"{name}.png", ATLAS.width, ATLAS.height, paint_pixel(paint.body))


def item_icons(out, directory):
    out.png(directory / "suv_item.png", 16, 16, icon)
    out.png(directory / "headlight_switch.png", 16, 16, switch_icon)
