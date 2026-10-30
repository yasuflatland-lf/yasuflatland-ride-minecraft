"""Write generated texture assets or compare them by content."""

import json
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool


class Outputs:
    def __init__(self, check):
        self.check = check
        self.stale = []

    def json(self, path, doc, separators=None, indent=None):
        data = doc if isinstance(doc, str) else json.dumps(doc, separators=separators, indent=indent)
        if self.check:
            try:
                matches = json.loads(path.read_text()) == json.loads(data)
            except (OSError, ValueError):
                matches = False
            if not matches:
                self.stale.append(str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(data)

    def png(self, path, width, height, pixel, compress_level=-1):
        pixels = [[tuple(pixel(x, y)) for x in range(width)] for y in range(height)]
        if self.check:
            try:
                matches = load_tool("render_preview").read_png(path) == pixels
            except (OSError, ValueError, struct.error, zlib.error):
                matches = False
            if not matches:
                self.stale.append(str(path))
            return
        raw = b"".join(b"\x00" + b"".join(bytes(texel) for texel in row) for row in pixels)

        def chunk(kind, payload):
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

        head = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head)
                         + chunk(b"IDAT", zlib.compress(raw, compress_level)) + chunk(b"IEND", b""))

    def finish(self, stale_header, ok_message):
        if self.stale:
            sys.exit(stale_header + "\n" + "\n".join(self.stale))
        print(ok_message)


def texture_set_doc(color, mer, relief=None):
    """Build a texture set; relief is reserved for future use."""
    if relief is not None:
        raise NotImplementedError("Relief texture sets are reserved for future use")
    return {"format_version": "1.16.100", "minecraft:texture_set": {
        "color": color, "metalness_emissive_roughness": mer}}


def write_texture_set(out, directory, color, mer=None):
    out.json(directory / f"{color}.texture_set.json", texture_set_doc(color, mer if mer is not None else f"{color}_mer"))
