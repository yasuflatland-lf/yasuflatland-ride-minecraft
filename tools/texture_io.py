"""Write generated texture assets or compare them by content."""

import json
import os
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool


def texel_reader(size, data):
    return lambda x, y: tuple(data[(y * size + x) * 4 : (y * size + x + 1) * 4])


def rgba_bytes(width, height, pixel):
    """Pack RGB or RGBA callbacks as row-major RGBA, padding RGB with opaque alpha."""
    return bytes(channel for y in range(height) for x in range(width)
                 for channel in (*pixel(x, y), 255)[:4])


class Outputs:
    def __init__(self, check, report_writes=False):
        self.check = check
        self.report_writes = report_writes
        self.stale = []
        self.touched: list[Path] = []

    def _touch(self, path):
        self.touched.append(path)
        report = os.environ.get("GENERATED_OUTPUTS_REPORT")
        if report:
            root = Path(__file__).resolve().parent.parent
            entry = {"generator": os.environ.get("GENERATED_OUTPUTS_GENERATOR")
                         or Path(sys.argv[0]).name,
                     "path": path.resolve().relative_to(root).as_posix()}
            with Path(report).open("a") as stream:
                stream.write(json.dumps(entry) + "\n")

    def json(self, path, doc):
        self._json(path, json.dumps(doc, separators=(",", ":"), ensure_ascii=False) + "\n")

    def fixture_json(self, path, doc):
        self._json(path, json.dumps(doc, indent=2, ensure_ascii=False) + "\n")

    # Freshness depends on content, even when a fixture is reformatted by an editor.
    def _json(self, path, data):
        self._touch(path)
        if self.check:
            try:
                matches = json.loads(path.read_text(encoding="utf-8")) == json.loads(data)
            except (OSError, ValueError) as e:
                self.stale.append(f"{path} ({e})")
                return
            if not matches:
                self.stale.append(str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(data, encoding="utf-8")
            if self.report_writes:
                print(f"wrote {path}")

    # Compare decoded RGBA rows so zlib packing differences do not affect --check.
    def png(self, path, width, height, pixel, compress_level=-1, *, rgb=False):
        pixels = rgba_bytes(width, height, pixel)
        self.rgba(path, width, height, pixels, rgb=rgb, compress_level=compress_level)

    def rgba(self, path, width, height, pixels, rgb=False, compress_level=9):
        """Write rendered RGBA bytes, preserving the renderer's RGB icons and zlib level."""
        self._touch(path)
        if self.check:
            try:
                decoded = load_tool("render_preview").read_png_bytes(path)
                matches = decoded == (width, height, bytes(pixels))
            except (OSError, ValueError, struct.error, zlib.error) as e:
                self.stale.append(f"{path} ({e})")
                return
            if not matches:
                self.stale.append(str(path))
            return
        stride = width * 4
        rows = []
        for y in range(height):
            row = pixels[y * stride : (y + 1) * stride]
            if rgb:
                packed = bytearray(width * 3)
                for channel in range(3):
                    packed[channel::3] = row[channel::4]
                row = packed
            rows.append(b"\x00" + bytes(row))
        raw = b"".join(rows)

        def chunk(kind, payload):
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

        head = struct.pack(">IIBBBBB", width, height, 8, 2 if rgb else 6, 0, 0, 0)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head)
                         + chunk(b"IDAT", zlib.compress(raw, compress_level)) + chunk(b"IEND", b""))
        if self.report_writes:
            print(f"wrote {path}")

    def finish(self, stale_header, ok_message=None):
        if self.stale:
            sys.exit(stale_header + "\n" + "\n".join(self.stale))
        if self.check and ok_message is not None:
            print(ok_message)


def texture_set_doc(color, mer, relief=None):
    """Build a texture set with at most one relief map (Bedrock 1.16.100)."""
    textures = {"color": color, "metalness_emissive_roughness": mer}
    if relief is not None:
        kind, name = relief
        if kind not in ("heightmap", "normal"):
            raise ValueError(f"Unknown relief kind: {kind}")
        textures[kind] = name
    return {"format_version": "1.16.100", "minecraft:texture_set": textures}


def write_texture_set(out, directory, color, mer=None, relief=None):
    out.json(directory / f"{color}.texture_set.json",
             texture_set_doc(color, mer if mer is not None else f"{color}_mer", relief))
