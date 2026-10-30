"""Square MER atlases with row-major swatches, each palette entry (RGB or RGBA, MER).

RGBA alpha is data: alpha 0 is the entity_emissive mask (ADR 0020, 0147).
"""

import json
import math
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")


def face(slot, swatch=8, columns=4):
    """Return one square swatch's UV rectangle in a row-major atlas."""
    return {"uv": [swatch * (slot % columns), swatch * (slot // columns)],
            "uv_size": [swatch, swatch]}


def swatch_entry(palette, x, y, size, swatch):
    return palette[(y // swatch) * (size // swatch) + x // swatch]


def atlas_pixels(palette, size=32, swatch=8, streak_rows=16):
    """Return RGBA bytes, preserving palette alpha (RGB entries default to 255).

    streak_rows reproduces the fire pit and Dutch oven stainless look, changing
    only R, G and B. Set it to zero for flat swatches, including emissive masks.
    """
    out = bytearray()
    for y in range(size):
        for x in range(size):
            color, _ = swatch_entry(palette, x, y, size, swatch)
            streak = round(3 * math.sin(x * 1.5 + y * 0.2)) if y < streak_rows else 0
            out.extend((*(max(0, min(255, c + streak)) for c in color[:3]),
                        color[3] if len(color) == 4 else 255))
    return bytes(out)


def mer_pixels(palette, size=32, swatch=8):
    """Return row-major MER bytes with opaque alpha for every texel."""
    out = bytearray()
    for y in range(size):
        for x in range(size):
            _, material = swatch_entry(palette, x, y, size, swatch)
            out.extend((*material, 255))
    return bytes(out)


def write_png(path, size, data):
    texture_io.Outputs(False).png(path, size, size, texture_io.texel_reader(size, data), compress_level=9)


def read_png(path, size):
    data = path.read_bytes()
    pos, compressed = 8, b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        if data[pos + 4 : pos + 8] == b"IDAT":
            compressed += data[pos + 8 : pos + 8 + length]
        pos += length + 12
    raw = zlib.decompress(compressed)
    stride = size * 4
    return b"".join(raw[y * (stride + 1) + 1 : (y + 1) * (stride + 1)] for y in range(size))


def texture_set_doc(color_name):
    return texture_io.texture_set_doc(color_name, f"{color_name}_mer")


def write_or_check(root, check, files, stale_message):
    """Write or compare geometry, texture set, colour PNG, then MER PNG.

    files maps geometry and texture_set to (relative path, JSON document),
    and color and mer to (relative path, size, RGBA bytes).
    """
    out = texture_io.Outputs(check)
    for name in ("geometry", "texture_set"):
        relative, doc = files[name]
        out.json(root / relative, json.dumps(doc, separators=(",", ":")) + "\n")
    for name in ("color", "mer"):
        relative, size, data = files[name]
        out.png(root / relative, size, size, texture_io.texel_reader(size, data), compress_level=9)
    if out.stale:
        sys.exit(stale_message + "\n" + "\n".join(out.stale))
