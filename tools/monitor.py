"""Generate kind-neutral monitor overlays in the final model coordinate frame (ADR 0139)."""

import json
import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

from cube_tilt import assert_axes, cube_matrix

PixelMap = list[list[tuple[int, int, int, int]]]
Vec = tuple[float, float, float]


@dataclass(frozen=True)
class MonitorLayout:
    cell_size: tuple[int, int]
    label_width: int
    face: str
    plate_origin: Vec
    plate_pivot: Vec
    plate_rotation: Vec
    plate_size: Vec
    viewer_point: Vec
    uv_flip: tuple[bool, bool]
    background: tuple[int, int, int, int]
    foreground: tuple[int, int, int, int]
    icon_at: tuple[int, int]
    label_at: tuple[int, int]
    visible_bounds_width: float
    visible_bounds_height: float
    visible_bounds_offset: Vec


GLYPH_ADVANCE = 6  # a 5 px glyph and 1 px of letter spacing
FONT_5X7 = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    " ": ["00000"] * 7,
}


def monitor_cell(screen, layout, icons):
    """One screen of the atlas: the tool's icon on the left and its label centered on the right."""
    label, item = screen["label"], screen["item"]
    label_width = len(label) * GLYPH_ADVANCE - 1
    if label_width > layout.label_width:
        raise ValueError(f"Monitor label exceeds {layout.label_width} px: {label}")
    if any(char not in FONT_5X7 for char in label):
        raise ValueError(f"Missing monitor glyph: {label}")
    if item not in icons:
        raise ValueError(f"Missing monitor icon: {item}")
    cell = [[layout.background for _ in range(layout.cell_size[0])] for _ in range(layout.cell_size[1])]
    icon_x, icon_y = layout.icon_at
    for y, row in enumerate(icons[item]):
        for x, color in enumerate(row):
            cell[icon_y + y][icon_x + x] = color
    label_x = layout.label_at[0] + (layout.label_width - label_width) // 2
    for letter, char in enumerate(label):
        for y, row in enumerate(FONT_5X7[char]):
            for x, pixel in enumerate(row):
                if pixel == "1":
                    cell[layout.label_at[1] + y][label_x + letter * GLYPH_ADVANCE + x] = layout.foreground
    return cell


def monitor_plate(k, layout):
    return {
        "origin": list(layout.plate_origin),
        "size": list(layout.plate_size),
        "uv": monitor_uv(k, layout),
        "rotation": list(layout.plate_rotation),
        "pivot": list(layout.plate_pivot),
    }


def check_monitor_faces_viewer(layout):
    normal = {
        "up": (0, 1, 0), "down": (0, -1, 0),
        "north": (0, 0, -1), "south": (0, 0, 1),
        "east": (1, 0, 0), "west": (-1, 0, 0),
    }[layout.face]
    matrix = cube_matrix(layout.plate_rotation)
    outward = [sum(row[i] * normal[i] for i in range(3)) for row in matrix]
    if sum(n * (s - p) for n, s, p in zip(outward, layout.viewer_point, layout.plate_pivot)) <= 0:
        raise ValueError("Monitor face must point toward the viewer")


def monitor_uv(k, layout):
    """Texture only the selected face; leave the other faces undrawn."""
    uv = [0, layout.cell_size[1] * k]
    uv_size = list(layout.cell_size)
    for axis, flip in enumerate(layout.uv_flip):
        if flip:
            uv[axis] += uv_size[axis]
            uv_size[axis] *= -1
    return {layout.face: {"uv": uv, "uv_size": uv_size}}


def rounded(value):
    if isinstance(value, float):
        return round(value, 3) + 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def png_bytes(width, height, pixel):
    raw = b"".join(b"\x00" + b"".join(bytes(pixel(x, y)) for x in range(width)) for y in range(height))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def write_monitor(kind: str, layout: MonitorLayout, icons: dict[str, PixelMap],
                  check: bool, rp: Path):
    """Write the overlay assets, or return their stale paths without writing in check mode."""
    stale = []

    def emit(path, data):
        if check:
            try:
                matches = (json.loads(path.read_text()) == json.loads(data)
                           if path.suffix == ".json" else path.read_bytes() == data)
            except (OSError, ValueError):
                matches = False
            if not matches:
                stale.append(str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(data, bytes):
                path.write_bytes(data)
            else:
                path.write_text(data)

    check_monitor_faces_viewer(layout)
    screens = json.loads(Path(__file__).with_name("monitor_screens.json").read_text())[kind]
    cells = [monitor_cell(screen, layout, icons) for screen in screens]
    monitor_bones = [
        {"name": f"screen_{screen['item']}_{screen['state']}", "pivot": [0, 0, 0],
         "cubes": [monitor_plate(k, layout)]}
        for k, screen in enumerate(screens)
    ]

    monitor_geo = {
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {"identifier": f"geometry.yasu_ride.{kind}_monitor",
                            "texture_width": layout.cell_size[0], "texture_height": layout.cell_size[1] * len(screens),
                            "visible_bounds_width": layout.visible_bounds_width,
                            "visible_bounds_height": layout.visible_bounds_height,
                            "visible_bounds_offset": list(layout.visible_bounds_offset)},
            "bones": monitor_bones,
        }],
    }
    assert_axes([cube for bone in monitor_bones for cube in bone["cubes"]], {})
    emit(rp / f"models/entity/yasu_ride/{kind}_monitor.geo.json", json.dumps(rounded(monitor_geo), separators=(",", ":")))
    emit(rp / f"textures/entity/yasu_ride/{kind}_monitor.png", png_bytes(
        layout.cell_size[0], layout.cell_size[1] * len(screens),
        lambda x, y: cells[y // layout.cell_size[1]][y % layout.cell_size[1]][x]))
    emit(rp / f"render_controllers/yasu_ride/{kind}_monitor.rc.json", json.dumps({
        "format_version": "1.8.0",
        "render_controllers": {f"controller.render.yasu_ride.{kind}.monitor": {
            "geometry": "Geometry.monitor", "materials": [{"*": "Material.lamp_lit"}],
            "textures": ["Texture.monitor"],
            "part_visibility": [{"*": False}, *[
                {bone["name"]: f"query.property('yasu_ride:monitor') == {k + 1}"}
                for k, bone in enumerate(monitor_bones)
            ]],
        }},
    }, separators=(",", ":")))
    return stale
