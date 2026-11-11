"""Generate the dev-only cutout probe atlas without image dependencies."""

from pathlib import Path
import struct
import zlib


WIDTH, HEIGHT = 256, 160
PLATE = (216, 176, 124)
DISC = (154, 166, 174)
WATER = (74, 170, 180)
FLOOR = (190, 158, 118)
OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "packs/yasu_ride_test_rp/textures/entity/yasu_ride_test/cutout_probe.png"
)


def pixel(x, y):
    if y < 128:
        dx, dy = (x % 128) + 0.5 - 64, y + 0.5 - 64
        circle = dx * dx + dy * dy <= 60 * 60
        if x < 128:
            # The rounded hole leaves enough material to inspect both edges.
            qx, qy = max(abs(dx) - 20, 0), max(abs(dy) - 30, 0)
            hole = qx * qx + qy * qy <= 8 * 8
            return (*PLATE, 255 if circle and not hole else 0)
        return (*DISC, 255 if circle else 0)
    if x < 64:
        return (*WATER, 140)
    if x < 128:
        return (*FLOOR, 255)
    return (*PLATE, 0)


def chunk(kind, data):
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data))
    )


def main():
    # Constant region RGB extends through alpha zero to avoid filtering halos.
    rows = b"".join(
        b"\0" + bytes(channel for x in range(WIDTH) for channel in pixel(x, y))
        for y in range(HEIGHT)
    )
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows, 9))
        + chunk(b"IEND", b"")
    )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(png)


if __name__ == "__main__":
    main()
