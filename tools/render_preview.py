"""Render the README previews and the pack icons from the vehicle models.

    python3 -I tools/render_preview.py <resource pack> <output dir>          write the images
    python3 -I tools/render_preview.py <resource pack> <output dir> --check  fail if any is stale
    python3 -I tools/render_preview.py <resource pack> --gear sugar_pot --view front top --out /tmp/views
    python3 -I tools/render_preview.py <resource pack> --view sinkTap --out /tmp/views
    python3 -I tools/render_preview.py <resource pack> --view lidOpen --lid 45 --out /tmp/views
    python3 -I tools/render_preview.py <resource pack> <output dir> --beach-chair-form chair --view -1 0.65 -1

Add --icons <pack dir> ... to either command to also write or check pack_icon.png in each pack: a
256-pixel RGB icon of the flying pose with the lamps on, framed on its own, with a cyan glow behind
each folded wheel over a charcoal and orange background. yasu_ride_test_bp gets it in grayscale, so
the test pack stands out in the pack list.

Four SUV poses share one camera and one scale, so they line up side by side in the README: on the
ground, with the headlights on at night, flying with the wheels folded (ADR 0027), and under water
as a submarine (ADR 0045). Four sports boat pictures share another scale: afloat in its default
black and with the headlights on at night from the SUV's angle, from its rear-left corner, and from
straight above (ADR 0056). Four camper pictures share a third scale: front-left,
headlights at dusk, side, and rear, without water layers (ADR 0067).
Four bulldozer pictures share a fourth scale: front-left, headlights at dusk, side, and rear,
showing only the first grouser phase and no propeller (ADR 0136). The beacon stays unlit: it faces
backward on the cab roof, so the cab hides it from the front-left dusk view.

Each camping gear item in tools/camping_gear.json gets its own 128-pixel square preview in
<output dir>/items/camping-gear/<id>.png, from the same angle as the vehicles, with no ground,
its longer side filling 80 percent of the square, for its row in docs/items/camping-gear.md
(ADR 0093). The low chair and tent get previews the same way from their entity models (ADR 0122, 0130).

Only the standard library is used, like gen_model.py. The arithmetic avoids math.sin/cos (their
last bit can differ between platforms' libm) so the same model renders to the same pixels on a Mac
and on the Linux CI runner. --check compares decoded pixels rather than PNG bytes, because zlib
builds do not all compress identically.
"""
import argparse
import json
import math
import multiprocessing
import os
import struct
import sys
import zlib
from dataclasses import dataclass, replace
from pathlib import Path

GEOMETRY = "models/entity/yasu_ride/suv.geo.json"
TEXTURE = "textures/entity/yasu_ride/suv.png"
ANIMATIONS = "animations/yasu_ride/suv.anim.json"
WIDTH, HEIGHT = 800, 600
SUPERSAMPLE = 3
MARGIN = 0.04  # fraction of the image kept empty around the union of all poses

# Seen from the vehicle's front-left at 45 degrees, about 25 degrees above the ground.
VIEW_DIRECTION = (-1.0, 0.65, -1.0)
CAMERA_DISTANCE = 6.0  # in multiples of the model's size; far enough to keep perspective mild

# Minecraft's fixed face shading: top faces full brightness, north/south 0.8, east/west 0.6, bottom 0.5.
SHADE_UP, SHADE_DOWN, SHADE_Z, SHADE_X = 1.0, 0.5, 0.8, 0.6
# A level side view shows almost only east/west faces, so the whole picture sits at 0.6. A pose can
# set "brightness" to lift its faces back to the level of the other views.
SIDE_BRIGHTNESS = 1.0 / SHADE_X
# The sports boat hull is near black, which a multiplier barely changes, so its rear picture also adds
# a flat "lift" (0 to 255) to every lit face.
BOAT_LIFT = 36
# The main pictures of each vehicle (SUV, boat, camper, bulldozer) are lifted a little too.
MAIN_BRIGHTNESS = 1.3

SHADOW_LAYERS = 12
SHADOW_ALPHA = 0.025  # per layer, so the center of the shadow is 0.3
SHADOW_GROWTH = 0.5  # pixels (model units) added around the footprint per layer

# Dusk: unlit surfaces are dimmed and tinted blue so the lamps stand out.
NIGHT_TINT = (0.6, 0.64, 0.8)
LAMP_LIT = (255, 246, 205)
LIT_TEXTURE = "textures/entity/yasu_ride/suv_lit.png"
LIT_GAIN = 0.5  # Fraction of the way from a lit texel's color to full white.
# With lamps on, a "texel" bone follows suv_lit.png's alpha-0 mask, as in the game's lit pass,
# moving its color toward white by LIT_GAIN. Other texels keep normal shading.
SUV_LIT_BONES: dict[str, str] = {"headlights": "texel", "tail_lights": "texel"}
# Only these bones skip alpha-0 texels; elsewhere alpha is an emissive mask, ignored for color.
SUV_CUTOUT_BONES: frozenset[str] = frozenset()
HEADLIGHTS_LIT = {"headlights": LAMP_LIT}
# Light on the road ahead. In game it reaches 27 blocks (ADR 0024); the picture shows the first
# few so the vehicle keeps its size.
BEAM_LAYERS = 24
BEAM_LENGTH = 36.0
BEAM_ALPHA = 0.03
BEAM_SPREAD = 0.35  # half width gained per unit of length
BEAM_COLOR = (255, 232, 160)

# Flight: the takeoff lifts the vehicle 1.5 blocks (ADR 0021).
FLIGHT_LIFT = 24.0
GLOW_LIT = (130, 205, 255)
GLOW_POOL_LAYERS = 10
GLOW_POOL_ALPHA = 0.03
GLOW_POOL_SIZE = 1.0
GLOW_POOL_GROWTH = 0.6
FLIGHT_SHADOW_ALPHA = 0.012  # the shadow of a hovering vehicle is fainter

# Bloom around emissive faces, in output pixels. The lamps glow where they can be seen. The discs
# under the folded wheels are hidden from above, so their bloom is drawn through the body but only
# shows around it.
BLOOM_RADIUS = 6
BLOOM_PASSES = 3
BLOOM = {"lamp": {"strength": 1.6, "through_body": False}, "disc": {"strength": 2.2, "through_body": True}}

# Under water every surface takes a blue-green cast, over a seabed of the same color (ADR 0045).
WATER_TINT = (0.55, 0.78, 0.92)
SEABED_COLOR = (40, 120, 150)
SEABED_LAYERS = 10
SEABED_ALPHA = 0.06
SEABED_MARGIN = 14.0

# Pack icon: the flying pose on a charcoal background with one orange band from the lower-left
# corner to the middle of the right edge, and a cyan disc glowing under each folded wheel.
ICON_SIZE = 256  # Bedrock wants a square power-of-two icon no larger than 256 px
ICON_FILL = 0.8  # fraction of the icon width the vehicle spans
ICON_BACKGROUND = (22, 24, 28)  # #16181C
ICON_BAND_COLOR = (242, 140, 40)  # #F28C28
ICON_BAND_HEIGHT = 0.18  # fraction of the icon height
GLOW_DISC_COLOR = (90, 215, 255)  # #5AD7FF
GLOW_DISC_ALPHA = 0.9  # at the center, falling linearly to 0 at the rim
GLOW_DISC_REACH = 1.6  # rim radius in multiples of the wheel radius
ICON_GRAYSCALE_PACK = "yasu_ride_test_bp"

# The sports boat floats with its feet about 0.45 blocks under the surface (docs/spikes/sportsboat.md)
BOAT_GEOMETRY = "models/entity/yasu_ride/sportsboat.geo.json"
BOAT_TEXTURE = "textures/entity/yasu_ride/sportsboat.png"
BOAT_WATERLINE = 7.2
BOAT_WATER_COLOR = (30, 105, 165)
BOAT_WATER_LAYERS = 10
BOAT_WATER_ALPHA = 0.07
BOAT_WATER_MARGIN = 14.0
BOAT_BEAM_LENGTH = 40.0
# The rear view mirrors the SUV's angle front to back. The top view puts the bow on the right, so
# the long hull fills the landscape frame.
BOAT_REAR_VIEW = (-1.0, 0.65, 1.0)
BOAT_TOP_VIEW = (0.0, 1.0, 0.0)
BOAT_TOP_SCREEN_UP = (-1.0, 0.0, 0.0)
BOAT_POSES = {
    "sportsboat-afloat.png": {"lamps": False, "dusk": False, "view": VIEW_DIRECTION, "screen_up": None, "brightness": MAIN_BRIGHTNESS, "lift": BOAT_LIFT},
    "sportsboat-headlights.png": {"lamps": True, "dusk": True, "view": VIEW_DIRECTION, "screen_up": None},
    "sportsboat-rear.png": {"lamps": False, "dusk": False, "view": BOAT_REAR_VIEW, "screen_up": None, "brightness": MAIN_BRIGHTNESS, "lift": BOAT_LIFT},
    "sportsboat-top.png": {"lamps": False, "dusk": False, "view": BOAT_TOP_VIEW, "screen_up": BOAT_TOP_SCREEN_UP, "brightness": MAIN_BRIGHTNESS, "lift": BOAT_LIFT},
}

CAMPER_GEOMETRY = "models/entity/yasu_ride/camper.geo.json"
CAMPER_TEXTURE = "textures/entity/yasu_ride/camper.png"
# Kitchen counter, range and burner faces map whole laminate and stainless
# regions (up to 192 x 192 texels) onto sub-unit strips, exhausting CI memory.
# 16 cells/unit keeps >2 cells per final pixel (max 5.55 px/unit).
CAMPER_CELLS_PER_UNIT = 16
CAMPER_POSES = {
    "camper-front-left.png": {"lamps": False, "dusk": False, "view": (-1.0, 0.65, -1.0), "screen_up": None, "merge_texels": True, "cells_per_unit": CAMPER_CELLS_PER_UNIT, "brightness": MAIN_BRIGHTNESS},
    "camper-headlights.png": {"lamps": True, "dusk": True, "view": (-1.0, 0.65, -1.0), "screen_up": None, "merge_texels": True, "cells_per_unit": CAMPER_CELLS_PER_UNIT},
    "camper-side.png": {"lamps": False, "dusk": False, "view": (1.0, 0.15, 0.0001), "screen_up": None, "merge_texels": True, "cells_per_unit": CAMPER_CELLS_PER_UNIT, "brightness": SIDE_BRIGHTNESS},
    "camper-rear.png": {"lamps": False, "dusk": False, "view": (1.0, 0.6, 1.0), "screen_up": None, "merge_texels": True, "cells_per_unit": CAMPER_CELLS_PER_UNIT, "brightness": MAIN_BRIGHTNESS},
}

BULLDOZER_GEOMETRY = "models/entity/yasu_ride/bulldozer.geo.json"
BULLDOZER_TEXTURE = "textures/entity/yasu_ride/bulldozer.png"
# Only the first grouser phase is drawn, and the propeller only shows under water (ADR 0136)
BULLDOZER_HIDDEN = ("track_r_1", "track_r_2", "track_l_1", "track_l_2", "propeller", "blade_wide")
BULLDOZER_POSES = {
    "bulldozer-front-left.png": {"lamps": False, "dusk": False, "view": (-1.0, 0.65, -1.0), "screen_up": None, "brightness": MAIN_BRIGHTNESS},
    "bulldozer-headlights.png": {"lamps": True, "dusk": True, "view": (-1.0, 0.65, -1.0), "screen_up": None},
    "bulldozer-side.png": {"lamps": False, "dusk": False, "view": (1.0, 0.15, 0.0001), "screen_up": None, "brightness": SIDE_BRIGHTNESS},
    "bulldozer-rear.png": {"lamps": False, "dusk": False, "view": (1.0, 0.6, 1.0), "screen_up": None, "brightness": MAIN_BRIGHTNESS},
}

# Each camping gear item gets its own square preview for its row in docs/items/camping-gear.md,
# filled to GEAR_FILL of the square so even the flat road map shows its detail (ADR 0093)
GEAR_SPEC = Path(__file__).resolve().parent / "camping_gear.json"
GEAR_GEOMETRY = "models/blocks/yasu_ride/{}.geo.json"
GEAR_TEXTURE = "textures/blocks/yasu_ride/camping_gear.png"
GEAR_DIR = "items/camping-gear"
GEAR_SIZE = 128
GEAR_SWATCH_AREA = 16
GEAR_VIEW_SIZE = 512
GEAR_VIEWS = {
    "front": (0, 0.15, -1),
    "back": (0, 0.15, 1),
    "left": (1, 0.15, 0),
    "right": (-1, 0.15, 0),
    "top": (0, 1, 0),
    "threeQuarter": VIEW_DIRECTION,
}
GEAR_FILL = 0.8
GEAR_ICON_DIR = "textures/items/yasu_ride"
GEAR_ICON_SIZE = 32
GEAR_ICON_PACK = "yasu_ride_rp"  # the --icons pack that receives the gear item icons
# The low chair and tent stand outside the vehicles and have their own entity models, but their
# previews and icons match the gear's (ADR 0122, 0130)
CHAIR_GEOMETRY = "models/entity/yasu_ride/low_chair.geo.json"
CHAIR_TEXTURE = "textures/entity/yasu_ride/low_chair.png"
CHAIR_PREVIEW = "low_chair"
CHAIR_ICON = "low_chair_item"
NOGA_CHAIR_GEOMETRY = "models/entity/yasu_ride/noga_chair.geo.json"
NOGA_CHAIR_TEXTURE = "textures/entity/yasu_ride/noga_chair.png"
NOGA_CHAIR_PREVIEW = "noga_chair"
NOGA_CHAIR_ICON = "noga_chair_item"
TENT_GEOMETRY = "models/entity/yasu_ride/tent.geo.json"
TENT_TEXTURE = "textures/entity/yasu_ride/tent.png"
TENT_PREVIEW = "tent"
TENT_ICON = "tent_item"
ROOF_TENT_GEOMETRY = "models/entity/yasu_ride/roof_tent.geo.json"
ROOF_TENT_TEXTURE = "textures/entity/yasu_ride/roof_tent.png"
ROOF_TENT_PREVIEW = "roof_tent"
ROOF_TENT_ICON = "roof_tent_item"
# Preview coordinates mirror model x: -x here exposes the model's +x ladder/window.
ROOF_TENT_VIEW = (-1.0, 0.65, -1.0)
TABLE_GEOMETRY = "models/entity/yasu_ride/camp_table.geo.json"
TABLE_TEXTURE = "textures/entity/yasu_ride/camp_table.png"
TABLE_PREVIEW = "camp_table"
TABLE_ICON = "camp_table_item"
FIRE_PIT_GEOMETRY = "models/entity/yasu_ride/fire_pit.geo.json"
FIRE_PIT_TEXTURE = "textures/entity/yasu_ride/fire_pit.png"
FIRE_PIT_PREVIEW = "fire_pit"
FIRE_PIT_ICON = "fire_pit_item"
DUTCH_OVEN_GEOMETRY = "models/entity/yasu_ride/dutch_oven.geo.json"
DUTCH_OVEN_TEXTURE = "textures/entity/yasu_ride/dutch_oven.png"
DUTCH_OVEN_PREVIEW = "dutch_oven"
DUTCH_OVEN_ICON = "dutch_oven_item"
GAS_LANTERN_GEOMETRY = "models/entity/yasu_ride/gas_lantern.geo.json"
GAS_LANTERN_TEXTURE = "textures/entity/yasu_ride/gas_lantern.png"
GAS_LANTERN_PREVIEW = "gas_lantern"
GAS_LANTERN_ICON = "gas_lantern_item"
RESORT_SPEC = Path(__file__).resolve().parent / "resort_gear.json"
RESORT_GEAR = json.loads(RESORT_SPEC.read_text())
RESORT_GEOMETRY = "models/entity/yasu_ride/{}.geo.json"
RESORT_TEXTURE = "textures/entity/yasu_ride/{}.png"
BEACH_CHAIR_GEOMETRY = RESORT_GEOMETRY.format("beach_chair")
BEACH_CHAIR_TEXTURE = RESORT_TEXTURE.format("beach_chair")
TEXTURED_GEOMETRY_FILES = tuple(f"{piece['geometry']}.geo.json" for piece in RESORT_GEAR if piece["textured"])
CUTOUT_GEOMETRY_FILES = tuple(f"{piece['geometry']}.geo.json" for piece in RESORT_GEAR if piece["cutout"])
CUTOUT_ALPHA = 128
PHOTO_VIEW_SIZE = 800
PHOTO_NEAR = 0.2
LID_OPEN = 91
# The reference viewer's VIEWS, applied in the frame the previews are drawn in (after mirror(),
# the game's). A generator that copies the reference model's x into the geometry shows up mirrored
# here: sinkLeg, which targets an off-centre leg, would then look at empty floor.
PHOTO_VIEWS = {
    "topFront": {"piece": "toilet", "position": (0, 41.1, -22.5), "target": (0, 8.6, 0.4), "fov": 30},
    "side": {"piece": "toilet", "position": (-37.2, 8.5, 0.4), "target": (0, 8.4, 0.4), "fov": 30},
    "leftFront": {"piece": "toilet", "position": (-15.5, 20, -33.3), "target": (0, 8.5, 0.8), "fov": 30},
    "lidOpen": {"piece": "toilet", "position": (0, 40.3, -21.7), "target": (0, 8.5, 0.8), "fov": 30, "lid": LID_OPEN},
    "sinkFront": {"piece": "washstand", "position": (-22, 29, -38), "target": (0, 9, 0), "fov": 30},
    "sinkBowl": {"piece": "washstand", "position": (-4.6, 32.7, -21.7), "target": (0, 15.5, 0), "fov": 30},
    "sinkTap": {"piece": "washstand", "position": (-8.5, 21.6, -4.5), "target": (0.4, 18.5, 3.0), "fov": 30},
    "sinkBowlTop": {"piece": "washstand", "position": (0, 29.3, -9.8), "target": (0, 14.5, 0.5), "fov": 30},
    "sinkDrain": {"piece": "washstand", "position": (0, 22.5, -2.4), "target": (0, 13.9, -1.05), "fov": 30},
    "sinkLeg": {"piece": "washstand", "position": (5.7, 2.2, -8.5), "target": (7.7, 1.3, -4.45), "fov": 30},
    "sinkNet": {"piece": "washstand", "position": (-3, 15, -21), "target": (0, 3, 0), "fov": 30},
    "sinkWood": {"piece": "washstand", "position": (3.3, 17.1, -16.5), "target": (6.3, 13.6, -5), "fov": 30},
}
ICON_NAMES = {**{piece["name"]: piece["item"] for piece in RESORT_GEAR}, ROOF_TENT_PREVIEW: ROOF_TENT_ICON, NOGA_CHAIR_PREVIEW: NOGA_CHAIR_ICON, CHAIR_PREVIEW: CHAIR_ICON, TENT_PREVIEW: TENT_ICON, TABLE_PREVIEW: TABLE_ICON, FIRE_PIT_PREVIEW: FIRE_PIT_ICON, DUTCH_OVEN_PREVIEW: DUTCH_OVEN_ICON, GAS_LANTERN_PREVIEW: GAS_LANTERN_ICON}

POSES = {
    "suv-front-left.png": {"lamps": False, "dusk": False, "hover": False, "submarine": False, "brightness": MAIN_BRIGHTNESS},
    "suv-headlights.png": {"lamps": True, "dusk": True, "hover": False, "submarine": False},
    "suv-flying.png": {"lamps": False, "dusk": False, "hover": True, "submarine": False, "brightness": MAIN_BRIGHTNESS},
    "suv-submarine.png": {"lamps": False, "dusk": False, "hover": False, "submarine": True},
}


def read_png(path):
    """Decode an 8-bit RGB or RGBA PNG without interlacing into rows of RGBA tuples."""
    data = path.read_bytes()
    pos, idat, header = 8, b"", None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind, body = data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            header = w, h, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or color not in (2, 6) or interlace:
                raise ValueError(f"{path}: only 8-bit RGB/RGBA PNGs without interlacing are supported")
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    if header is None:
        raise ValueError(f"{path}: no IHDR chunk")
    channels = 4 if color == 6 else 3
    stride = w * channels
    raw = zlib.decompress(idat)
    if len(raw) != h * (stride + 1):
        raise ValueError(f"{path}: image data is {len(raw)} bytes, expected {h * (stride + 1)}")
    rows, prev = [], bytearray(stride)
    for y in range(h):
        filter_type = raw[y * (stride + 1)]
        if filter_type > 4:
            raise ValueError(f"{path}: unknown filter type {filter_type} on row {y}")
        line = bytearray(raw[y * (stride + 1) + 1 : (y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if filter_type == 1:
                line[i] = (line[i] + a) & 0xFF
            elif filter_type == 2:
                line[i] = (line[i] + b) & 0xFF
            elif filter_type == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif filter_type == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 0xFF
        rows.append([tuple(line[x * channels : x * channels + 3]) + ((line[x * channels + 3],) if channels == 4 else (255,)) for x in range(w)])
        prev = line
    return rows


def write_png(path, w, h, pixels, rgb=False):
    channels = 3 if rgb else 4
    if rgb:
        pixels = bytes(c for i, c in enumerate(pixels) if i % 4 != 3)
    raw = b"".join(b"\x00" + bytes(pixels[y * w * channels : (y + 1) * w * channels]) for y in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2 if rgb else 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def sin_cos(degrees):
    """Taylor series in plain float arithmetic, which every IEEE 754 platform computes identically."""
    r = degrees * 3.141592653589793 / 180.0
    s, c, term_s, term_c = 0.0, 0.0, r, 1.0
    for n in range(12):
        s += term_s
        c += term_c
        term_s *= -r * r / ((2 * n + 2) * (2 * n + 3))
        term_c *= -r * r / ((2 * n + 1) * (2 * n + 2))
    return s, c


def rotate(point, pivot, rotation):
    x, y, z = (point[i] - pivot[i] for i in range(3))
    for axis, degrees in zip("xyz", rotation):
        if not degrees:
            continue
        s, c = sin_cos(degrees)
        if axis == "x":
            y, z = y * c - z * s, y * s + z * c
        elif axis == "y":
            x, z = x * c + z * s, -x * s + z * c
        else:
            x, y = x * c - y * s, x * s + y * c
    return (x + pivot[0], y + pivot[1], z + pivot[2])


# Correct only for single-color faces (as gen_model.py paints them); nonuniform UVs use textured_face.
def face_color(texture, face, tex_w, tex_h):
    (u, v), (du, dv) = face["uv"], face["uv_size"]
    x = min(int((u + du / 2) * len(texture[0]) / tex_w), len(texture[0]) - 1)
    y = min(int((v + dv / 2) * len(texture) / tex_h), len(texture) - 1)
    return texture[y][x]


def textured_face(texture, face, quad, name, tex_w, tex_h, merge=False, cells_per_unit=None):
    """Split at texel boundaries, optionally limiting cell density along each model-space axis."""
    (u, v), (du, dv) = face["uv"], face["uv_size"]
    u, du = u * len(texture[0]) / tex_w, du * len(texture[0]) / tex_w
    v, dv = v * len(texture) / tex_h, dv * len(texture) / tex_h

    def breaks(start, length):
        if length == 0:
            return [0, 1]
        lo, hi = sorted((start, start + length))
        return sorted([0, 1, *[(n - start) / length for n in range(math.floor(lo) + 1, math.ceil(hi))]])

    # Bedrock up/down UVs run u along +x and v toward -z; side faces run v downward.
    order = (1, 2, 3, 0) if name in ("north", "east", "up") else (3, 2, 1, 0)
    tl, tr, br, bl = [quad[i] for i in order]
    us, vs = breaks(u, du), breaks(v, dv)
    capped = False
    if cells_per_unit is not None:
        def limit(axis_breaks, edge):
            # Rotated corners differ by one ulp between macOS and Linux libm; snap before ceil.
            count = max(1, math.ceil(round(math.dist(*edge) * cells_per_unit, 6)))
            return [i / count for i in range(count + 1)] if len(axis_breaks) - 1 > count else axis_breaks

        limited_us, limited_vs = limit(us, (tl, tr)), limit(vs, (tl, bl))
        capped = limited_us is not us or limited_vs is not vs
        us, vs = limited_us, limited_vs
    if merge:
        # Merge equal texels before creating geometry: furniture atlases can otherwise
        # expand one face into hundreds of thousands of Python polygon objects.
        cells = []
        active = {}
        for a, b in zip(us, us[1:]):
            x = max(0, min(len(texture[0]) - 1, int(u + du * (a + b) / 2)))
            runs = []
            for c, d in zip(vs, vs[1:]):
                y = max(0, min(len(texture) - 1, int(v + dv * (c + d) / 2)))
                color = texture[y][x]
                if runs and runs[-1][2] == color:
                    runs[-1] = (runs[-1][0], d, color)
                else:
                    runs.append((c, d, color))
            next_active = {}
            for c, d, color in runs:
                key = (c, d, color)
                if key in active:
                    index = active[key]
                    cells[index] = (cells[index][0], b, c, d, color)
                else:
                    index = len(cells)
                    cells.append((a, b, c, d, color))
                next_active[key] = index
            active = next_active
    else:
        cells = []
        for a, b in zip(us, us[1:]):
            for c, d in zip(vs, vs[1:]):
                x = max(0, min(len(texture[0]) - 1, int(u + du * (a + b) / 2)))
                y = max(0, min(len(texture) - 1, int(v + dv * (c + d) / 2)))
                cells.append((a, b, c, d, texture[y][x]))
    if len({color for *_, color in cells}) == 1:
        yield quad, cells[0][-1] if capped else face_color(texture, face, tex_w, tex_h)
        return

    points = {}

    def point(a, b):
        key = (a, b)
        if merge and key in points:
            return points[key]
        result = tuple((1 - b) * ((1 - a) * tl[i] + a * tr[i]) +
                       b * ((1 - a) * bl[i] + a * br[i]) for i in range(3))
        if merge:
            points[key] = result
        return result

    for a, b, c, d, color in cells:
        corners = [point(a, c), point(b, c), point(b, d), point(a, d)]
        patch = [None] * 4
        for i, corner in zip(order, corners):
            patch[i] = corner
        yield patch, color


def cube_faces(cube):
    (x, y, z), (w, h, d) = cube["origin"], cube["size"]
    x1, y1, z1 = x + w, y + h, z + d
    corners = {
        "north": [(x, y, z), (x, y1, z), (x1, y1, z), (x1, y, z)],
        "south": [(x, y, z1), (x1, y, z1), (x1, y1, z1), (x, y1, z1)],
        "west": [(x, y, z), (x, y, z1), (x, y1, z1), (x, y1, z)],
        "east": [(x1, y, z), (x1, y1, z), (x1, y1, z1), (x1, y, z1)],
        "down": [(x, y, z), (x1, y, z), (x1, y, z1), (x, y, z1)],
        "up": [(x, y1, z), (x, y1, z1), (x1, y1, z1), (x1, y1, z)],
    }
    pivot, rotation = cube.get("pivot", [0, 0, 0]), cube.get("rotation", [0, 0, 0])
    for name, quad in corners.items():
        yield name, [rotate(p, pivot, rotation) for p in quad]


def folded_wheels(animations):
    """Bone name -> (z rotation, position) of the folded wheels, read from the hover animation (ADR 0022)."""
    bones = animations["animations"]["animation.yasu_ride.suv.wheels_folded"]["bones"]
    return {
        name: (pose["rotation"][2], pose["position"])
        for name, pose in bones.items()
        if name.startswith("wheel_")
    }


def submerged_parts(animations):
    """Bone name -> (rotation, position) of the turned rear wheels and props, read from the submerged
    animation (ADR 0040). The props' spin is a Molang expression, so it is drawn at rest."""
    bones = animations["animations"]["animation.yasu_ride.suv.submerged"]["bones"]
    return {
        name: ([a if isinstance(a, (int, float)) else 0 for a in pose["rotation"]], pose["position"])
        for name, pose in bones.items()
        if "rotation" in pose
    }


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def normalize(a):
    n = math.sqrt(dot(a, a))  # sqrt is correctly rounded by IEEE 754, unlike sin/cos
    return (a[0] / n, a[1] / n, a[2] / n)


def shade(normal):
    nx, ny, nz = normal
    return nx * nx * SHADE_X + nz * nz * SHADE_Z + ny * ny * (SHADE_UP if ny > 0 else SHADE_DOWN)


def mirror(quad):
    # Bedrock geometry is mirrored on x compared with the world: the steering wheel at the model's
    # -x shows up on the right in game. Flipping x here makes the picture match the game.
    return [(-x, y, z) for x, y, z in quad]


def combine_textures(texture, lit_texture):
    """Join each base texel with the lit texel at the same spot, so one UV lookup reads both."""
    if lit_texture is None:
        raise ValueError("Texel lighting requires a lit texture")
    if len(texture) != len(lit_texture) or any(len(row) != len(lit_row) for row, lit_row in zip(texture, lit_texture)):
        raise ValueError("Base and lit texture sizes differ")
    return [[base + lit for base, lit in zip(row, lit_row)] for row, lit_row in zip(texture, lit_texture)]


def collect(geo, texture, folds, turns, pose, lit_texture=None, lit_bones=SUV_LIT_BONES, cutout_bones=SUV_CUTOUT_BONES):
    """Return the vehicle's faces as (quad, rgb, bloom group or None)."""
    desc = geo["description"]
    lift = FLIGHT_LIFT if pose["hover"] else 0.0
    if pose["dusk"]:
        tint = NIGHT_TINT
    elif pose["submarine"]:
        tint = WATER_TINT
    else:
        tint = (1.0, 1.0, 1.0)
    polygons = []
    combined_texture = None
    for bone in geo["bones"]:
        name = bone["name"]
        # The render controller hides the glow while the gear is down: on the ground and under water (ADR 0022)
        if name.startswith("glow_") and not pose["hover"]:
            continue
        # The render controller shows the rear glass in every form but car
        if name == "rear_glass" and not (pose["hover"] or pose["submarine"]):
            continue
        # The wheel arms are scaled to zero outside flight (ADR 0043)
        if name.startswith("arm_") and not pose["hover"]:
            continue
        # The submarine bones are hidden outside the submarine form (ADR 0040)
        if (name == "windows_sealed" or name.startswith(("prop_", "sub_arm_"))) and not pose["submarine"]:
            continue
        # Each rotation sign below was pinned from the game on its own axis
        motion = None
        if pose["hover"] and name in folds:
            # The fold's z rotation turns the other way from this rotate() (ADR 0022: hub side down)
            angle, offset = folds[name]
            motion = ((0, 0, -angle), offset)
        elif pose["submarine"] and name in turns:
            # The right-handed x and y turn that the rear-hub test in tests/packs/resourcePack.test.ts
            # uses, whose direction was pinned from the game
            (rx, ry, _), offset = turns[name]
            motion = ((rx, ry, 0), offset)
        style = lit_bones.get(name) if pose["lamps"] else None
        emissive = "disc" if name.startswith("glow_") else None
        face_texture = texture
        if style == "texel" and not emissive:
            if combined_texture is None:
                combined_texture = combine_textures(texture, lit_texture)
            face_texture = combined_texture
        for cube in bone.get("cubes", []):
            # In game a cube's x and z rotations turn the other way from this rotate() (ADR 0051, 0058)
            rx, ry, rz = cube.get("rotation", [0, 0, 0])
            for face, quad in cube_faces({**cube, "rotation": [-rx, ry, -rz]}):
                if motion:
                    rotation, (dx, dy, dz) = motion
                    quad = [rotate(p, bone["pivot"], rotation) for p in quad]
                    # Animation positions run along the model's axes: in game a positive x moves the +x
                    # rear wheel out (ADR 0043)
                    quad = [(x + dx, y + dy, z + dz) for x, y, z in quad]
                quad = mirror([(x, y + lift, z) for x, y, z in quad])
                normal = cross(sub(quad[1], quad[0]), sub(quad[3], quad[0]))
                if dot(normal, normal) == 0:
                    continue
                if emissive:
                    polygons.append((quad, GLOW_LIT, emissive))
                    continue
                k = shade(normalize(normal)) * pose.get("brightness", 1.0)
                face_lift = pose.get("lift", 0)
                for patch, texel in textured_face(face_texture, cube["uv"][face], quad, face, desc["texture_width"], desc["texture_height"]):
                    r, g, b, alpha = texel[:4]
                    if name in cutout_bones and alpha == 0:
                        continue
                    if style == "texel" and texel[7] == 0:
                        # texel[4:] is the lit texture's texel that combine_textures appended
                        rgb = tuple(c + (255 - c) * LIT_GAIN for c in texel[4:7])
                        polygons.append((patch, rgb, "lamp"))
                    else:
                        rgb = (r * k * tint[0] + face_lift, g * k * tint[1] + face_lift, b * k * tint[2] + face_lift)
                        polygons.append((patch, rgb, None))
    return polygons


def ground_layers(polygons, pose, ground_y):
    """Translucent quads on the ground as (quad, alpha, rgb): the shadow, then the headlight beam, the
    seabed, or the glow pools of the pose."""
    points = [p for quad, _, emissive in polygons if not emissive for p in quad]
    x_lo, x_hi = min(p[0] for p in points), max(p[0] for p in points)
    z_lo, z_hi = min(p[2] for p in points), max(p[2] for p in points)
    shadow_alpha = FLIGHT_SHADOW_ALPHA if pose["hover"] else SHADOW_ALPHA
    layers = []
    for layer in range(SHADOW_LAYERS):
        g = layer * SHADOW_GROWTH
        quad = [(x_lo - g, ground_y, z_lo - g), (x_hi + g, ground_y, z_lo - g), (x_hi + g, ground_y, z_hi + g), (x_lo - g, ground_y, z_hi + g)]
        layers.append((quad, shadow_alpha, (0, 0, 0)))
    if pose["lamps"]:
        # The front is the model's -z side (ADR 0009)
        half = (x_hi - x_lo) / 2 * 0.6
        for layer in range(BEAM_LAYERS):
            length = BEAM_LENGTH * (layer + 1) / BEAM_LAYERS
            spread = half + length * BEAM_SPREAD
            quad = [(-half, ground_y, z_lo), (-spread, ground_y, z_lo - length), (spread, ground_y, z_lo - length), (half, ground_y, z_lo)]
            layers.append((quad, BEAM_ALPHA, BEAM_COLOR))
    if pose["submarine"]:
        # A seabed of layered blue-green that fades out away from the vehicle
        for layer in range(SEABED_LAYERS):
            g = SEABED_MARGIN * (layer + 1) / SEABED_LAYERS
            quad = [(x_lo - g, ground_y, z_lo - g), (x_hi + g, ground_y, z_lo - g), (x_hi + g, ground_y, z_hi + g), (x_lo - g, ground_y, z_hi + g)]
            layers.append((quad, SEABED_ALPHA, SEABED_COLOR))
    if pose["hover"]:
        for quad, _, emissive in polygons:
            if emissive != "disc" or quad[0][1] != min(p[1] for p in quad):
                continue
            cx = sum(p[0] for p in quad) / 4
            cz = sum(p[2] for p in quad) / 4
            for layer in range(GLOW_POOL_LAYERS):
                s = GLOW_POOL_SIZE + layer * GLOW_POOL_GROWTH
                pool = [(cx - s, ground_y, cz - s), (cx + s, ground_y, cz - s), (cx + s, ground_y, cz + s), (cx - s, ground_y, cz + s)]
                layers.append((pool, GLOW_POOL_ALPHA, GLOW_LIT))
    return layers


def game_turn(rotation):
    # In game x and z rotations turn the other way from this rotate() (ADR 0051, 0058), for bones as
    # for cubes
    rx, ry, rz = rotation
    return [-rx, ry, -rz]


def bone_turns(bones):
    """Bone name -> the (pivot, rotation) turns that pose its cubes, its own first and then each
    rotated ancestor's, as the game composes a child bone inside its parent. Bones with no rotation
    in their chain get none, so their cubes keep their exact coordinates."""
    by_name = {bone["name"]: bone for bone in bones}
    turns = {}
    for bone in bones:
        chain, current = [], bone
        while current is not None:
            if any(current.get("rotation", [0, 0, 0])):
                chain.append((current["pivot"], game_turn(current["rotation"])))
            current = by_name.get(current.get("parent"))
        turns[bone["name"]] = chain
    return turns


@dataclass(frozen=True)
class TextureFace:
    texture: list
    uv: dict
    name: str
    width: int
    height: int
    light: float
    tint: tuple
    lift: float
    merge: bool
    cells_per_unit: float | None
    face_cache: dict | None
    cache_key: tuple

    def patches(self, quad):
        if self.face_cache is not None and self.cache_key in self.face_cache:
            patches = self.face_cache[self.cache_key]
        else:
            patches = textured_face(self.texture, self.uv, quad, self.name,
                                    self.width, self.height, merge=self.merge,
                                    cells_per_unit=self.cells_per_unit)
            if self.face_cache is not None:
                # Expand only visible faces, then reuse unshaded patches across poses.
                patches = list(patches)
                self.face_cache[self.cache_key] = patches
        for patch, color in patches:
            yield patch, tuple(color[i] * self.light * self.tint[i] + self.lift for i in range(3)), None


def opaque_region(texture, uv, width, height):
    (u, v), (du, dv) = uv['uv'], uv['uv_size']
    tw, th = len(texture[0]), len(texture)
    x0, x1 = sorted((u * tw / width, (u + du) * tw / width))
    y0, y1 = sorted((v * th / height, (v + dv) * th / height))
    def indices(lo, hi, limit):
        start = max(0, min(limit - 1, math.floor(lo)))
        return range(start, max(start + 1, min(limit, math.ceil(hi))))
    return all(texture[y][x][3] == 255
               for y in indices(y0, y1, th) for x in indices(x0, x1, tw))



def collect_boat(geo, texture, pose, lit=HEADLIGHTS_LIT, texture_mapping=False, *, cutout=False, face_cache=None, frame_quads=None, defer_textures=False):
    """Return the boat's opaque faces as (quad, rgb, bloom group or None) and its see-through faces as
    (quad, rgb, alpha). Bones named in lit glow in their color while the lamps are on."""
    desc = geo["description"]
    tint = NIGHT_TINT if pose["dusk"] else (1.0, 1.0, 1.0)
    polygons, glass = [], []
    opacity = {}
    turns = bone_turns(geo["bones"])
    for bone in geo["bones"]:
        color = lit.get(bone["name"]) if pose["lamps"] else None
        for cube in bone.get("cubes", []):
            for face, quad in cube_faces({**cube, "rotation": game_turn(cube.get("rotation", [0, 0, 0]))}):
                for pivot, rotation in turns[bone["name"]]:
                    quad = [rotate(p, pivot, rotation) for p in quad]
                quad = mirror(quad)
                normal = cross(sub(quad[1], quad[0]), sub(quad[3], quad[0]))
                if dot(normal, normal) == 0:
                    continue
                if color is not None and not cutout:
                    polygons.append((quad, color, "lamp"))
                    if frame_quads is not None:
                        frame_quads.append(quad)
                    continue
                # Mirroring x reverses winding; textured gear opts into outward normals.
                if pose.get("outward_normals", False):
                    normal = tuple(-component for component in normal)
                k = shade(normalize(normal)) * pose.get("brightness", 1.0)
                face_lift = pose.get("lift", 0)
                uv = cube["uv"][face]
                cache_key = (bone["name"], id(cube), face, pose.get("merge_texels", False), pose.get("cells_per_unit"))
                if texture_mapping and defer_textures and not cutout:
                    key = (*uv['uv'], *uv['uv_size'])
                    if key not in opacity:
                        opacity[key] = opaque_region(texture, uv, desc['texture_width'], desc['texture_height'])
                    if opacity[key]:
                        polygons.append((quad, TextureFace(texture, uv, face,
                            desc['texture_width'], desc['texture_height'],
                            k, tint, face_lift, pose.get('merge_texels', False),
                            pose.get('cells_per_unit'), face_cache, cache_key), None))
                        if frame_quads is not None:
                            frame_quads.append(quad)
                        continue
                if texture_mapping:
                    key = cache_key
                    if face_cache is not None and key in face_cache:
                        patches = face_cache[key]
                    else:
                        patches = textured_face(texture, uv, quad, face, desc["texture_width"], desc["texture_height"], merge=pose.get("merge_texels", False), cells_per_unit=pose.get("cells_per_unit"))
                        if face_cache is not None:
                            # Camper poses share static geometry and atlas pixels; shade each pose below.
                            patches = list(patches)
                            face_cache[key] = patches
                else:
                    patches = [(quad, face_color(texture, uv, desc["texture_width"], desc["texture_height"]))]
                if frame_quads is not None:
                    patches = list(patches)
                    if patches and all(pixel[3] == 255 for _, pixel in patches):
                        # Perspective extrema of an opaque planar face occur at its corners.
                        frame_quads.append(quad)
                    else:
                        frame_quads.extend(patch for patch, pixel in patches if pixel[3] == 255)
                for patch, (r, g, b, a) in patches:
                    if cutout and a < CUTOUT_ALPHA:
                        continue
                    if color is not None:
                        polygons.append((patch, color, "lamp"))
                        continue
                    rgb = (r * k * tint[0] + face_lift, g * k * tint[1] + face_lift, b * k * tint[2] + face_lift)
                    if a < 255:
                        glass.append((patch, rgb, a / 255))
                    else:
                        polygons.append((patch, rgb, None))
    return polygons, glass


def water_layers(polygons, pose):
    """See-through quads on the water surface as (quad, rgb, alpha): water that fades out away from
    the hull, then the headlight beam."""
    points = [p for quad, _, _ in polygons for p in quad]
    x_lo, x_hi = min(p[0] for p in points), max(p[0] for p in points)
    z_lo, z_hi = min(p[2] for p in points), max(p[2] for p in points)
    y = BOAT_WATERLINE
    layers = []
    for layer in range(BOAT_WATER_LAYERS):
        g = BOAT_WATER_MARGIN * (layer + 1) / BOAT_WATER_LAYERS
        quad = [(x_lo - g, y, z_lo - g), (x_hi + g, y, z_lo - g), (x_hi + g, y, z_hi + g), (x_lo - g, y, z_hi + g)]
        layers.append((quad, BOAT_WATER_COLOR, BOAT_WATER_ALPHA))
    if pose["lamps"]:
        # The beam leaves the water under the lamps on the bow flanks; the front is the model's -z
        # side (ADR 0009)
        lamps = [p for quad, _, emissive in polygons if emissive == "lamp" for p in quad]
        half = max(abs(p[0]) for p in lamps)
        start = min(p[2] for p in lamps)
        for layer in range(BEAM_LAYERS):
            length = BOAT_BEAM_LENGTH * (layer + 1) / BEAM_LAYERS
            spread = half + length * BEAM_SPREAD
            quad = [(-half, y, start), (-spread, y, start - length), (spread, y, start - length), (half, y, start)]
            layers.append((quad, BEAM_COLOR, BEAM_ALPHA))
    return layers


class Camera:
    @classmethod
    def looking_at(cls, eye, target):
        camera = cls.__new__(cls)
        camera.eye, camera.target = eye, target
        camera.back = normalize(sub(eye, target))
        camera.right = normalize(cross((0.0, 1.0, 0.0), camera.back))
        camera.up = cross(camera.back, camera.right)
        return camera

    def __init__(self, points, view=VIEW_DIRECTION, screen_up=None):
        """screen_up is the world direction that points up in the image; it is needed when the view
        looks straight down, and defaults to the world's up."""
        lo = [min(p[i] for p in points) for i in range(3)]
        hi = [max(p[i] for p in points) for i in range(3)]
        self.target = tuple((lo[i] + hi[i]) / 2 for i in range(3))
        size = math.sqrt(dot(sub(hi, lo), sub(hi, lo)))
        self.back = normalize(view)
        self.eye = tuple(self.target[i] + self.back[i] * size * CAMERA_DISTANCE for i in range(3))
        self.right = normalize(cross(screen_up or (0.0, 1.0, 0.0), self.back))
        self.up = cross(self.back, self.right)

    def project(self, p):
        """Return (x, y, 1/depth) on a plane one unit in front of the eye, y pointing down."""
        v = sub(p, self.eye)
        depth = -dot(v, self.back)
        return (dot(v, self.right) / depth, -dot(v, self.up) / depth, 1.0 / depth)


@dataclass(frozen=True)
class ScreenFit:
    camera: Camera
    scale: float
    off_x: float
    off_y: float

    def __call__(self, quad):
        return [(self.off_x + self.scale * x, self.off_y + self.scale * y, q)
                for x, y, q in map(self.camera.project, quad)]


@dataclass(frozen=True)
class PhotoScreenFit(ScreenFit):
    @classmethod
    def for_fov(cls, camera, fov, size=PHOTO_VIEW_SIZE):
        s, c = sin_cos(fov / 2)
        center = size * SUPERSAMPLE / 2
        return cls(camera, center / (s / c), center, center)

    def clip(self, polygon):
        """Clip in world space so close-up cameras never project across zero depth."""
        clipped = []
        for a, b in zip(polygon, polygon[1:] + polygon[:1]):
            da = -dot(sub(a, self.camera.eye), self.camera.back)
            db = -dot(sub(b, self.camera.eye), self.camera.back)
            if (da >= PHOTO_NEAR) != (db >= PHOTO_NEAR):
                t = (PHOTO_NEAR - da) / (db - da)
                clipped.append(tuple(a[i] + t * (b[i] - a[i]) for i in range(3)))
            if db >= PHOTO_NEAR:
                clipped.append(b)
        return clipped

    def __call__(self, quad):
        return super().__call__(self.clip(quad))


@dataclass(frozen=True)
class RasterJob:
    name: str
    polygons: list
    layers: list
    to_screen: ScreenFit
    width: int
    height: int
    background: list | None
    bloom: dict
    see_through: tuple | list


def rasterize_job(job: RasterJob) -> bytearray:
    return rasterize(job.polygons, job.layers, job.to_screen, job.width, job.height,
                     job.background, job.bloom, job.see_through)


def fill(polygon, w, h, plot):
    """Scanline-fill a convex polygon, calling plot(x, y, inv_depth) at each covered pixel center."""
    if len(polygon) < 3:
        return
    (x0, y0, q0), (x1, y1, q1), (x2, y2, q2) = polygon[0], polygon[1], polygon[2]
    det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if det == 0:
        return
    # 1/depth is affine in screen space for a planar polygon
    qa = ((q1 - q0) * (y2 - y0) - (q2 - q0) * (y1 - y0)) / det
    qb = ((x1 - x0) * (q2 - q0) - (x2 - x0) * (q1 - q0)) / det
    qc = q0 - qa * x0 - qb * y0
    ys = [p[1] for p in polygon]
    for py in range(max(0, math.ceil(min(ys) - 0.5)), min(h, math.ceil(max(ys) - 0.5))):
        yc = py + 0.5
        xs = []
        for (ax, ay, _), (bx, by, _) in zip(polygon, polygon[1:] + polygon[:1]):
            if (ay <= yc < by) or (by <= yc < ay):
                xs.append(ax + (yc - ay) * (bx - ax) / (by - ay))
        if len(xs) < 2:
            continue
        for px in range(max(0, math.ceil(min(xs) - 0.5)), min(w, math.ceil(max(xs) - 0.5))):
            plot(px, py, qa * (px + 0.5) + qb * yc + qc)


def box_blur(plane, w, h, x0, y0, x1, y1, radius):
    """Blur plane[y * w + x] in place inside the box [x0, x1) x [y0, y1), rows then columns."""
    n = 2 * radius + 1
    for y in range(y0, y1):
        row = [plane[y * w + x] for x in range(x0, x1)]
        for x in range(x0, x1):
            lo, hi = max(0, x - x0 - radius), min(len(row), x - x0 + radius + 1)
            plane[y * w + x] = sum(row[lo:hi]) / n
    for x in range(x0, x1):
        col = [plane[y * w + x] for y in range(y0, y1)]
        for y in range(y0, y1):
            lo, hi = max(0, y - y0 - radius), min(len(col), y - y0 + radius + 1)
            plane[y * w + x] = sum(col[lo:hi]) / n


def add_bloom(planes, body, source, config, width, height):
    """Blur the emissive samples in source (supersampled index -> rgb) and add them to planes."""
    w, n = width * SUPERSAMPLE, SUPERSAMPLE * SUPERSAMPLE
    bloom = [[0.0] * (width * height) for _ in range(4)]
    rows, cols = [], []
    for i, rgb in source.items():
        oy, ox = i // w // SUPERSAMPLE, (i % w) // SUPERSAMPLE
        rows.append(oy)
        cols.append(ox)
        o = oy * width + ox
        for c in range(3):
            bloom[c][o] += rgb[c] / n
        bloom[3][o] += 1.0 / n
    # Only blur the box the bloom can reach, which keeps this fast in pure Python
    reach = BLOOM_RADIUS * BLOOM_PASSES
    x0, x1 = max(0, min(cols) - reach), min(width, max(cols) + reach + 1)
    y0, y1 = max(0, min(rows) - reach), min(height, max(rows) + reach + 1)
    for plane in bloom:
        for _ in range(BLOOM_PASSES):
            box_blur(plane, width, height, x0, y0, x1, y1, BLOOM_RADIUS)
    for y in range(y0, y1):
        for x in range(x0, x1):
            o = y * width + x
            k = config["strength"] * (1.0 - body[o] if config["through_body"] else 1.0)
            for c in range(4):
                planes[c][o] += bloom[c][o] * k


def rasterize(polygons, layers, to_screen, width=WIDTH, height=HEIGHT, background=None, bloom=BLOOM, see_through=()):
    w, h = width * SUPERSAMPLE, height * SUPERSAMPLE

    # Premultiplied (r, g, b, a) under the vehicle. The shadow and light pools add up on top of
    # the background when one is given, and the downsample below scales any sum whose alpha
    # exceeds 1 back to 1. The icon passes an opaque background and no pools.
    ground = [None] * (w * h) if background is None else background
    for quad, alpha, rgb in layers:

        def lay(px, py, _, alpha=alpha, rgb=rgb):
            i = py * w + px
            r, g, b, a = ground[i] or (0.0, 0.0, 0.0, 0.0)
            ground[i] = (r + rgb[0] * alpha, g + rgb[1] * alpha, b + rgb[2] * alpha, a + alpha)

        fill(to_screen(quad), w, h, lay)

    depth = [0.0] * (w * h)  # stores 1/depth, so larger is nearer and 0 is empty
    color = [None] * (w * h)
    def visible_patches():
        for quad, rgb, emissive in polygons:
            if not isinstance(rgb, TextureFace):
                yield quad, rgb, emissive
                continue
            # Test the whole face against already drawn opaque geometry before
            # expanding a large fabric region. Keep ties for the existing depth rule.
            visible = [False]
            def probe(x, y, q):
                if q >= depth[y * w + x] - 1e-10:
                    visible[0] = True
            fill(to_screen(quad), w, h, probe)
            if visible[0]:
                yield from rgb.patches(quad)

    for quad, rgb, _ in visible_patches():

        def paint(px, py, q, rgb=rgb):
            i = py * w + px
            if q > depth[i]:
                depth[i] = q
                color[i] = rgb

        fill(to_screen(quad), w, h, paint)

    # See-through quads (quad, rgb, alpha) in front of the vehicle are blended over it, farthest first
    coats = {}
    for quad, rgb, alpha in see_through:

        def coat(px, py, q, rgb=rgb, alpha=alpha):
            i = py * w + px
            if q > depth[i]:
                coats.setdefault(i, []).append((q, rgb, alpha))

        fill(to_screen(quad), w, h, coat)

    # Average each SUPERSAMPLE x SUPERSAMPLE block with premultiplied alpha
    n = SUPERSAMPLE * SUPERSAMPLE
    planes = [[0.0] * (width * height) for _ in range(4)]
    body = [0.0] * (width * height)  # fraction of each output pixel the vehicle covers
    for oy in range(height):
        for ox in range(width):
            r = g = b = a = 0.0
            covered = 0
            for sy in range(oy * SUPERSAMPLE, (oy + 1) * SUPERSAMPLE):
                for sx in range(ox * SUPERSAMPLE, (ox + 1) * SUPERSAMPLE):
                    i = sy * w + sx
                    if i in coats:
                        cr, cg, cb, ca = (*color[i], 1.0) if color[i] is not None else (0.0, 0.0, 0.0, 0.0)
                        for _, rgb, alpha in sorted(coats[i], key=lambda c: c[0]):
                            cr, cg, cb = (rgb[c] * alpha + v * (1 - alpha) for c, v in enumerate((cr, cg, cb)))
                            ca = alpha + ca * (1 - alpha)
                        r, g, b, a = r + cr, g + cg, b + cb, a + ca
                        covered += color[i] is not None
                    elif color[i] is not None:
                        r, g, b, a = r + color[i][0], g + color[i][1], b + color[i][2], a + 1.0
                        covered += 1
                    elif ground[i] is not None:
                        gr, gg, gb, ga = ground[i]
                        k = min(1.0, ga) / ga
                        r, g, b, a = r + gr * k, g + gg * k, b + gb * k, a + ga * k
            o = oy * width + ox
            planes[0][o], planes[1][o], planes[2][o], planes[3][o] = r / n, g / n, b / n, a / n
            body[o] = covered / n

    for group, config in bloom.items():
        source = {}
        for quad, rgb, emissive in polygons:
            if emissive != group:
                continue

            def light(px, py, q, rgb=rgb, through=config["through_body"]):
                i = py * w + px
                if through or q >= depth[i]:
                    source[i] = rgb

            fill(to_screen(quad), w, h, light)
        if source:
            add_bloom(planes, body, source, config, width, height)

    out = bytearray(width * height * 4)
    for o in range(width * height):
        a = planes[3][o]
        if a > 0:
            out[o * 4 : o * 4 + 4] = bytes(
                (*(min(255, round(planes[c][o] / a)) for c in range(3)), min(255, round(255 * a)))
            )
    return out


def render(rp, icon_path=None):
    geo = json.loads((rp / GEOMETRY).read_text())["minecraft:geometry"][0]
    texture = read_png(rp / TEXTURE)
    lit_texture = read_png(rp / LIT_TEXTURE)
    animations = json.loads((rp / ANIMATIONS).read_text())
    folds = folded_wheels(animations)
    turns = submerged_parts(animations)

    scenes = {name: collect(geo, texture, folds, turns, pose, lit_texture) for name, pose in POSES.items()}
    ground_y = min(p[1] for quad, _, _ in scenes["suv-front-left.png"] for p in quad)
    layers = {name: ground_layers(scenes[name], pose, ground_y) for name, pose in POSES.items()}

    # One camera and one scale for every pose, so the vehicle has the same size in each picture
    camera = Camera([p for polygons in scenes.values() for quad, _, _ in polygons for p in quad])
    to_screen = fit(camera, [q for name in POSES for q, _, _ in scenes[name] + layers[name]])

    images = {
        name: RasterJob(name, scenes[name], layers[name], to_screen, WIDTH, HEIGHT, None, BLOOM, ())
        for name in POSES
    }
    images.update(render_boat(rp))
    images.update(render_camper(rp))
    images.update(render_bulldozer(rp))
    images.update(render_camping_gear(rp))
    icon = None
    if icon_path is not None:
        # Lamps lit without the dusk tint, so the body keeps its daylight colors
        pose = {**POSES["suv-flying.png"], "lamps": True, "brightness": 1.0}
        polygons = collect(geo, texture, folds, turns, pose, lit_texture)
        icon = render_icon(geo, polygons, camera, str(icon_path))
    return images, icon


def fit(camera, quads):
    """Return a to_screen function that centers the quads in the preview frame with MARGIN around them."""
    return fit_views([(camera, quads)])[0]


def fit_views(views):
    """Return one to_screen function per (camera, quads), each centering its quads in the frame, all
    with the largest scale that keeps every view inside MARGIN, so the vehicle has the same size in
    each."""
    w, h = WIDTH * SUPERSAMPLE, HEIGHT * SUPERSAMPLE
    bounds = []
    for camera, quads in views:
        projected = [camera.project(p) for quad in quads for p in quad]
        bounds.append((
            min(p[0] for p in projected), max(p[0] for p in projected),
            min(p[1] for p in projected), max(p[1] for p in projected),
        ))
    scale = min(
        min(w * (1 - 2 * MARGIN) / (sx_hi - sx_lo), h * (1 - 2 * MARGIN) / (sy_hi - sy_lo))
        for sx_lo, sx_hi, sy_lo, sy_hi in bounds
    )

    return [
        ScreenFit(camera, scale, w / 2 - scale * (sx_lo + sx_hi) / 2, h / 2 - scale * (sy_lo + sy_hi) / 2)
        for (camera, _), (sx_lo, sx_hi, sy_lo, sy_hi) in zip(views, bounds)
    ]


def render_boat(rp):
    geo = json.loads((rp / BOAT_GEOMETRY).read_text())["minecraft:geometry"][0]
    texture = read_png(rp / BOAT_TEXTURE)
    scenes = {name: collect_boat(geo, texture, pose) for name, pose in BOAT_POSES.items()}
    layers = {name: water_layers(scenes[name][0], pose) for name, pose in BOAT_POSES.items()}
    points = [p for polygons, _ in scenes.values() for quad, _, _ in polygons for p in quad]
    # Poses seen from the same direction share one frame, so the headlight beam keeps the hull
    # where it is in the picture without the lamps
    frames = {}
    for name, pose in BOAT_POSES.items():
        frames.setdefault((pose["view"], pose["screen_up"]), []).append(name)
    views = [
        (Camera(points, view, screen_up), [q for name in names for q, _, _ in scenes[name][0] + layers[name]])
        for (view, screen_up), names in frames.items()
    ]
    images = {}
    for names, to_screen in zip(frames.values(), fit_views(views)):
        for name in names:
            polygons, glass = scenes[name]
            images[name] = RasterJob(name, polygons, [], to_screen, WIDTH, HEIGHT, None, BLOOM, glass + layers[name])
    return {name: images[name] for name in BOAT_POSES}


def render_camper(rp):
    geo = json.loads((rp / CAMPER_GEOMETRY).read_text())["minecraft:geometry"][0]
    texture = read_png(rp / CAMPER_TEXTURE)
    # Camper previews use the ground pose, where the render controller hides hover glows.
    geo = {**geo, "bones": [b for b in geo["bones"] if not b["name"].startswith("glow_")]}
    # Other atlases intentionally use center sampling in their established previews.
    return render_poses(geo, texture, CAMPER_POSES, texture_mapping=True, cache_faces=True, defer_textures=True)


def bulldozer_bones(bones):
    return [b for b in bones if b["name"] not in BULLDOZER_HIDDEN]


def opaque_lenses(texture):
    # The plain entity material ignores alpha (ADR 0020).
    return [[(r, g, b, 255 if a == 0 else a) for r, g, b, a in row] for row in texture]


def render_bulldozer(rp):
    geo = json.loads((rp / BULLDOZER_GEOMETRY).read_text())["minecraft:geometry"][0]
    texture = read_png(rp / BULLDOZER_TEXTURE)
    return render_poses(
        {**geo, "bones": bulldozer_bones(geo["bones"])},
        opaque_lenses(texture),
        BULLDOZER_POSES,
    )


def render_poses(geo, texture, poses, lit=HEADLIGHTS_LIT, texture_mapping=False, *, cache_faces=False, defer_textures=False):
    face_cache = {} if cache_faces else None
    bounds = {name: [] for name in poses} if cache_faces else None
    scenes = {name: collect_boat(geo, texture, pose, lit, texture_mapping, face_cache=face_cache,
                                frame_quads=bounds[name] if bounds is not None else None,
                                defer_textures=defer_textures)
              for name, pose in poses.items()}
    frame_faces = bounds if bounds is not None else {name: [q for q, _, _ in scene[0]] for name, scene in scenes.items()}
    points = [p for quads in frame_faces.values() for quad in quads for p in quad]
    frames = {}
    for name, pose in poses.items():
        frames.setdefault((pose["view"], pose["screen_up"]), []).append(name)
    views = [
        (Camera(points, view, screen_up), [q for name in names for q in frame_faces[name]])
        for (view, screen_up), names in frames.items()
    ]
    images = {}
    for names, to_screen in zip(frames.values(), fit_views(views)):
        for name in names:
            polygons, glass = scenes[name]
            images[name] = RasterJob(name, polygons, [], to_screen, WIDTH, HEIGHT, None, BLOOM, glass)
    return {name: images[name] for name in poses}


def static_pose(geo, animation):
    """Apply constant rotations and zero-scale visual groups to the bind pose."""
    import copy
    posed = copy.deepcopy(geo)
    hidden = set()
    for bone in posed["bones"]:
        scale = animation.get("bones", {}).get(bone["name"], {}).get("scale", [1, 1, 1])
        if scale == [0, 0, 0]:
            hidden.add(bone["name"])
        elif scale != [1, 1, 1]:
            raise ValueError("Static previews support only unit or zero group scales")
    for _ in posed["bones"]:
        hidden.update(b["name"] for b in posed["bones"] if b.get("parent") in hidden)
    for bone in posed["bones"]:
        if bone["name"] in hidden:
            bone.pop("cubes", None)
        rotation = animation.get("bones", {}).get(bone["name"], {}).get("rotation", [0, 0, 0])
        bone["rotation"] = [a + b for a, b in zip(bone.get("rotation", [0, 0, 0]), rotation)]
    return posed


def open_lid(geo, degrees):
    import copy
    if not 0 <= degrees <= LID_OPEN:
        raise ValueError(f"--lid must be between 0 and {LID_OPEN} degrees")
    posed = copy.deepcopy(geo)
    lid = next((b for b in posed["bones"] if b["name"] == "lid"), None)
    if lid is None:
        raise ValueError("Lid pose requires a bone named 'lid'")
    rotation = list(lid.get("rotation", [0, 0, 0]))
    # The game's positive x rotation lowers the front (-z); opening must raise it.
    rotation[0] -= degrees
    lid["rotation"] = rotation
    return posed


def render_photo_view(rp, name, lid=None) -> RasterJob:
    view = PHOTO_VIEWS[name]
    piece = next((p for p in RESORT_GEAR if p["name"] == view["piece"]), None)
    if piece is None:
        raise ValueError(f"Piece '{view['piece']}' is missing from tools/resort_gear.json")
    geo = json.loads((rp / RESORT_GEOMETRY.format(piece["geometry"])).read_text())["minecraft:geometry"][0]
    if piece["name"] == "toilet":
        geo = static_pose(geo, json.loads((rp / "animations/yasu_ride/toilet.anim.json").read_text())["animations"]["animation.yasu_ride.toilet.rest"])
    degrees = view.get("lid") if lid is None else lid
    if degrees is not None:
        geo = open_lid(geo, degrees)
    textured = piece["textured"]
    polygons, glass = collect_boat(
        geo, read_png(rp / RESORT_TEXTURE.format(piece["geometry"])),
        {"lamps": False, "dusk": False, "outward_normals": textured,
         "merge_texels": piece["geometry"] in ("sofa_single", "sofa_double", "washstand")},
        texture_mapping=textured, cutout=piece["cutout"])
    camera = Camera.looking_at(view["position"], view["target"])
    return RasterJob(f"{name}.png", polygons, [], PhotoScreenFit.for_fov(camera, view["fov"]),
                     PHOTO_VIEW_SIZE, PHOTO_VIEW_SIZE, None, {}, glass)


def gear_tiled(geo, texture):
    """Detect tile UVs in texture texels, including mirrored faces."""
    desc = geo["description"]
    sx = len(texture[0]) / desc["texture_width"]
    sy = len(texture) / desc["texture_height"]
    for bone in geo["bones"]:
        for cube in bone.get("cubes", []):
            for face in cube["uv"].values():
                (u, v), (du, dv) = face["uv"], face["uv_size"]
                if (min(u, u + du) * sx < 0 or max(u, u + du) * sx > GEAR_SWATCH_AREA or
                        min(v, v + dv) * sy < 0 or max(v, v + dv) * sy > GEAR_SWATCH_AREA):
                    return True
    return False


def collect_gear(geo, texture, item):
    """Keep swatch previews unchanged while tiled gear follows its game material."""
    tiled = gear_tiled(geo, texture)
    pose = {"lamps": False, "dusk": False, "outward_normals": False, "merge_texels": tiled}
    return collect_boat(geo, texture, pose, texture_mapping=tiled,
                        cutout=tiled and not item["glass"])


def render_gear(geo_path, texture, size, name, animation=None, view=None, screen_up=None):
    """Draw one small model in a size-pixel square on transparency, seen like the vehicles."""
    geometries = json.loads(geo_path.read_text())["minecraft:geometry"]
    roof_tent = geo_path.name == "roof_tent.geo.json"
    geo = (next(g for g in geometries
                if g["description"]["identifier"] == "geometry.yasu_ride.roof_tent_suv")
           if roof_tent else geometries[0])
    if geo_path.name == "beach_chair.geo.json" and animation is None:
        animations = json.loads((geo_path.parents[3] / "animations/yasu_ride/beach_chair.anim.json").read_text())["animations"]
        animation = animations["animation.yasu_ride.beach_chair.chair"]
    if geo_path.name == "toilet.geo.json" and animation is None:
        animation = json.loads((geo_path.parents[3] / "animations/yasu_ride/toilet.anim.json").read_text())["animations"]["animation.yasu_ride.toilet.rest"]
    if animation is not None:
        geo = static_pose(geo, animation)
    item = next((item for item in json.loads(GEAR_SPEC.read_text())
                 if geo_path.name == f"{item['id']}.geo.json"), None)
    if item is not None:
        polygons, glass = collect_gear(geo, texture, item)
    else:
        textured = geo_path.name in TEXTURED_GEOMETRY_FILES
        polygons, glass = collect_boat(geo, texture, {"lamps": False, "dusk": False, "outward_normals": textured,
                                               "merge_texels": geo_path.name in ("sofa_single.geo.json", "sofa_double.geo.json", "washstand.geo.json")}, texture_mapping=textured,
                                       cutout=geo_path.name in CUTOUT_GEOMETRY_FILES)
    quads = [quad for quad, _, _ in polygons + glass]
    # Look from the ladder end so the SUV tent's vehicle-left ladder stays visible.
    view = view if view is not None else (ROOF_TENT_VIEW if roof_tent else VIEW_DIRECTION)
    camera = Camera([p for quad in quads for p in quad], view=view, screen_up=screen_up)
    return RasterJob(name, polygons, [], fit_square(camera, quads, size), size, size, None, {}, glass)


def small_models(rp):
    """(name, geometry path, texture) of the decor and outside camping gear."""
    texture = read_png(rp / GEAR_TEXTURE)
    models = [(item["id"], rp / GEAR_GEOMETRY.format(item["id"]), texture) for item in json.loads(GEAR_SPEC.read_text())]
    resort = [
        (piece["name"], rp / RESORT_GEOMETRY.format(piece["geometry"]), read_png(rp / RESORT_TEXTURE.format(piece["geometry"])))
        for piece in RESORT_GEAR
    ]
    return models + resort + [
        (NOGA_CHAIR_PREVIEW, rp / NOGA_CHAIR_GEOMETRY, read_png(rp / NOGA_CHAIR_TEXTURE)),
        (CHAIR_PREVIEW, rp / CHAIR_GEOMETRY, read_png(rp / CHAIR_TEXTURE)),
        (TENT_PREVIEW, rp / TENT_GEOMETRY, read_png(rp / TENT_TEXTURE)),
        (ROOF_TENT_PREVIEW, rp / ROOF_TENT_GEOMETRY, read_png(rp / ROOF_TENT_TEXTURE)),
        (TABLE_PREVIEW, rp / TABLE_GEOMETRY, read_png(rp / TABLE_TEXTURE)),
        (FIRE_PIT_PREVIEW, rp / FIRE_PIT_GEOMETRY, read_png(rp / FIRE_PIT_TEXTURE)),
        (DUTCH_OVEN_PREVIEW, rp / DUTCH_OVEN_GEOMETRY, read_png(rp / DUTCH_OVEN_TEXTURE)),
        # The lit flame (alpha 0) shows; the glass (alpha 96) stays see-through.
        (GAS_LANTERN_PREVIEW, rp / GAS_LANTERN_GEOMETRY, opaque_lenses(read_png(rp / GAS_LANTERN_TEXTURE))),
    ]


def render_camping_gear(rp):
    return {
        f"{GEAR_DIR}/{name}.png": render_gear(geo, texture, GEAR_SIZE, f"{GEAR_DIR}/{name}.png")
        for name, geo, texture in small_models(rp)
    }


def fit_square(camera, quads, size):
    """Return a to_screen function that centers the quads in a size-pixel square, their longer side
    spanning GEAR_FILL of it."""
    w = size * SUPERSAMPLE
    projected = [camera.project(p) for quad in quads for p in quad]
    xlo, xhi = min(p[0] for p in projected), max(p[0] for p in projected)
    ylo, yhi = min(p[1] for p in projected), max(p[1] for p in projected)
    scale = w * GEAR_FILL / max(xhi - xlo, yhi - ylo)
    off_x = w / 2 - scale * (xlo + xhi) / 2
    off_y = w / 2 - scale * (ylo + yhi) / 2

    return ScreenFit(camera, scale, off_x, off_y)


def image_size(name):
    return (GEAR_SIZE, GEAR_SIZE) if name.startswith(f"{GEAR_DIR}/") else (WIDTH, HEIGHT)


def render_icon(geo, polygons, camera, target_name):
    """Fit the vehicle to ICON_FILL of the width over the background and the wheel discs."""
    size = ICON_SIZE
    w = h = size * SUPERSAMPLE
    projected = [camera.project(p) for quad, _, _ in polygons for p in quad]
    xlo, xhi = min(p[0] for p in projected), max(p[0] for p in projected)
    ylo, yhi = min(p[1] for p in projected), max(p[1] for p in projected)
    scale = w * ICON_FILL / (xhi - xlo)
    off_x = w / 2 - scale * (xlo + xhi) / 2
    off_y = h / 2 - scale * (ylo + yhi) / 2

    to_screen = ScreenFit(camera, scale, off_x, off_y)

    half_band = h * ICON_BAND_HEIGHT / 2

    def in_band(x, y):
        # The band's center line runs from the lower-left corner to the middle of the right edge
        return abs((y + 0.5) - (h - (x + 0.5) * 0.5)) < half_band

    background = [
        (*(ICON_BAND_COLOR if in_band(x, y) else ICON_BACKGROUND), 1.0) for y in range(h) for x in range(w)
    ]
    bones = {bone["name"]: bone for bone in geo["bones"]}
    for name, bone in bones.items():
        if not name.startswith("glow_"):
            continue
        cube = bone["cubes"][0]
        origin, extent = cube["origin"], cube["size"]
        cx, cy, cz = -(origin[0] + extent[0] / 2), origin[1] + FLIGHT_LIFT, origin[2] + extent[2] / 2
        wheel = bones[name.replace("glow_", "wheel_")]
        # The tire is a ring of rotated cubes, so its radius is the farthest rotated corner from the hub
        hub = wheel["pivot"]
        wheel_radius = math.sqrt(max(
            (p[1] - hub[1]) ** 2 + (p[2] - hub[2]) ** 2
            for c in wheel["cubes"]
            for _, face in cube_faces(c)
            for p in face
        ))
        # A flat circle on screen rather than a disc lying under the wheel: seen from above, a
        # horizontal disc would hide behind the folded wheel and leave only a thin rim of glow.
        (sx, sy, inv_depth), = to_screen([(cx, cy, cz)])
        radius = wheel_radius * GLOW_DISC_REACH * scale * inv_depth
        x0, x1 = max(0, math.ceil(sx - radius - 0.5)), min(w, math.ceil(sx + radius - 0.5))
        y0, y1 = max(0, math.ceil(sy - radius - 0.5)), min(h, math.ceil(sy + radius - 0.5))
        for py in range(y0, y1):
            for px in range(x0, x1):
                dx, dy = px + 0.5 - sx, py + 0.5 - sy
                alpha = GLOW_DISC_ALPHA * max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy) / radius)
                if alpha:
                    i = py * w + px
                    background[i] = (*(background[i][c] * (1 - alpha) + GLOW_DISC_COLOR[c] * alpha for c in range(3)), 1.0)
    # Bloom would wash the lamp and disc halos over the orange band and blur the small icon.
    return RasterJob(target_name, polygons, [], to_screen, size, size, background, {}, ())


def raster_jobs(rp: Path, output_dir: Path, icon_packs: list[Path]) -> list[RasterJob]:
    """Every job named by its target path; the one pack icon job stands for all icon packs."""
    images, icon = render(rp, icon_packs[0] / "pack_icon.png" if icon_packs else None)
    jobs = [replace(job, name=str(output_dir / job.name)) for job in images.values()]
    if icon is not None:
        jobs.append(icon)
    for pack in icon_packs:
        if pack.name == GEAR_ICON_PACK:
            # Icons use the same scene as the preview; share its geometry instead
            # of expanding the furniture atlas into another set of polygons.
            for preview in images.values():
                if not preview.name.startswith(f"{GEAR_DIR}/"):
                    continue
                name = Path(preview.name).stem
                icon_name = ICON_NAMES.get(name, name)
                target = pack / GEAR_ICON_DIR / f"{icon_name}.png"
                jobs.append(replace(preview, name=str(target), width=GEAR_ICON_SIZE,
                                    height=GEAR_ICON_SIZE,
                                    to_screen=replace(preview.to_screen,
                                                      scale=preview.to_screen.scale * GEAR_ICON_SIZE / GEAR_SIZE,
                                                      off_x=preview.to_screen.off_x * GEAR_ICON_SIZE / GEAR_SIZE,
                                                      off_y=preview.to_screen.off_y * GEAR_ICON_SIZE / GEAR_SIZE)))
    return jobs


def rasterize_all(jobs: list[RasterJob], workers: int | None) -> list[bytearray]:
    if workers == 1:
        return [rasterize_job(j) for j in jobs]
    with multiprocessing.get_context("spawn").Pool(workers or os.cpu_count()) as pool:
        return pool.map(rasterize_job, jobs, chunksize=1)


def grayscale(rgba):
    gray_rgba = bytearray(rgba)
    for i in range(0, len(gray_rgba), 4):
        # Integer Rec. 601 luminance, so no float rounding can differ between platforms
        gray = (299 * gray_rgba[i] + 587 * gray_rgba[i + 1] + 114 * gray_rgba[i + 2] + 500) // 1000
        gray_rgba[i : i + 3] = bytes((gray, gray, gray))
    return gray_rgba


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("output_dir", type=Path, nargs="?")
    parser.add_argument("--gear", help="camping gear item id for named review views")
    parser.add_argument("--out", type=Path, help="output directory for a named photo view")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--icons", nargs="+", type=Path, default=[])
    parser.add_argument("--jobs", type=int, default=None, help="number of workers (default: CPU count)")
    parser.add_argument("--beach-chair-form", choices=("chair", "table"),
                        help="render only the Beach Chair in its shipped static pose")
    parser.add_argument("--view", nargs="+", default=None,
                        help="photo view name, or three camera direction numbers with --beach-chair-form")
    parser.add_argument("--lid", type=float, help=f"lid opening in degrees (0 to {LID_OPEN}), with a named view")
    args = parser.parse_args()
    if args.gear is not None:
        items = {item["id"]: item for item in json.loads(GEAR_SPEC.read_text())}
        if args.gear not in items:
            parser.error(f"Unknown gear '{args.gear}'; valid ids: {', '.join(items)}")
        if args.out is None or args.output_dir is not None:
            parser.error("--gear requires --out and no positional output_dir")
        if args.check or args.icons or args.beach_chair_form or args.lid is not None:
            parser.error("--gear cannot be combined with --check, --icons, --beach-chair-form, or --lid")
        views = args.view if args.view is not None else list(GEAR_VIEWS)
        for name in views:
            if name not in GEAR_VIEWS:
                parser.error(f"Unknown gear view '{name}'; valid names: {', '.join(GEAR_VIEWS)}")
        texture = read_png(args.resource_pack / GEAR_TEXTURE)
        for name in views:
            job = render_gear(args.resource_pack / GEAR_GEOMETRY.format(args.gear), texture,
                              GEAR_VIEW_SIZE, f"{args.gear}-{name}.png", view=GEAR_VIEWS[name],
                              screen_up=(0, 0, 1) if name == "top" else None)
            write_png(args.out / job.name, job.width, job.height, rasterize_job(job))
        return
    named_view, direction = None, None
    if args.view is not None:
        if len(args.view) == 1:
            named_view = args.view[0]
            if named_view not in PHOTO_VIEWS:
                parser.error(f"Unknown view '{named_view}'; valid names: {', '.join(PHOTO_VIEWS)}")
        elif len(args.view) == 3:
            if not args.beach_chair_form:
                parser.error("A three-number --view requires --beach-chair-form")
            try:
                direction = tuple(float(v) for v in args.view)
            except ValueError:
                parser.error("Beach Chair --view requires three numbers")
        else:
            parser.error("--view requires one photo view name or three Beach Chair direction numbers")
    if args.lid is not None:
        if not 0 <= args.lid <= LID_OPEN:
            parser.error(f"--lid must be between 0 and {LID_OPEN} degrees")
        if named_view is None:
            parser.error("--lid requires a named --view")
    if named_view is not None:
        if args.output_dir is not None or args.out is None:
            parser.error("A named --view requires --out and no positional output_dir")
        if args.check or args.beach_chair_form or args.icons:
            parser.error("A named --view cannot be combined with --check, --beach-chair-form, or --icons")
    elif args.output_dir is None or args.out is not None:
        parser.error("This mode requires positional output_dir and does not allow --out")
    # A mistyped pack dir would otherwise get a fresh pack_icon.png that no manifest uses
    for pack in args.icons:
        if not (pack / "manifest.json").is_file():
            parser.error(f"--icons {pack}: no manifest.json, so it is not a pack")
    # Renaming the test pack must not silently turn its icon into a color copy
    if args.icons and not any(pack.name == ICON_GRAYSCALE_PACK for pack in args.icons):
        parser.error(f"--icons must include {ICON_GRAYSCALE_PACK}, which gets the grayscale icon")
    pack_icon = str(args.icons[0] / "pack_icon.png") if args.icons else None
    targets = []
    if named_view is not None:
        try:
            job = render_photo_view(args.resource_pack, named_view, args.lid)
        except ValueError as e:
            parser.error(str(e))
        jobs = [replace(job, name=str(args.out / job.name))]
    elif args.beach_chair_form:
        animations = json.loads((args.resource_pack / "animations/yasu_ride/beach_chair.anim.json").read_text())["animations"]
        animation = animations[f"animation.yasu_ride.beach_chair.{args.beach_chair_form}"]
        name = str(args.output_dir / f"beach-chair-{args.beach_chair_form}.png")
        jobs = [render_gear(args.resource_pack / BEACH_CHAIR_GEOMETRY,
                            read_png(args.resource_pack / BEACH_CHAIR_TEXTURE), 800, name,
                            animation=animation, view=direction)]
    else:
        jobs = raster_jobs(args.resource_pack, args.output_dir, args.icons)
    for job, rgba in zip(jobs, rasterize_all(jobs, args.jobs)):
        if job.name == pack_icon:
            for pack in args.icons:
                pixels = grayscale(rgba) if pack.name == ICON_GRAYSCALE_PACK else rgba
                targets.append((pack / "pack_icon.png", ICON_SIZE, ICON_SIZE, pixels, True))
        else:
            targets.append((Path(job.name), job.width, job.height, rgba, False))
    stale = []
    for target, width, height, pixels, rgb in targets:
        if args.check:
            try:
                current = bytes(c for row in read_png(target) for px in row for c in px)
            except FileNotFoundError:
                stale.append(f"{target} (missing)")
                continue
            except (OSError, ValueError, struct.error, zlib.error) as e:
                stale.append(f"{target} ({e})")
                continue
            if current != bytes(pixels):
                stale.append(str(target))
        else:
            write_png(target, width, height, pixels, rgb=rgb)
            print(f"wrote {target}")
    if stale:
        sys.exit(f"{', '.join(stale)} out of date with the model. Run `pnpm model` and commit the result.")
    if args.check:
        print("previews and requested icons are up to date")


if __name__ == "__main__":
    main()
