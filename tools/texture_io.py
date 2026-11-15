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
            entry = {"generator": Path(sys.argv[0]).name,
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
        self._touch(path)
        pixels = [[(*pixel(x, y), 255)[:4] for x in range(width)] for y in range(height)]
        if self.check:
            try:
                matches = load_tool("render_preview").read_png(path) == pixels
            except (OSError, ValueError, struct.error, zlib.error) as e:
                self.stale.append(f"{path} ({e})")
                return
            if not matches:
                self.stale.append(str(path))
            return
        raw = b"".join(b"\x00" + b"".join(bytes(texel[:3] if rgb else texel) for texel in row) for row in pixels)

        def chunk(kind, payload):
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

        head = struct.pack(">IIBBBBB", width, height, 8, 2 if rgb else 6, 0, 0, 0)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head)
                         + chunk(b"IDAT", zlib.compress(raw, compress_level)) + chunk(b"IEND", b""))
        if self.report_writes:
            print(f"wrote {path}")

    def rgba(self, path, width, height, pixels, rgb=False):
        """Write rendered RGBA bytes, preserving the renderer's RGB icons and zlib level."""
        self.png(path, width, height, texel_reader(width, pixels), 9, rgb=rgb)

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
