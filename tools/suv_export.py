"""SUV geometry transforms, animation synchronization and texture writers."""

import json
import struct
import zlib

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
palette = load_tool("suv_palette")
PALETTE = palette.PALETTE
BODY_PAINTS = palette.BODY_PAINTS
swatches = palette.swatches
TEXTURE_WIDTH = palette.TEXTURE_WIDTH
LIT_SLOTS = palette.LIT_SLOTS
MER_LIT = palette.MER_LIT
MER_OFF = palette.MER_OFF


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


def sync_animation(path, scaled):
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
        path.write_text(json.dumps(animation, indent=2) + "\n")


def png(path, w, h, pixel):
    # pixel returns (r, g, b) for an opaque texel or (r, g, b, a)
    rows = b""
    for y in range(h):
        rows += b"\x00" + b"".join(bytes((*pixel(x, y), 255)[:4]) for x in range(w))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    path.write_bytes(data)


def lit_textures(directory, kind, width, height, pixel):
    def is_lit(x, y):
        return y < 4 and x // 4 in LIT_SLOTS

    def color(x, y):
        rgba = (*pixel(x, y), 255)[:4]
        return (*rgba[:3], 0) if is_lit(x, y) else rgba

    def mer(x, y):
        return (*(MER_LIT if is_lit(x, y) else MER_OFF), 255)

    png(directory / f"{kind}_lit.png", width, height, color)
    png(directory / f"{kind}_lit_mer.png", width, height, mer)
    texture_set = {
        "format_version": "1.16.100",
        "minecraft:texture_set": {
            "color": f"{kind}_lit",
            "metalness_emissive_roughness": f"{kind}_lit_mer",
        },
    }
    (directory / f"{kind}_lit.texture_set.json").write_text(json.dumps(texture_set))


def icon(x, y):
    # 16x16 icon: khaki body and black tires
    if 9 <= y <= 12 and (3 <= x <= 5 or 10 <= x <= 12):
        return PALETTE["tire"]
    if 4 <= y <= 9 and 1 <= x <= 14:
        return PALETTE["body"]
    if 1 <= y <= 3 and 4 <= x <= 11:
        return PALETTE["glass"]
    return (0, 0, 0)


def switch_icon(x, y):
    # 16x16 headlight switch icon: a glowing round lamp on a dark switch plate
    if (x - 7.5) ** 2 + (y - 6.5) ** 2 <= 16:
        return PALETTE["light"]
    if 3 <= x <= 12 and 11 <= y <= 14:
        return PALETTE["trim"]
    return (0, 0, 0, 0)


def paint_textures(directory):
    for paint in BODY_PAINTS:
        name = "suv" if paint.name == "khaki" else f"suv_{paint.name}"
        png(directory / f"{name}.png", TEXTURE_WIDTH, 16, swatches(paint.body))


def item_icons(directory):
    png(directory / "suv_item.png", 16, 16, icon)
    png(directory / "headlight_switch.png", 16, 16, switch_icon)
