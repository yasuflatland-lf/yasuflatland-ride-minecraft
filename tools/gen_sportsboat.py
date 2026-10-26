"""Generate the model, textures, and item icon for the Yasuflatland Ride sports boat (ADR 0051).

Ported from the spike's generator (docs/spike-sportsboat.md, appendix). Coordinates are in pixels
(16 px = 1 block), forward +z and right +x, and the model is rotated 180 degrees around the Y axis
just before writing, because in Bedrock the front of an entity is on the -z side of the model.
Bones: root / body / headlights / windshield / mirror (ADR 0009, 0159). No logo or model name.
Run: python3 -I tools/gen_sportsboat.py packs/yasu_ride_rp [--check]
--check writes nothing and exits 1 listing every stale output.
"""
import functools
import importlib.util
import json
import math
import struct
import sys
import zlib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

CHECK = "--check" in sys.argv[2:]
STALE = []


@functools.cache
def png_reader():
    """render_preview.py's decoder, so --check compares pixels however zlib packed the bytes."""
    spec = importlib.util.spec_from_file_location("render_preview", Path(__file__).with_name("render_preview.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.read_png


def emit(path, data, pixels=None):
    """Write `data` to `path`, or under --check record `path` as stale when it differs. JSON compares
    parsed, because `pnpm model` reformats it with Biome; a PNG compares `pixels`, its RGBA rows."""
    if not CHECK:
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, bytes):
            path.write_bytes(data)
        else:
            path.write_text(data)
        return
    try:
        if path.suffix == ".json":
            matches = json.loads(path.read_text()) == json.loads(data)
        else:
            matches = png_reader()(path) == pixels
    except (OSError, ValueError, struct.error, zlib.error):
        matches = False
    if not matches:
        STALE.append(str(path))


RP = Path(sys.argv[1])
MODELS = RP / "models/entity/yasu_ride"
ENTITY_TEXTURES = RP / "textures/entity/yasu_ride"
ITEM_TEXTURES = RP / "textures/items/yasu_ride"

# Color swatches. Each color fills a 4x4 cell, and each face's UV points at the cell's center 2x2
PALETTE = {
    "hull": (20, 20, 22),  # gloss black; the paint swaps this swatch
    "trim": (176, 178, 184),  # rub rail
    "strake": (46, 46, 50),
    "gloss": (14, 14, 16),  # dash, consoles, frames
    "frame": (26, 26, 28),
    "canvas": (38, 38, 40),
    "canvas_panel": (28, 28, 30),
    "seat": (176, 116, 70),  # tan leather
    "seat_dark": (58, 58, 62),  # charcoal bolsters
    "teak": (182, 128, 84),
    "seam": (40, 30, 24),
    "glass": (196, 220, 232),
    "screen": (36, 90, 170),
    "metal": (150, 150, 156),
    "light": (232, 232, 208),
    "platform": (150, 152, 152),  # gray mat on the swim platform
    "steel": (205, 208, 212),  # stainless ladder, hinges, and trim
    "jet": (104, 106, 112),  # gray jet nozzles, reverse buckets, and speaker grilles
    "ring": (40, 92, 220),  # blue LEDs on the wheel and speakers
    "stripe": (0x61, 0x61, 0x61),  # the line along each side below the gunwale
    "gunmetal": (74, 76, 82),  # matte speaker pods
    "chrome": (226, 228, 232),
    "button": (60, 60, 64),
    "mirror": (200, 214, 228),  # the rear-view mirror glass's thin edges (ADR 0159)
}
# The windshield renders with entity_alphablend, so its swatch is see-through
ALPHA = {"glass": 80}
NAMES = list(PALETTE)
EMISSIVE_LIT = 255
MER_LIT = (0, EMISSIVE_LIT, 255)
MER_OFF = (0, 0, 255)
# Dielectric clear coat: a near-black metal would reflect almost nothing (ADR 0163).
MER_HULL = (0, 0, 16)
HULL_SLOT = NAMES.index("hull")
LIT_SLOTS = tuple(NAMES.index(name) for name in ("light",))
# The mirror glass is metalness 255 and roughness 0 so Vibrant Visuals reflects the environment on it.
# No renderer can show the live scene behind the boat, so the face tile also bakes a sky-to-horizon
# gradient for clients without PBR (ADR 0159).
MER_MIRROR = (255, 0, 0)
MIRROR_SLOT = NAMES.index("mirror")
MIRROR_RIM = (54, 58, 64)
MIRROR_SKY = (150, 192, 232)
MIRROR_HORIZON = (236, 242, 246)
TEXTURE_WIDTH = 128
TEXTURE_HEIGHT = 32
assert len(NAMES) * 4 <= TEXTURE_WIDTH, "the palette no longer fits in the texture"

# Hull color of each paint, in variant order (ADR 0031). Variant 0, khaki on the SUV, is black here,
# so a new boat is black (ADR 0051). Khaki writes sportsboat.png; the others write sportsboat_<paint>.png.
# Each atlas <name>.png also gets <name>_mer.png and <name>.texture_set.json for the hull clear coat (ADR 0163).
HULL_PAINTS = {
    "khaki": (20, 20, 22),
    "green": (62, 96, 56),
    "red": (128, 22, 26),
    "white": (222, 222, 216),
    "light_gray": (156, 156, 152),
    "gray": (92, 94, 98),
    "black": (20, 20, 22),
    "orange": (190, 92, 28),
    "yellow": (214, 178, 44),
    "lime": (112, 160, 42),
    "cyan": (30, 118, 124),
    "light_blue": (92, 150, 204),
    "blue": (34, 70, 170),
    "purple": (94, 46, 128),
    "magenta": (160, 52, 140),
    "pink": (214, 132, 162),
}


def uv(color):
    i = NAMES.index(color)
    face = {"uv": [i * 4 + 1, 1], "uv_size": [2, 2]}
    return {k: dict(face) for k in ("north", "south", "east", "west", "up", "down")}


# A quilted tile below the swatch row: tan with a darker honeycomb stitch, as on the reference boat's
# cushions, stretched over a whole face.
QUILT_LINE = (128, 80, 44)
QUILT = [
    "........",
    ".LL..LL.",
    "L..LL..L",
    "........",
    "........",
    "L..LL..L",
    ".LL..LL.",
    "........",
]


def paint_quilt(pixels):
    (u, v), (w, h) = TILES["quilt"]["uv"], TILES["quilt"]["size"]
    for y in range(h):
        for x in range(w):
            pixels[v + y][u + x] = QUILT_LINE if QUILT[y][x] == "L" else PALETTE["seat"]


def paint_mirror(pixels):
    (u, v), (w, h) = TILES["mirror"]["uv"], TILES["mirror"]["size"]
    for y in range(v, v + h):
        for x in range(u, u + w):
            pixels[y][x] = mirror_tile(x, y)


# Dict insertion order is the painting order; allocations must be disjoint (ADR 0166).
TILES = {
    "quilt": {"uv": [0, 16], "size": [8, 8], "paint": paint_quilt},
    "mirror": {"uv": [16, 16], "size": [16, 8], "paint": paint_mirror},
}


def assert_tile_allocations():
    occupied = set()
    for name, tile in TILES.items():
        (u, v), (w, h) = tile["uv"], tile["size"]
        assert all(isinstance(n, int) for n in (u, v, w, h)), f"{name}: non-integer tile bounds"
        assert 0 <= u and 4 <= v and w > 0 and h > 0, f"{name}: invalid bounds or swatch overlap"
        assert u + w <= TEXTURE_WIDTH and v + h <= TEXTURE_HEIGHT, f"{name}: outside atlas"
        cells = {(x, y) for y in range(v, v + h) for x in range(u, u + w)}
        assert not occupied & cells, f"{name}: overlapping tiles"
        occupied.update(cells)


assert_tile_allocations()


def tile_faces(name):
    tile = TILES[name]
    return {"uv": list(tile["uv"]), "uv_size": list(tile["size"])}


def box(x0, y0, z0, x1, y1, z1, color, faces=None, tiles=None, **extra):
    """`faces` selects quilted faces; explicit `tiles` overrides them by registered tile name."""
    face_uv = uv(color)
    for face, name in {**dict.fromkeys(faces or (), "quilt"), **(tiles or {})}.items():
        face_uv[face] = tile_faces(name)
    return {"origin": [x0, y0, z0], "size": [x1 - x0, y1 - y0, z1 - z0], "uv": face_uv, **extra}


def pair(x0, y0, z0, x1, y1, z1, color, **extra):
    """A box on the right (+x) and its mirror through x = 0 on the left. A y or z turn mirrors to the
    opposite turn about the mirrored pivot; an x turn is unchanged by the mirror."""
    left = dict(extra)
    rx, ry, rz = extra.get("rotation", (0, 0, 0))
    if ry or rz:
        px, py, pz = extra["pivot"]
        left["pivot"] = [-px, py, pz]
        left["rotation"] = [rx, -ry, -rz]
    return [box(x0, y0, z0, x1, y1, z1, color, **extra), box(-x1, y0, z0, -x0, y1, z1, color, **left)]


@functools.cache
def cube_tilt():
    spec = importlib.util.spec_from_file_location("cube_tilt", Path(__file__).with_name("cube_tilt.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Assemblies that may carry a cube turned about two axes, and the helper that tilts a whole assembly
# (ADR 0166). Everything else keeps one rotation axis per cube (ADR 0009).
ONE_AXIS_EXCEPTION = cube_tilt().ONE_AXIS_EXCEPTION
tilt_assembly = cube_tilt().tilt_assembly


def disc(cx, cy, r, z0, z1, color):
    """A round section along z: a square and the same square turned 45 degrees."""
    return [box(cx - r, cy - r, z0, cx + r, cy + r, z1, color, pivot=[cx, cy, z0], rotation=[0, 0, rot])
            for rot in (0, 45)]


def lerp(table, z):
    if z <= table[0][0]:
        return table[0][1]
    for (z0, v0), (z1, v1) in zip(table, table[1:]):
        if z <= z1:
            return v0 + (v1 - v0) * (z - z0) / (z1 - z0)
    return table[-1][1]


# Profiles read off the side photo: 6 blocks long (z -48..48), keel at y 0. 900 photo pixels = 96 model pixels.
SHEER = [(-48, 9.5), (-44, 11.5), (-40, 13), (-32, 15.5), (-21, 16.8), (0, 17.4), (22, 17.6), (38, 17.8), (48, 18.4)]
KEEL = [(-48, 7), (-44.5, 2.5), (-39, 0), (-10, 0), (16, 0.7), (28, 2.6), (37, 5.9), (43, 10.1), (46.5, 14.4), (48, 17.4)]
BEAM = [(-48, 14.5), (-46.5, 16.3), (-44, 17), (8, 17), (20, 15.6), (30, 12.6), (38, 8.6), (44, 4.6), (47, 2), (48.5, 0.6)]
STRAKE = [(-48, 5), (0, 7.5), (40, 11.5)]
DECK = 9.0  # cockpit floor
DECK_BOW = 11.0  # the open bow's floor, a step up through the windshield's walk-through
COCKPIT = (-44.0, 14.0)  # open from the transom to the consoles
BOW = (18.0, 40.0)  # open bow seating; ahead of it, the anchor locker is decked over
BOW_FILLER = 26.0  # the filler cushions start here, ahead of the floor inside the walk-through
WALK_HALF = 3.5  # half the walk-through: the reference's 22 inches is 7 px at this scale
LOUNGE_BASE = DECK_BOW + 2.2  # top of the bow lounge's charcoal base
LOUNGE_CUSHION = DECK_BOW + 3.2  # top of its tan cushion
SLICE = 2.0

LOUNGE_DEPTH = 7.5  # how far the bow lounge reaches inboard from the hull's half-breadth

glass = []


# Hull profile: every hull caller reads the profiles through these, never through lerp() directly.
def sheer(z):
    return lerp(SHEER, z)


def keel(z):
    return lerp(KEEL, z)


def beam(z):
    return lerp(BEAM, z)


def strake_y(z):
    return lerp(STRAKE, z)


def pchip_slopes(points):
    """The tangents of a monotone cubic Hermite (PCHIP) through `points`: Fritsch-Butland's weighted
    harmonic mean inside, zero at a local extremum or a flat run, the end secants at both ends."""
    h = [b[0] - a[0] for a, b in zip(points, points[1:])]
    m = [(b[1] - a[1]) / (b[0] - a[0]) for a, b in zip(points, points[1:])]
    slopes = [m[0]]
    for k in range(1, len(points) - 1):
        if m[k - 1] * m[k] <= 0:
            slopes.append(0.0)
        else:
            w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
            slopes.append((w1 + w2) / (w1 / m[k - 1] + w2 / m[k]))
    return [*slopes, m[-1]]


BEAM_SLOPES = pchip_slopes(BEAM)


def beam_plan(z):
    """The hull's half-breadth on a smooth plan curve through every BEAM point, for the outer planking
    (ADR 0161). It strays at most 0.27 px from the polyline beam(), which the glass, mirror post, and
    tower keep using."""
    if z <= BEAM[0][0]:
        return BEAM[0][1]
    for ((z0, v0), (z1, v1)), d0, d1 in zip(zip(BEAM, BEAM[1:]), BEAM_SLOPES, BEAM_SLOPES[1:]):
        if z <= z1:
            h = z1 - z0
            t = (z - z0) / h
            return ((2 * t ** 3 - 3 * t ** 2 + 1) * v0 + (t ** 3 - 2 * t ** 2 + t) * h * d0
                    + (3 * t ** 2 - 2 * t ** 3) * v1 + (t ** 3 - t ** 2) * h * d1)
    return BEAM[-1][1]


def open_cockpit(zc):
    return COCKPIT[0] <= zc <= COCKPIT[1]


def open_bow(zc):
    return BOW[0] <= zc <= BOW[1]


def hull_top(zc, s):
    """Top of the solid hull: the floor where the cockpit or the bow is open, the sheer elsewhere."""
    return min(s, DECK) if open_cockpit(zc) else min(s, DECK_BOW) if open_bow(zc) else s


@dataclass(frozen=True)
class Inset:
    """A horizontal edge at `max(b * scale - px, floor) + step`, for the hull's half-breadth b.

    A negative `px` stands proud of the hull. `scale` gives the V bottom's fractions of the beam and,
    at 0, a fixed half-width of `-px`; `floor` keeps an edge from crossing the centreline.
    """

    px: float = 0.0
    scale: float = 1.0
    floor: float | None = None
    step: float = 0.0

    def x(self, b):
        x = b * self.scale - self.px
        if self.floor is not None:
            x = max(x, self.floor)
        return x + self.step


LOUNGE_EDGE = Inset(LOUNGE_DEPTH, floor=0.0)  # the lounge's inboard edge
PIPING_EDGE = Inset(LOUNGE_DEPTH, floor=0.0, step=0.6)  # where the cushion meets its piping
ACROSS = "across"  # an `inner` that makes the band one box across the centreline, `outer` wide each way


@dataclass(frozen=True)
class Band:
    """One hull row sliced outside the open bow and chained along its plan curve inside it.

    `name` labels the row in the table. `y0`, `y1`, and `when` take the slice centre zc, the sheer s,
    and the keel k there (the segment midpoint for chains). Bow-specific fields preserve
    the cockpit slices while declaring chain edges, clipping, and termination in the table.
    """

    name: str
    swatch: str
    outer: Inset
    inner: Inset | str
    y0: Callable[[float, float, float], float]
    y1: Callable[[float, float, float], float]
    when: Callable[[float, float, float], bool] = lambda zc, s, k: True
    bow_outer: Inset | None = None
    clip: Literal["none", "trim", "wall"] = "trim"
    bow_end: float = BOW[1]
    bow_end_breadth: float | None = None
    preserve_slices_through: float | None = None


# The V bottom's steps across the centreline: (height over the keel, fraction of the beam)
V_STEPS = [(0.0, 0.3), (1.5, 0.55), (3.0, 0.78), (4.5, 1.0)]


def in_bow(zc, s, k):
    return open_bow(zc)


def lounge_open(zc, s, k):
    return open_bow(zc) and LOUNGE_EDGE.x(beam(zc)) > 0


def filler_open(zc, s, k):
    return zc > BOW_FILLER and lounge_open(zc, s, k)


def vfrac(d):
    """The V bottom's fraction of the beam at `d` px over the keel, 1.0 from the chine up."""
    return lerp(V_STEPS, d)


def half_breadth(y, z):
    """The outer hull's half-breadth at height y, or 0 below the keel."""
    d = y - keel(z)
    return beam_plan(z) * vfrac(d) if d >= 0 else 0.0


# Outer planking (ADR 0161): long panels on waterline bands, each turned about y only to follow the
# plan curve between these stations. The left side mirrors the right through pair().
PLAN_STATIONS = [-48, -47, -46, -45, -44, 8, 12, 16, 18, 20, 23, 26, 29, 32, 34, 36, 38, 40, 42, 44, 45.5,
                 47, 48.5]
FLAT = (-44.0, 8.0)  # beam_plan is constant here, so the rails along the sheer tilt about x instead
BAND = 2.0  # BAND 1.5 needs 1263 cubes against 1202 here; neither meets the no-growth target (ADR 0161)
PLANK_DEPTH = 0.5
MERGE_TOLERANCE = 0.1  # how far a merged plank's chord may stray from the curve at any sample
STRAKE_HEIGHT = 2.0  # the sheer strake, at least BAND tall so it covers the planks' stepped tops
STRAKE_PROUD = 0.1
CAP_INSET = 1.6  # the gunwale cap reaches this far inboard of the half-breadth
DECK_STEP = 1.0  # a core under a deck narrows at most this much along its length
JOINT_PROJECTION = 0.03  # maximum outboard spur where square-ended panels turn inboard
RAIL_RISE = 0.4  # a level rail piece is split until its line rises at most this much within it


def joint_overlap(depth, turn):
    """The seam allowance closes the wedge between adjacent panels (ADR 0161)."""
    return max(0.25, depth * math.tan(abs(turn)) / 2 + 0.05)


def chain_overlaps(segments, depth):
    """(aft, fore) overlaps for each (z0, x0, z1, x1) of a run of segments, from the joint at each end."""
    ends = []
    for k, (z0, x0, z1, x1) in enumerate(segments):
        here = yaw(z0, x0, z1, x1)
        aft = segments[k - 1] if k and abs(segments[k - 1][2] - z0) < 1e-9 else None
        fore = segments[k + 1] if k + 1 < len(segments) and abs(segments[k + 1][0] - z1) < 1e-9 else None
        ends.append((joint_overlap(depth, here - yaw(*aft)) if aft else 0.25,
                     joint_overlap(depth, yaw(*fore) - here) if fore else 0.25))
    return ends


def joint_setback(overlap, turn):
    """At an inward bend the inner corners already meet. Set back the nominal end before adding
    the seam allowance, so its square outer corner cannot project beyond the next face (ADR 0161)."""
    return max(0.0, overlap - JOINT_PROJECTION / math.sin(-turn)) if turn < -1e-9 else 0.0


def plank(z0, x0, z1, x1, y0, y1, swatch, depth, overlap):
    """A flat panel on the right side whose outer face runs from (z0, x0) to (z1, x1) in plan, `depth`
    thick inboard and longer by `overlap` (aft, fore) past its ends, turned about y on (x0, y0, z0).
    A positive y turn carries +z toward +x in this frame, as rotate() in
    render_preview.py draws it; device confirmation is pending (ADR 0161)."""
    aft, fore = overlap if isinstance(overlap, tuple) else (overlap, overlap)
    length = math.hypot(z1 - z0, x1 - x0)
    extra = {} if x0 == x1 else {"pivot": [x0, y0, z0],
                                 "rotation": [0, math.degrees(math.atan2(x1 - x0, z1 - z0)), 0]}
    return box(x0 - depth, y0, z0 - aft, x0, y1, z0 + length + fore, swatch, **extra)


def paired_plank(*args, setbacks=(0.0, 0.0)):
    z0, x0, z1, x1, *rest = args
    length = math.hypot(z1 - z0, x1 - x0)
    uz, ux = (z1 - z0) / length, (x1 - x0) / length
    aft, fore = setbacks
    cube = plank(z0 + aft * uz, x0 + aft * ux, z1 - fore * uz, x1 - fore * ux, *rest)
    x, y, z = cube["origin"]
    sx, sy, sz = cube["size"]
    extra = {key: cube[key] for key in ("pivot", "rotation") if key in cube}
    return pair(x, y, z, x + sx, y + sy, z + sz, args[6], **extra)


def proud(z0, x0, z1, x1, out):
    """The segment (z0, x0)-(z1, x1) moved `out` px outboard, square to itself."""
    length = math.hypot(z1 - z0, x1 - x0)
    dx, dz = out * (z1 - z0) / length, -out * (x1 - x0) / length
    return z0 + dz, x0 + dx, z1 + dz, x1 + dx


def yaw(z0, x0, z1, x1):
    return math.atan2(x1 - x0, z1 - z0)


def crossing(f, lo, hi, rising):
    """The z in lo..hi where the monotone f crosses 0, rising or falling."""
    for _ in range(60):
        mid = (lo + hi) / 2
        if (f(mid) < 0) == rising:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


KEEL_LOW = (-39.0, -10.0)  # the keel's flat run at y 0


def band_extent(i):
    """The band's (z0, z1, closes_aft): where the keel is at or under its middle and the sheer at or over
    its top. closes_aft says the aft end is at the keel or the transom, not under the sheer."""
    y0 = BAND * i
    y_mid, y1 = y0 + BAND / 2, y0 + BAND
    if y1 > sheer(48) or y_mid < 0:
        return None
    za = -48.0 if keel(-48) <= y_mid else crossing(lambda z: keel(z) - y_mid, -48, KEEL_LOW[0], False)
    zs = -48.0 if sheer(-48) >= y1 else crossing(lambda z: sheer(z) - y1, -48, 48, True)
    zb = 48.0 if keel(48) <= y_mid else crossing(lambda z: keel(z) - y_mid, KEEL_LOW[1], 48, True)
    z0 = max(za, zs)
    return (z0, zb, za >= zs) if z0 < zb else None


def merged_segments(zs, xs):
    """Greedily join neighbouring segments while the joined chord stays within MERGE_TOLERANCE of every
    sample it spans. Returns index pairs into zs."""
    segments, i = [], 0
    while i < len(zs) - 1:
        j = i + 1
        while j + 1 < len(zs) and all(
                abs(xs[i] + (xs[j + 1] - xs[i]) * (zs[k] - zs[i]) / (zs[j + 1] - zs[i]) - xs[k]) <= MERGE_TOLERANCE
                for k in range(i + 1, j + 1)):
            j += 1
        segments.append((i, j))
        i = j
    return segments


def band_segments(i):
    """The band's plank segments on the right side as (z0, x0, z1, x1), aft to fore."""
    z0, z1, _ = BANDS[i]
    y_mid = BAND * i + BAND / 2
    knots = {*PLAN_STATIONS, *(z for z, _ in KEEL), z0, z1}
    zs = sorted(z for z in knots if z0 <= z <= z1)
    xs = [half_breadth(y_mid, z) for z in zs]
    return [(zs[a], xs[a], zs[b], xs[b]) for a, b in merged_segments(zs, xs)]


BANDS = {i: extent for i in range(int(sheer(48) // BAND) + 1) if (extent := band_extent(i))}


def regime_cuts(z0, z1):
    """z0..z1 cut where the hull top changes between the cockpit floor, the bow floor, and the sheer."""
    cuts = [z for z in (COCKPIT[0], COCKPIT[1], BOW[0], BOW[1]) if z0 < z < z1]
    edges = [z0, *cuts, z1]
    return list(zip(edges, edges[1:]))


def core_top(i, z0, z1, y1):
    """Top of band i's core over z0..z1: the band's top where the band above covers the whole run, else
    the hull top (the floor where the cockpit or the bow is open, the sheer elsewhere)."""
    top = hull_top((z0 + z1) / 2, sheer(z0))
    above = BANDS.get(i + 1)
    return min(top, y1) if above and above[0] <= z0 and z1 <= above[1] else top


def strake_inner(z0, z1):
    """How far out a box over z0..z1 may reach and stay inside the sheer strake's inner face."""
    x0, x1 = beam_plan(z0), beam_plan(z1)
    return min(x0, x1) + STRAKE_PROUD - PLANK_DEPTH * math.hypot(z1 - z0, x1 - x0) / (z1 - z0) - 0.05


def joined(cubes):
    """Join boxes stacked straight on top of one another into one taller box."""
    out = []
    for cube in cubes:
        last = out[-1] if out else None
        if (last and "rotation" not in cube and "rotation" not in last
                and last["origin"][0] == cube["origin"][0] and last["origin"][2] == cube["origin"][2]
                and last["size"][0] == cube["size"][0] and last["size"][2] == cube["size"][2]
                and abs(last["origin"][1] + last["size"][1] - cube["origin"][1]) < 1e-9):
            last["size"][1] += cube["size"][1]
        else:
            out.append(cube)
    return out


def hull_shell():
    """The outer planking: yawed planks per band segment, an axis-aligned core between them, and end
    caps where a band ends at the keel or the transom (ADR 0161)."""
    planks, latest, cores, caps = [], {}, [], []
    for i, (z0, z1, closes_aft) in BANDS.items():
        y0, y1 = BAND * i, BAND * (i + 1)
        segments = band_segments(i)
        for segment, overlap in zip(segments, chain_overlaps(segments, PLANK_DEPTH)):
            # A band whose segment matches the one under it, as everywhere above the chine, extends
            # that plank upward instead of adding its own
            key = tuple(round(v, 9) for v in segment)
            below = latest.get(key)
            if below and abs(below[1] - y0) < 1e-9:
                below[1], below[2] = y1, tuple(map(max, below[2], overlap))
            else:
                latest[key] = [y0, y1, overlap, segment]
                planks.append(latest[key])
            sz0, sx0, sz1, sx1 = segment
            sec = math.hypot(sz1 - sz0, sx1 - sx0) / (sz1 - sz0)

            def chord(z, sz0=sz0, sx0=sx0, sz1=sz1, sx1=sx1):
                return sx0 + (sx1 - sx0) * (z - sz0) / (sz1 - sz0)

            for a, b in regime_cuts(sz0, sz1):
                top = core_top(i, a, b, y1)
                # Under a deck the core must reach the gunwale cap's inner edge, so where the plan
                # narrows fast it is cut short enough that its narrow end still does
                n = max(1, math.ceil(abs(chord(b) - chord(a)) / DECK_STEP)) if top > y1 else 1
                for c, d in ((a + (b - a) * j / n, a + (b - a) * (j + 1) / n) for j in range(n)):
                    inner = min(chord(c), chord(d)) - PLANK_DEPTH * sec
                    if top > y0 and inner > 0:
                        cores.append(box(-inner, y0, c, inner, top, d, "hull"))
                    if top > y0 and (top < y1 and abs(chord(d) - chord(c)) > 0.5 or inner <= 0):
                        # A yawed inner shelf covers the slots left by a rectangular core at its
                        # narrow end, including the last bow core whose inner width crosses zero.
                        depth = PLANK_DEPTH + abs(chord(d) - chord(c)) / sec
                        caps += paired_plank(c, chord(c), d, chord(d), min(top, y1) - 0.2,
                                             min(top, y1), "hull", depth, 0.0)
                    if top > y1 and d < KEEL_LOW[0]:
                        # Continue the top band's face to the sheer instead of exposing an
                        # axis-aligned deck outside its inner face on the stern quarter.
                        caps += paired_plank(c, chord(c), d, chord(d), y1, top,
                                             "hull", PLANK_DEPTH, 0.0)
        for z, aft, hb in ((z1, False, half_breadth(BAND * i + BAND / 2, z1)),
                           (z0, True, half_breadth(BAND * i + BAND / 2, z0))):
            if aft and not closes_aft:
                continue
            top = min(y1, core_top(i, z - 0.5, z, y1) if not aft else core_top(i, z, z + 0.5, y1))
            half = hb - 0.25
            if half > 0 and top > y0:
                caps.append(box(-half, y0, z if aft else z - 0.5, half, top, z + 0.5 if aft else z, "hull"))
    cubes = []
    for y0, y1, overlap, segment in planks:
        z0, x0, z1, x1 = segment
        here = yaw(*segment)
        neighbours = [p[3] for p in planks if p[0] <= y0 < p[1]]
        aft = next((p for p in neighbours if abs(p[2] - z0) < 1e-9 and abs(p[3] - x0) < 1e-9), None)
        fore = next((p for p in neighbours if abs(p[0] - z1) < 1e-9 and abs(p[1] - x1) < 1e-9), None)
        setbacks = (joint_setback(overlap[0], here - yaw(*aft)) if aft else 0.0,
                    joint_setback(overlap[1], yaw(*fore) - here) if fore else 0.0)
        cubes += paired_plank(*segment, y0, y1, "hull", PLANK_DEPTH, overlap, setbacks=setbacks)
    cores.sort(key=lambda c: (c["origin"][2], c["size"][2], c["size"][0], c["origin"][1]))
    # Full-width deck cores are hidden above the lowest sheer-strake edge, including
    # its level-piece rise allowance; below that edge only yawed band faces may show.
    for a, b, _, _, tilted in RAIL_PIECES:
        if not tilted:
            deck = strake_inner(a, b)
            bottom = max(sheer(a), sheer(b)) - STRAKE_HEIGHT + RAIL_RISE
            if deck > 0 and hull_top((a + b) / 2, sheer(a)) > bottom:
                cores.append(box(-deck, bottom, a, deck, min(sheer(a), sheer(b)), b, "hull"))
    # The stem strakes turn past each other inboard, leaving a centreline slit at their tips; a thin
    # plate under the gunwale cap closes it from above and below.
    stem = sheer(PLAN_STATIONS[-1]) - 0.3
    caps.append(box(-0.45, stem, 48.0, 0.45, stem + 0.05, PLAN_STATIONS[-1], "hull"))
    return cubes + joined(cores) + caps


def rail_pieces():
    """The rails' run along the sheer as (z0, z1, station z0, station z1, tilted). Over FLAT a piece is
    one SHEER segment, tilted about x to follow it; elsewhere each plan segment is split until the sheer
    rises at most RAIL_RISE within a piece, which stays level."""
    flat = sorted({FLAT[0], FLAT[1], *(z for z, _ in SHEER if FLAT[0] < z < FLAT[1])})
    pieces = [(a, b, a, b, True) for a, b in zip(flat, flat[1:])]
    for a, b in zip(PLAN_STATIONS, PLAN_STATIONS[1:]):
        if FLAT[0] <= a and b <= FLAT[1]:
            continue
        n = max(1, math.ceil((sheer(b) - sheer(a)) / RAIL_RISE - 1e-9))
        pieces += [(a + (b - a) * j / n, a + (b - a) * (j + 1) / n, a, b, False) for j in range(n)]
    return sorted(pieces)


RAIL_PIECES = rail_pieces()


def rail(face_x, y_range, swatch, out, depth, when=lambda z0, z1: True):
    """One rail along the sheer, `out` px proud of the face face_x(z) and `depth` deep. y_range(z0, z1)
    gives a level piece's (y0, y1), and a tilted piece's at its aft end; a tilted piece's height is
    measured upright."""
    pieces = []
    for z0, z1, sa, sb, tilted in RAIL_PIECES:
        if when(z0, z1):
            xa, xb = face_x(sa), face_x(sb)
            # On the plan segment's chord, so the pieces of one segment line up
            pieces.append((z0, xa + (xb - xa) * (z0 - sa) / (sb - sa), z1, xa + (xb - xa) * (z1 - sa) / (sb - sa),
                           tilted))
    cubes = []
    for k, (z0, x0, z1, x1, tilted) in enumerate(pieces):
        piece_depth = depth(yaw(z0, x0, z1, x1)) if callable(depth) else depth
        if tilted:
            (ya0, ya1), (yb0, _) = y_range(z0, z0), y_range(z1, z1)
            slope = math.atan2(yb0 - ya0, z1 - z0)
            length = math.hypot(z1 - z0, yb0 - ya0)
            x = x0 + out
            cubes += pair(x - piece_depth, ya0, z0 - 0.25, x, ya0 + (ya1 - ya0) * math.cos(slope), z0 + length + 0.25,
                          swatch, pivot=[x, ya0, z0], rotation=[math.degrees(slope), 0, 0])
            continue
        neighbours = [p for p in pieces[max(k - 1, 0):k + 2]
                      if not p[4] and (abs(p[2] - z0) < 1e-9 or abs(p[0] - z1) < 1e-9)]
        turns = [abs(yaw(z0, x0, z1, x1) - yaw(*p[:4])) for p in neighbours]
        y0, y1 = y_range(z0, z1)
        overlap = max(joint_overlap(piece_depth, t) for t in [0.0, *turns])
        here = yaw(z0, x0, z1, x1)
        aft = next((p for p in neighbours if abs(p[2] - z0) < 1e-9), None)
        fore = next((p for p in neighbours if abs(p[0] - z1) < 1e-9), None)
        setbacks = (joint_setback(overlap, here - yaw(*aft[:4])) if aft else 0.0,
                    joint_setback(overlap, yaw(*fore[:4]) - here) if fore else 0.0)
        cubes += paired_plank(*proud(z0, x0, z1, x1, out), y0, y1, swatch, piece_depth,
                              overlap, setbacks=setbacks)
    return cubes


def strake_line_x(z):
    """The planks' face at the strake line's height: the band it falls in sets the V fraction."""
    y = strake_y(z)
    return half_breadth(BAND * (y // BAND) + BAND / 2, z)


def rails():
    """The sheer strake and gunwale cap (hull), the rub rail, and the strake line (ADR 0161)."""
    def under_sheer(z0, z1):
        s = sheer((z0 + z1) / 2)
        return s - STRAKE_HEIGHT, s

    def cap(z0, z1):
        s = sheer((z0 + z1) / 2)
        return s - 0.25, s + 0.05

    def rub(z0, z1):
        s = sheer((z0 + z1) / 2)
        return s - 1.1, s - 0.4

    def line(z0, z1):
        y = strake_y((z0 + z1) / 2)
        return y, y + 0.4

    def strake_window(z0, z1):
        zc = (z0 + z1) / 2
        return keel(zc) + 4.5 < strake_y(zc) < sheer(zc) - 2 and zc < 44

    shell = (rail(beam_plan, under_sheer, "hull", STRAKE_PROUD, PLANK_DEPTH)
             + rail(beam_plan, cap, "hull", STRAKE_PROUD,
                    lambda angle: CAP_INSET * math.cos(angle) + STRAKE_PROUD))
    rub_rail = rail(beam_plan, rub, "stripe", STRAKE_PROUD + 0.35, STRAKE_PROUD + 0.35)
    strake = rail(strake_line_x, line, "strake", 0.2, 0.45, strake_window)
    return shell, rub_rail, strake


def plank_inner(y, z):
    """How far out a cube at height y may reach at z and stay inside the planks' inner faces."""
    hb = half_breadth(y, z)
    i = y // BAND
    segments = band_segments(i) if i in BANDS else []
    faces = [x0 + (x1 - x0) * (z - z0) / (z1 - z0)
             - PLANK_DEPTH * math.hypot(z1 - z0, x1 - x0) / (z1 - z0)
             for z0, x0, z1, x1 in segments if z0 <= z <= z1]
    return min([hb - PLANK_DEPTH, *faces])


# Interior rows retain table order within each slice outside the open bow; the bow is one appended
# bow_interior() group of chains and across spans. Shell and rail regions each have one long-panel
# group, emitted by hull_body() at slice 0 (ADR 0161, 0162).
HULL_BANDS = {
    "hull_interior": [
        Band("gunwale_wall", "hull", Inset(0.0), Inset(1.6),
             lambda zc, s, k: DECK if open_cockpit(zc) else DECK_BOW, lambda zc, s, k: s,
             lambda zc, s, k: (open_cockpit(zc) and s > DECK) or open_bow(zc),
             bow_outer=Inset(PLANK_DEPTH), clip="wall"),
        Band("bow_floor", "teak", Inset(1.6), ACROSS,
             lambda zc, s, k: DECK_BOW, lambda zc, s, k: DECK_BOW + 0.3, in_bow,
             preserve_slices_through=22),
        # U-shaped bow lounge along the sides: charcoal base, tan cushion with charcoal piping on its
        # inboard edge, and a tan back capped in charcoal
        Band("lounge_base", "seat_dark", Inset(1.6), LOUNGE_EDGE,
             lambda zc, s, k: DECK_BOW, lambda zc, s, k: LOUNGE_BASE, in_bow,
             bow_end_breadth=LOUNGE_DEPTH),
        Band("lounge_cushion", "seat", Inset(1.6), PIPING_EDGE,
             lambda zc, s, k: LOUNGE_BASE, lambda zc, s, k: LOUNGE_CUSHION, in_bow,
             bow_end_breadth=LOUNGE_DEPTH),
        Band("lounge_piping", "seat_dark", PIPING_EDGE, LOUNGE_EDGE,
             lambda zc, s, k: LOUNGE_BASE, lambda zc, s, k: LOUNGE_CUSHION + 0.1, lounge_open,
             bow_end_breadth=LOUNGE_DEPTH),
        Band("lounge_back", "seat", Inset(1.6), Inset(2.8),
             lambda zc, s, k: LOUNGE_CUSHION, lambda zc, s, k: s - 0.9, in_bow),
        Band("lounge_back_cap", "seat_dark", Inset(1.6), Inset(3.0),
             lambda zc, s, k: s - 0.9, lambda zc, s, k: s - 0.3, in_bow),
        # Filler cushions close the aisle into one sun pad, leaving room to stand inside the
        # walk-through
        Band("filler_base", "seat_dark", LOUNGE_EDGE, ACROSS,
             lambda zc, s, k: DECK_BOW, lambda zc, s, k: LOUNGE_BASE,
             filler_open),
        Band("filler_cushion", "seat", LOUNGE_EDGE, ACROSS,
             lambda zc, s, k: LOUNGE_BASE, lambda zc, s, k: LOUNGE_CUSHION,
             filler_open),
        Band("filler_seam", "seam", Inset(-0.15, scale=0.0), ACROSS,
             lambda zc, s, k: LOUNGE_CUSHION, lambda zc, s, k: LOUNGE_CUSHION + 0.1,
             filler_open),
    ],
}


def slice_band(row, z0, z1):
    """The cubes `row` adds to the hull slice z0..z1, its outer edge kept inside the planks at both
    slice ends (ADR 0161)."""
    zc = z0 + (z1 - z0) / 2
    s, k, b = sheer(zc), keel(zc), beam(zc)
    if not row.when(zc, s, k):
        return []
    y0, y1 = row.y0(zc, s, k), row.y1(zc, s, k)
    limit = min(plank_inner(y0, z0), plank_inner(y0, z1))
    outer = min(row.outer.x(b), limit)
    if row.inner == ACROSS:
        return [box(-outer, y0, z0, outer, y1, z1, row.swatch)] if outer > 0 else []
    inner = row.inner.x(b)
    return pair(inner, y0, z0, outer, y1, z1, row.swatch) if outer > inner else []


INTERIOR_CLEARANCE = 0.002  # covers the geo.json's four-decimal coordinate and angle rounding
INTERIOR_STEP = 0.05  # conservative interval bounds, including every rotated footprint corner
WALL_MIN_DEPTH = 0.05  # a nondegenerate local thickness, 25 times the coordinate-rounding clearance


def interior_footprint(cube):
    """Right-side cube outline, including the square ends extended by the seam allowance."""
    x, _, z = cube["origin"]
    w, _, d = cube["size"]
    px, _, pz = cube.get("pivot", (0, 0, 0))
    angle = math.radians(cube.get("rotation", (0, 0, 0))[1])
    c, s = math.cos(angle), math.sin(angle)
    corners = [(pz - (a - px) * s + (b - pz) * c,
                px + (a - px) * c + (b - pz) * s)
               for a, b in ((x, z), (x + w, z), (x + w, z + d), (x, z + d))]
    zs = sorted({a for a, _ in corners})
    # plank_inner can change slope or jump at a band segment's end.
    zs = sorted({*zs, *(a for i in BANDS for segment in band_segments(i)
                       for a in (segment[0], segment[2]) if zs[0] < a < zs[-1])})
    samples = sorted({a + (b - a) * j / max(1, math.ceil((b - a) / INTERIOR_STEP))
                      for a, b in zip(zs, zs[1:])
                      for j in range(max(1, math.ceil((b - a) / INTERIOR_STEP)) + 1)})
    outline = []
    for at in samples:
        xs = []
        for (za, xa), (zb, xb) in zip(corners, corners[1:] + corners[:1]):
            if min(za, zb) - 1e-9 <= at <= max(za, zb) + 1e-9:
                xs.append(xa + (xb - xa) * (at - za) / (zb - za) if abs(zb - za) > 1e-9 else max(abs(xa), abs(xb)))
        outline.append((at, max(map(abs, xs))))
    return outline


def interior_fits(cube, y):
    outline = interior_footprint(cube)
    limits = [plank_inner(y, z) - INTERIOR_CLEARANCE for z, _ in outline]
    # In the bow, half_breadth and every plank chord decrease toward the stem. Between
    # footprint and plank corners their endpoint minima bound the whole interval.
    return all(max(a[1], b[1]) <= min(lo, hi)
               for a, b, lo, hi in zip(outline, outline[1:], limits, limits[1:]))


def widest_fit(cube, y):
    """Largest width, found by bisection, that keeps the cube's footprint inside the planks at height y."""
    probe = dict(cube, size=list(cube["size"]))
    lo, hi = 0.0, probe["size"][0]
    for _ in range(24):
        probe["size"][0] = (lo + hi) / 2
        if interior_fits(probe, y):
            lo = probe["size"][0]
        else:
            hi = probe["size"][0]
    return lo


def clip_interior(cube, wall=False):
    """Keep the inboard line fixed while removing the concealed outboard excess."""
    y0 = cube["origin"][1]
    y1 = y0 + cube["size"][1]
    if wall:
        # Plank chords can bind below the sheer even where the keel is well below the floor.
        # Trim at every band's lowest spanned height before sacrificing any wall height.
        # Only z 38..40 needs a raised bottom (y 12): band 5's inner chord binds below it,
        # even after trimming to WALL_MIN_DEPTH. All earlier bow walls reach DECK_BOW.
        def heights(bottom):
            return [bottom, *(i * BAND for i in BANDS if bottom < i * BAND < y1), y1]

        probe = dict(cube, size=[WALL_MIN_DEPTH, *cube["size"][1:]])
        if not all(interior_fits(probe, y) for y in heights(y0)):
            lo, hi = y0, y1
            for _ in range(24):
                mid = (lo + hi) / 2
                if all(interior_fits(probe, y) for y in heights(mid)):
                    hi = mid
                else:
                    lo = mid
            y0 = hi
            cube["origin"][1] = y0
            cube["size"][1] = y1 - y0
        cube["size"][0] = min(widest_fit(cube, y) for y in heights(y0))
    elif not interior_fits(cube, y0):
        cube["size"][0] = widest_fit(cube, y0)
    return cube


def plan_chain(row, start, end):
    """Return mirrored pairs of y-turned panels per active segment, clipped inside the planks when
    the row requests it. Cosine-scaled local depth preserves horizontal inset widths (ADR 0162)."""
    stations = [start, *(z for z in PLAN_STATIONS if start < z < end), end]
    outer = row.bow_outer or row.outer
    segments = [(a, outer.x(beam_plan(a)), b, outer.x(beam_plan(b)))
                for a, b in zip(stations, stations[1:])
                if row.when((a + b) / 2, sheer((a + b) / 2), keel((a + b) / 2))]
    depths = [(outer.x(beam_plan((a + b) / 2)) - row.inner.x(beam_plan((a + b) / 2)))
              * math.cos(yaw(a, x0, b, x1)) for a, x0, b, x1 in segments]
    cubes = []
    for i, (segment, depth) in enumerate(zip(segments, depths)):
        a, _, b, _ = segment
        zc = (a + b) / 2
        s, k = sheer(zc), keel(zc)
        angle = yaw(*segment)
        aft_turn = angle - yaw(*segments[i - 1]) if i else 0.0
        fore_turn = yaw(*segments[i + 1]) - angle if i + 1 < len(segments) else 0.0
        aft_depth = max(depth, depths[i - 1]) if i else depth
        fore_depth = max(depth, depths[i + 1]) if i + 1 < len(depths) else depth
        overlaps = (joint_overlap(aft_depth, aft_turn), joint_overlap(fore_depth, fore_turn))
        setbacks = (joint_setback(overlaps[0], aft_turn), joint_setback(overlaps[1], fore_turn))
        panels = paired_plank(*segment, row.y0(zc, s, k), row.y1(zc, s, k), row.swatch,
                              depth, overlaps, setbacks=setbacks)
        if row.clip != "none":
            right = clip_interior(panels[0], row.clip == "wall")
            x, y, z = right["origin"]
            w, h, d = right["size"]
            extra = {key: right[key] for key in ("pivot", "rotation") if key in right}
            panels = pair(x, y, z, x + w, y + h, z + d, row.swatch, **extra)
        cubes += panels
    return cubes


def bow_interior():
    cubes = []
    for row in HULL_BANDS["hull_interior"]:
        spans = []
        if row.inner != ACROSS:
            stop = (crossing(lambda z: beam_plan(z) - row.bow_end_breadth, BOW[0], row.bow_end, False)
                    if row.bow_end_breadth is not None else row.bow_end)
            cubes += plan_chain(row, BOW[0], stop)
            continue
        for a, b in hull_slices():
            if not BOW[0] <= a < b <= BOW[1]:
                continue
            zc = (a + b) / 2
            s, k = sheer(zc), keel(zc)
            if not row.when(zc, s, k):
                continue
            # The windshield's walk-through floor is a fixed part of its contract.
            if row.preserve_slices_through is not None and b <= row.preserve_slices_through:
                spans += slice_band(row, a, b)
                continue
            y0 = row.y0(zc, s, k)
            band = y0 // BAND
            samples = {a, b, *(z for segment in band_segments(band)
                               for z in (segment[0], segment[2]) if a < z < b)}
            half = min(max(row.outer.x(beam_plan(z)) for z in (a, b)),
                       *(plank_inner(y0, z) - INTERIOR_CLEARANCE for z in samples))
            if half > 0:
                span = box(-half, row.y0(zc, s, k), a, half, row.y1(zc, s, k), b, row.swatch)
                previous = spans[-1] if spans else None
                # Identical adjacent slices have no visible seam; merging saves six seam cubes.
                if (previous and previous["origin"][:2] == span["origin"][:2]
                        and previous["size"][:2] == span["size"][:2]
                        and abs(previous["origin"][2] + previous["size"][2] - a) < 1e-9):
                    previous["size"][2] += b - a
                else:
                    spans.append(span)
        cubes += spans
    return cubes


def hull_slices():
    z = -48.0
    while z < 48.0:
        yield z, z + SLICE
        z += SLICE


def build_hull():
    """Return {region name: [cube groups]}: interior slices in HULL_BANDS order outside the bow,
    followed by one bow_interior() group; the shell and each rail region have one group each."""
    shell, rub_rail, strake = rails()
    interior = [[cube for row in rows for cube in slice_band(row, z0, z1)] for z0, z1 in hull_slices()
                for rows in HULL_BANDS.values() if not BOW[0] <= z0 < z1 <= BOW[1]]
    interior.append(bow_interior())
    return {"hull_shell": [hull_shell() + shell], "hull_interior": interior, "rub_rail": [rub_rail],
            "strake": [strake]}


def hull_body(regions):
    groups = list(regions.values())
    return [cube for i in range(max(map(len, groups)))
            for region in groups if i < len(region) for cube in region[i]]


body = hull_body(build_hull())

# Swim platform: gray mat with seams, a stainless edge, a ladder down into the water on the right,
# and below it the drive and a black fin
body.append(box(-15.5, 5.6, -53, 15.5, 7.0, -47.5, "frame"))
body.append(box(-15, 7.0, -52.5, 15, 7.4, -47.5, "platform"))
for x in (-5.2, 4.9):
    body.append(box(x, 7.4, -52.5, x + 0.3, 7.5, -47.5, "seam"))
body.append(box(-15.7, 6.6, -53.4, 15.7, 7.2, -52.9, "trim"))
body += pair(15.5, 6.6, -53, 15.9, 7.2, -47.5, "trim")
for x in (7.5, 11.5):
    body.append(box(x, -6, -53.8, x + 0.5, 6.0, -53.3, "steel"))
for y in (-4.5, -1.5, 1.5, 4.5):
    body.append(box(7.5, y, -54.4, 12, y + 0.5, -53.3, "steel"))
# Jet drive under the platform: a black tunnel in the transom, a black housing between twin gray
# nozzles, each a round tube (a square and the same square turned 45 degrees) under a hooded
# reverse bucket. No propeller.
body.append(box(-9, 1.0, -48.5, 9, 5.6, -47.0, "gloss"))  # tunnel back
body.append(box(-2.2, 0.8, -51.5, 2.2, 5.6, -47.0, "gloss"))  # center housing
body.append(box(-2.4, 0.4, -52, 2.4, 1.2, -49, "gloss"))
for cx in (-5.0, 5.0):
    cy = 3.0
    for rot in (0, 45):
        body.append(box(cx - 1.3, cy - 1.3, -51.5, cx + 1.3, cy + 1.3, -48.5, "jet",
                        pivot=[cx, cy, -50], rotation=[0, 0, rot]))
    body.append(box(cx - 0.8, cy - 0.8, -51.7, cx + 0.8, cy + 0.8, -51.5, "gloss"))  # bore
    body.append(box(cx - 2.0, cy + 0.8, -50.5, cx + 2.0, 5.6, -47.5, "jet"))  # bucket hood
    # Aft lip of the hood, hinged at its top front edge. Its free aft edge (toward -z) droops toward
    # the water. In game a negative x rotation tips +y toward +z, so it also lifts -z; a positive
    # angle turns -z down, before the 180-degree turn (ADR 0051).
    body.append(box(cx - 1.6, cy + 0.2, -51.3, cx + 1.6, cy + 1.8, -50.5, "jet",
                    pivot=[cx, cy + 1.8, -50.5], rotation=[25, 0, 0]))
body.append(box(-0.3, -2.5, -49, 0.3, 1.0, -44, "gloss"))  # articulating keel
body.append(box(-14.4, 0.5, -51.5, -14.0, 5.6, -47, "frame"))
body.append(box(-14.0, 3.0, -50, -10, 3.6, -48.5, "frame"))

# Teak floor with dark inlay lines along the center aisle and across it
body.append(box(-15.4, DECK, -44, 15.4, DECK + 0.3, 14, "teak"))
for x in (-2.6, 2.3):
    body.append(box(x, DECK + 0.3, -44, x + 0.3, DECK + 0.4, 14, "seam"))
for zl in (-24, -7, 10):
    body.append(box(-15.4, DECK + 0.3, zl, 15.4, DECK + 0.4, zl + 0.3, "seam"))
F = DECK + 0.3  # top of the floor


def striped(x0, x1, y0, y1, z0, z1, quilt_face):
    """A seat panel split across its width like the photo: tan sides, charcoal stripes, quilted center."""
    w = x1 - x0
    edges = [x0, x0 + w * 0.26, x0 + w * 0.33, x0 + w * 0.67, x0 + w * 0.74, x1]
    colors = ["seat", "seat_dark", "seat", "seat_dark", "seat"]
    return [box(a, y0, z0, b, y1, z1, c, faces=[quilt_face] if i == 2 else None)
            for i, (a, b, c) in enumerate(zip(edges, edges[1:], colors))]


# Helm (right, the driver is seat 0) and passenger buckets on pedestals, wraparound like the reference:
# a charcoal shell, tall tan wings, a headrest, and a flip-up bolster at the front of the cushion
for sign in (1, -1):
    a, c = (2.5, 10) if sign > 0 else (-10, -2.5)
    body.append(box(a + 2.5, F, 3, c - 2.5, F + 0.5, 6, "metal"))  # pedestal
    body.append(box(a, F + 0.5, 0.5, c, F + 1.6, 8, "seat_dark"))  # base shell
    body += striped(a, c, F + 1.6, F + 2.8, 2, 5.6, "up")  # cushion
    body.append(box(a + 0.3, F + 1.6, 5.6, c - 0.3, F + 2.6, 5.9, "seat_dark"))  # bolster hinge
    body.append(box(a, F + 1.6, 5.9, c, F + 3.4, 8, "seat"))  # flip-up bolster, folded down
    body.append(box(a, F + 1.6, 0, c, F + 10, 1.6, "seat_dark"))  # back shell
    body += striped(a + 0.6, c - 0.6, F + 3, F + 9.6, 1.6, 2.0, "south")  # face toward the sitter
    body.append(box(a + 0.8, F + 10, 0.2, c - 0.8, F + 11, 1.8, "seat_dark"))  # headrest
    for x0, x1, shell0, shell1 in ((a - 0.6, a, a - 0.9, a), (c, c + 0.6, c, c + 0.6 + 0.3)):
        body.append(box(x0, F + 1.6, 0, x1, F + 9, 3.5, "seat"))  # tall wing
        body.append(box(x0, F + 1.6, 3.5, x1, F + 4.6, 8, "seat"))  # arm
        body.append(box(shell0, F + 0.5, 0, shell1, F + 1.6, 8, "seat_dark"))  # shell under the wing

# Aft U lounge, as on the reference: a bench across the transom, side benches along the hull facing
# inboard, and at their front ends forward-facing seats with flip-back backrests for seats 2 and 3.
# Seats 2 and 3 in sportsboat.se.json sit on these forward-facing seats (ADR 0058).
U_SIDE = 9.4  # inboard edge of each side bench


def side(sign, x0, x1):
    """The span x0..x1 on the right (sign 1), or its mirror on the left (sign -1)."""
    return (x0, x1) if sign > 0 else (-x1, -x0)


for sign in (1, -1):
    # Forward-facing seat (seat 2 or 3)
    x0, x1 = side(sign, 2.6, 15.4)
    body.append(box(x0, F, -17, x1, F + 2.6, -9, "seat_dark"))
    body += striped(x0, x1, F + 2.6, F + 3.6, -17, -9, "up")
    # Flip-back backrest: a charcoal frame round a tan face, on steel hinges at both ends
    body.append(box(x0, F + 2.6, -18.6, x1, F + 8.4, -17.6, "seat_dark"))
    body += striped(x0 + 0.4, x1 - 0.4, F + 4.0, F + 8.0, -17.6, -17.2, "south")
    for hx in (x0 - 0.1, x1 - 0.3):
        body.append(box(hx, F + 3.2, -18.4, hx + 0.4, F + 4.4, -17.4, "steel"))
    # Side bench, its base running under the backrest to meet the forward seat
    x0, x1 = side(sign, U_SIDE, 15.4)
    body.append(box(x0, F, -38, x1, F + 2.6, -17, "seat_dark"))
    cx0, cx1 = side(sign, U_SIDE + 0.6, 14.2)
    body.append(box(cx0, F + 2.6, -38, cx1, F + 3.6, -18.6, "seat", faces=["up"]))
    px0, px1 = side(sign, U_SIDE, U_SIDE + 0.6)
    body.append(box(px0, F + 2.6, -38, px1, F + 3.7, -18.6, "seat_dark"))  # piping
    bx0, bx1 = side(sign, 14.2, 15.4)
    body.append(box(bx0, F + 2.6, -42, bx1, F + 6.4, -18.6, "seat"))  # back against the hull
    tx0, tx1 = side(sign, 14.0, 15.4)
    body.append(box(tx0, F + 6.4, -42, tx1, F + 7.0, -18.6, "seat_dark"))
    # Round chrome speaker grille set into the side back, aft of the tower legs
    gx0, gx1 = side(sign, 13.9, 14.2)
    gx = (gx0 + gx1) / 2
    for rot in (0, 45):
        body.append(box(gx0, F + 3.9, -27.9, gx1, F + 5.7, -26.1, "chrome",
                        pivot=[gx, F + 4.8, -27], rotation=[rot, 0, 0]))
    hx0, hx1 = side(sign, 13.8, 13.9)
    body.append(box(hx0, F + 4.4, -27.4, hx1, F + 5.2, -26.6, "gloss"))  # cone

# Transom bench across the stern, under the side benches' back ends
body.append(box(-15.4, F, -44, 15.4, F + 2.6, -38, "seat_dark"))
body += striped(-14.2, 14.2, F + 2.6, F + 3.8, -42, -38, "up")
body += striped(-15.4, 15.4, F + 3.8, F + 6.8, -44, -42, "south")
body.append(box(-15.4, F + 6.8, -44, 15.4, F + 7.4, -42, "seat_dark"))  # charcoal cap
body.append(box(-15.4, F + 3.8, -44, 15.4, F + 4.4, -42.4, "seat_dark"))  # charcoal band

# Helm console with a glossy dash, a big display, a wheel, and the throttle; passenger console
body.append(box(WALK_HALF, F, 9, 15.4, F + 7, 16, "gloss"))
body.append(box(WALK_HALF, F + 7, 10, 15.4, F + 8, 15.5, "gloss"))
body.append(box(-15.4, F, 9, -WALK_HALF, F + 6.5, 16, "gloss"))
body.append(box(-15.4, F + 6.5, 10, -WALK_HALF, F + 7.3, 15.5, "gloss"))
# Tan leather panel on each side wall beside the front seats
body += pair(15.0, F + 3.5, -1.0, 15.4, sheer(2) - 1.2, 4.8, "seat")
body += pair(14.9, F + 3.0, -1.0, 15.4, F + 3.5, 4.8, "seat_dark")
# A large display inboard of the wheel, as on the reference helm, overhanging the console toward the
# aisle. It stands ahead of the driver (bow at +z), and its top leans away from the driver, toward +z.
# In game a negative x rotation tips +y toward +z before the 180-degree turn, so the angle is -20;
# render_preview.py draws it leaning the other way (ADR 0051).
SCREEN_PIVOT = [5.5, F + 8, 13.5]
body.append(box(2.0, F + 8, 13, 9.0, F + 12.4, 14, "gloss", pivot=SCREEN_PIVOT, rotation=[-20, 0, 0]))
body.append(box(2.4, F + 8.4, 12.8, 8.6, F + 12.0, 13.1, "screen", pivot=SCREEN_PIVOT, rotation=[-20, 0, 0]))
# Phone holder standing on the dash, and a switch panel outboard of it
body.append(box(11.0, F + 8, 12.4, 12.4, F + 10.6, 12.9, "gloss"))
body.append(box(11.2, F + 8.3, 12.3, 12.2, F + 10.4, 12.4, "screen"))
body.append(box(12.8, F + 8, 10.6, 15.0, F + 8.3, 13.4, "gloss"))
for bx in (13.1, 13.8, 14.5):
    for bz in (11.2, 12.4):
        body.append(box(bx, F + 8.3, bz, bx + 0.4, F + 8.45, bz + 0.4, "metal"))
# Two chrome-rimmed cupholders: on the dash between the display and the wheel, and on the ledge below
for x0, y0, z0, size in ((9.6, F + 8, 10.4, 1.3), (3.9, F + 7, 9.0, 1.0)):
    body.append(box(x0, y0, z0, x0 + size, y0 + 0.15, z0 + size, "chrome"))
    body.append(box(x0 + 0.25, y0 + 0.15, z0 + 0.25, x0 + size - 0.25, y0 + 0.17, z0 + size - 0.25, "gloss"))
# Steering wheel as on the reference: a thick black rim and a broad black three-spoke pad with
# chrome strips along the lower edges of the side spokes, small buttons, one blue
# LED, and a plain silver cap with no emblem (ADR 0009). The column sits under a thick glossy cowl.
WX, WY, WZ = 7.6, F + 7.5, 7.0  # wheel center; the driver faces its -z side
# The rim is 40 short segments, so its outline reads as a circle rather than a polygon. A full-depth
# core with thinner bands along its inner and outer edges rounds off the rim's cross-section.
RIM_SEGMENTS = 40
for r, half, z0, z1 in ((2.7, 0.3, WZ, WZ + 0.8), (2.325, 0.075, WZ + 0.15, WZ + 0.65),
                        (3.075, 0.075, WZ + 0.15, WZ + 0.65)):
    # Long enough to meet the next segment along the band's outer edge
    half_len = math.pi * (r + half) / RIM_SEGMENTS
    for i in range(RIM_SEGMENTS):
        ang = i * 360 / RIM_SEGMENTS
        cx = WX + r * math.cos(math.radians(ang))
        cy = WY + r * math.sin(math.radians(ang))
        body.append(box(cx - half_len, cy - half, z0, cx + half_len, cy + half, z1, "gloss",
                        pivot=[cx, cy, (z0 + z1) / 2], rotation=[0, 0, ang + 90]))
for ang in (20, 160, 270):
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    cx, cy = WX + 1.3 * ca, WY + 1.3 * sa
    body.append(box(cx - 1.2, cy - 0.75, WZ + 0.15, cx + 1.2, cy + 0.75, WZ + 0.6, "gloss",
                    pivot=[cx, cy, WZ + 0.4], rotation=[0, 0, ang]))
    if ang != 270:
        # Across the spoke, pointing down on either side
        dx, dy = (sa, -ca) if ca > 0 else (-sa, ca)
        lx, ly = cx + 0.7 * dx, cy + 0.7 * dy
        body.append(box(lx - 1.1, ly - 0.12, WZ + 0.05, lx + 1.1, ly + 0.12, WZ + 0.15, "chrome",
                        pivot=[lx, ly, WZ + 0.1], rotation=[0, 0, ang]))
        for r in (0.9, 1.6):
            bx, by = WX + r * ca - 0.15 * dx, WY + r * sa - 0.15 * dy
            body.append(box(bx - 0.2, by - 0.2, WZ + 0.05, bx + 0.2, by + 0.2, WZ + 0.15, "button",
                            pivot=[bx, by, WZ + 0.1], rotation=[0, 0, ang]))
body += disc(WX, WY, 1.3, WZ + 0.1, WZ + 0.7, "gloss")  # pad center
body += disc(WX, WY, 0.6, WZ - 0.05, WZ + 0.1, "steel")  # cap
lx, ly = WX + 0.45, WY - 1.9
body.append(box(lx - 0.15, ly - 0.15, WZ + 0.05, lx + 0.15, ly + 0.15, WZ + 0.15, "ring"))  # LED
body.append(box(WX - 1.0, WY - 1.6, WZ + 0.6, WX + 1.0, WY + 0.6, 9.0, "gloss"))  # cowl
body.append(box(WX - 1.05, WY - 1.65, WZ + 1.0, WX + 1.05, WY + 0.65, WZ + 1.2, "chrome"))
body.append(box(WX - 0.7, F + 4, 8.2, WX + 0.7, WY - 1.6, 9.0, "gloss"))  # column
# Throttle on the right side wall beside the driver: a glossy black housing with a chrome
# handle on a black lever arm, as in the photo
body.append(box(13.4, F + 4.5, 5.0, 15.4, F + 7.4, 9.0, "gloss"))
body.append(box(12.6, F + 7.0, 6.2, 14.2, F + 7.8, 8.6, "gloss"))  # lever arm
body.append(box(11.4, F + 7.4, 6.6, 12.8, F + 8.8, 8.4, "steel"))  # chrome handle
body.append(box(11.6, F + 8.8, 6.9, 12.6, F + 9.2, 8.1, "steel"))

# Wraparound windshield: the front leans back toward the cockpit about 55 degrees and the side panes
# follow the gunwale back to z -10. Every pane is one thin cube rotated to its slope (ADR 0158).
WS_HEIGHT = 4.5
FRONT_BASE, FRONT_TOP = 22.0, 15.5  # z of the front glass at the sheer and at its top edge
s0 = sheer(FRONT_BASE)
POST = WALK_HALF + 0.6  # outer face of each walk-through post
RAIL_Y = s0 + WS_HEIGHT  # bottom of the front glass's top rail
RAKE_LENGTH = math.hypot(FRONT_BASE - FRONT_TOP, WS_HEIGHT)
# Same convention as strut(): a negative x rotation leans toward +z, and this glass leans aft
RAKE_ROTATION = -math.degrees(math.atan2(FRONT_TOP - FRONT_BASE, WS_HEIGHT))
PANE = 0.5  # glass thickness
FRAME_PROUD = 0.3  # how far the posts stand out in front of the glass, to cover the pane edges
CORNER = (beam(FRONT_BASE) - 1.2, beam(FRONT_BASE))  # x of the corner posts


def raked(x0, x1, color, front=0.0, depth=PANE, length=RAKE_LENGTH):
    """A flat box lying on the front glass's slope, its front face `front` px ahead of the glass's."""
    return box(x0, s0, FRONT_BASE + front - depth, x1, s0 + length, FRONT_BASE + front, color,
               pivot=[(x0 + x1) / 2, s0, FRONT_BASE], rotation=[RAKE_ROTATION, 0, 0])


def raked_pair(x0, x1, color, **extra):
    return [raked(x0, x1, color, **extra), raked(-x1, -x0, color, **extra)]


# One flat pane per section, so the glass reads as a single slanted sheet rather than stepped rows.
# The center section is the walk-through to the bow; its door is closed, in line with the front panes.
glass += raked_pair(POST, CORNER[0], "glass")
glass.append(raked(-WALK_HALF, WALK_HALF, "glass"))
body += pair(POST - 0.2, RAIL_Y, FRONT_TOP - 1.0, beam(FRONT_TOP) - 1.0, RAIL_Y + 0.7, FRONT_TOP + 0.2, "frame")
# Walk-through posts, and corner posts where the front meets the sides; each front half is one
# undivided pane (ADR 0158). The hull flares from 14.0 to 15.1 px up the slope, which a flat pane
# cannot follow, so the corner post is wide enough to cover the side panes' cut edges.
POST_DEPTH = PANE + 2 * FRAME_PROUD
for x0, x1 in ((WALK_HALF, POST), CORNER):
    body += raked_pair(x0, x1, "frame", front=FRAME_PROUD, depth=POST_DEPTH)

# Each side pane is one flat sheet from z -10, 1.8 px over the sheer, up to the front glass's top
# corner, tilted so its top edge rises in a straight line under the side rail. Its lower part is
# buried in the gunwale, whose wall spans x b - 1.6 to b.
SIDE_REAR = -10.0
SIDE_REAR_TOP = sheer(SIDE_REAR) + 1.8
SIDE_LENGTH = math.hypot(FRONT_TOP - SIDE_REAR, RAIL_Y - SIDE_REAR_TOP)
SIDE_SLOPE = math.atan2(RAIL_Y - SIDE_REAR_TOP, FRONT_TOP - SIDE_REAR)
SIDE_X = (beam(0) - 1.5, beam(0) - 1.0)  # straight, inside the wall where the hull narrows toward z 16
SIDE_DROP = WS_HEIGHT + 0.5


def side_top(z):
    return SIDE_REAR_TOP + (z - SIDE_REAR) * math.tan(SIDE_SLOPE)


def sided(x0, x1, y0, y1, z0, z1, color):
    """A box in the side pane's frame (y measured from its top edge at z -10), tilted with it."""
    return pair(x0, SIDE_REAR_TOP + y0, SIDE_REAR + z0, x1, SIDE_REAR_TOP + y1, SIDE_REAR + z1, color,
                pivot=[(x0 + x1) / 2, SIDE_REAR_TOP, SIDE_REAR], rotation=[math.degrees(SIDE_SLOPE), 0, 0])


glass += sided(*SIDE_X, -SIDE_DROP, 0.0, 0.0, SIDE_LENGTH, "glass")
body += sided(SIDE_X[0] - 0.5, SIDE_X[1] + 0.2, 0.0, 0.7, 0.0, SIDE_LENGTH, "frame")  # side rail
# Under the front glass's slope a flat corner pane fills the triangle down to the sheer: its front
# edge lies on the slope, under the corner post, and it runs aft square to the slope far enough to
# reach the side pane's front edge at the sheer. A square-cut pane cannot meet that 48-degree corner
# edge to edge, so its top end stops short of the corner: its aft edge then meets the side pane's
# front edge just behind the corner post, which hides the sliver left uncovered above, and the
# doubled glass below is smaller than when the pane reaches the corner (ADR 0158).
CORNER_PANE_X = (CORNER[1] - PANE, CORNER[1])
SIDE_FRONT_AT_SHEER = FRONT_TOP + (RAIL_Y - sheer(FRONT_TOP)) * math.tan(SIDE_SLOPE)
CORNER_PANE_DEPTH = (FRONT_BASE - SIDE_FRONT_AT_SHEER) * WS_HEIGHT / RAKE_LENGTH + 0.1
CORNER_ANGLE = math.pi / 2 - SIDE_SLOPE - math.atan2(WS_HEIGHT, FRONT_BASE - FRONT_TOP)
CORNER_PANE_TRIM = (POST_DEPTH - FRAME_PROUD) / math.tan(CORNER_ANGLE)
glass += raked_pair(*CORNER_PANE_X, "glass", depth=CORNER_PANE_DEPTH, length=RAKE_LENGTH - CORNER_PANE_TRIM)
body.append(box(-WALK_HALF, RAIL_Y, FRONT_TOP - 1.0, WALK_HALF, RAIL_Y + 0.7, FRONT_TOP + 0.2, "frame"))
# Rear-view mirror on a stalk over the helm half of the windshield's top rail, its glass facing aft
MX, MY, MZ = 8.5, RAIL_Y + 0.7, FRONT_TOP - 0.4
body.append(box(MX - 0.3, MY, MZ - 0.3, MX + 0.3, MY + 1.0, MZ + 0.3, "frame"))
body.append(box(MX - 3.4, MY + 0.8, MZ - 0.9, MX + 3.4, MY + 2.2, MZ - 0.3, "gloss"))
# The glass gets its own bone so a separate pass can draw it with the PBR mirror texture set (ADR 0159).
# Its aft face is "north" here; turn_around makes it the in-game south face.
mirror = [box(MX - 3.1, MY + 1.0, MZ - 1.0, MX + 3.1, MY + 2.0, MZ - 0.9, "mirror",
              tiles={"north": "mirror"})]
body += pair(beam(6) - 1.6, sheer(6), 5.6, beam(6) - 1.0, side_top(6) + 0.2, 6.4, "frame")

# Wake tower: on each gunwale a raked rear and front strut with rungs and an X brace, then the top beam.
TX = 15.6  # inner face of the legs
TOWER_TOP = 32.5  # the bimini top then sits 1.97 blocks over the waterline: 8 ft 1 in at this scale


def strut(z0, y0, z1, y1, t=1.6):
    dz, dy = z1 - z0, y1 - y0
    length = math.hypot(dz, dy)
    # Lean the box from vertical toward +z. In game a negative x rotation does this, before the
    # 180-degree turn; render_preview.py draws cube x rotations the other way round (ADR 0051).
    ang = math.degrees(math.atan2(dz, dy))
    return pair(TX, y0, z0 - t / 2, TX + 1.6, y0 + length, z0 + t / 2, "frame",
                pivot=[TX + 0.8, y0, z0], rotation=[-ang, 0, 0])


# Raked about 50 degrees and roughly parallel; they end 3 px either side of the middle of the short
# top over the helm.
REAR = ((-23.0, sheer(-23)), (-3.0, TOWER_TOP))
FRONT = ((-14.0, sheer(-14)), (3.0, TOWER_TOP))


def on(line, y):
    (z0, y0), (z1, y1) = line
    return z0 + (z1 - z0) * (y - y0) / (y1 - y0)


body += strut(*REAR[0], *REAR[1])
body += strut(*FRONT[0], *FRONT[1])
for y in (21.5, 26.0):
    body += strut(on(REAR, y), y, on(FRONT, y), y + 0.01, t=1.0)
body += strut(on(REAR, 22.5), 22.5, on(FRONT, 30.0), 30.0, t=0.8)
body += strut(on(REAR, 30.0), 30.0, on(FRONT, 22.5), 22.5, t=0.8)
body.append(box(-TX - 1.6, TOWER_TOP, -4.5, TX + 1.6, TOWER_TOP + 1.5, 4.0, "frame"))
# Board racks on the outside of the rear struts
RACK_Z = on(REAR, 25.0)
for y in (23.5, 28.0):
    body += pair(TX + 1.6, y, RACK_Z - 0.3, TX + 4.2, y + 0.6, RACK_Z + 0.3, "frame")
body += pair(TX + 3.6, 22.5, RACK_Z - 0.5, TX + 4.2, 29.0, RACK_Z + 4.5, "frame")

# Bimini: a thick soft top that dips toward the bow and crowns slightly; only the front edge rolls
# down, the rear edge stays straight. A darker panel sits on top, and the side edges roll down too.
B_FRONT, B_REAR = 9.0, -10.0  # over the helm only
B_HALF = 19.0
B_TOP = TOWER_TOP + 3.5
B_THICK = 2.0


def dome(z):
    t = (z - B_REAR) / (B_FRONT - B_REAR)
    return B_TOP - 1.5 * t + 0.6 * (1 - (2 * t - 1) ** 2)


ROOF_REAR = ("rear", B_REAR, -3.0, dome(B_REAR), dome(-3.0))
ROOF_MAIN = ("main", -3.0, 6.0, dome(-3.0), dome(6.0))
ROOF_LIP = ("lip", 6.0, B_FRONT, dome(6.0), dome(B_FRONT) - 2.4)
ROOF_PANELS = [ROOF_REAR, ROOF_MAIN, ROOF_LIP]


def roof_top(z):
    z = max(B_REAR, min(B_FRONT, z))
    for _, z0, z1, y0, y1 in ROOF_PANELS:
        if z <= z1:
            return y0 + (y1 - y0) * (z - z0) / (z1 - z0)


# In-game x turns have the opposite sign to the preview's (0051): a falling +z surface needs
# a negative turn, correcting #647's atan2(y0 - y1, dz) sign (0164).
ROOF_ANGLES = [math.atan2(y1 - y0, z1 - z0) for _, z0, z1, y0, y1 in ROOF_PANELS]
ROOF_OVERLAPS = [max(0.25, B_THICK * math.tan(abs(b - a)) / 2 + 0.05)
                 for a, b in zip(ROOF_ANGLES, ROOF_ANGLES[1:])]
for i, (_, z0, z1, y0, y1) in enumerate(ROOF_PANELS):
    rear_overlap = ROOF_OVERLAPS[i - 1] if i else 0.0
    front_overlap = ROOF_OVERLAPS[i] if i < len(ROOF_OVERLAPS) else 0.0
    length = math.hypot(z1 - z0, y1 - y0)
    body.append(box(-16.0, y0 - B_THICK, z0 - rear_overlap,
                    16.0, y0, z0 + length + front_overlap, "canvas",
                    pivot=[0, y0, z0], rotation=[math.degrees(ROOF_ANGLES[i]), 0, 0]))

_, z0, _, y0, _ = ROOF_MAIN
# Local distances along the main panel project onto the hatch's nominal z -2..5 footprint.
main_cos = math.cos(ROOF_ANGLES[1])
body.append(box(-9.0, y0, z0 + (-2.0 - z0) / main_cos,
                9.0, y0 + 0.25, z0 + (5.0 - z0) / main_cos, "canvas_panel",
                pivot=[0, y0, z0], rotation=[math.degrees(ROOF_ANGLES[1]), 0, 0]))

# Three chords soften the side fold while retaining the original reach and drop (ADR 0164).
SKIRT_SPAN = (B_REAR, B_FRONT)
SKIRT_DROP = 2.6
SKIRT_THICK = 0.8
SKIRT_INNER = 16.0
SKIRT_RUN = B_HALF - SKIRT_INNER
SKIRT_ANGLES = [math.radians(a) for a in (15, 30, 45)]
SHOULDER_RUN = 0.3
MIDDLE_RUN = (SKIRT_RUN - SKIRT_DROP - SHOULDER_RUN * (1 - math.tan(SKIRT_ANGLES[0]))) / (1 - math.tan(SKIRT_ANGLES[1]))
SKIRT_RUNS = [SHOULDER_RUN, MIDDLE_RUN, SKIRT_RUN - SHOULDER_RUN - MIDDLE_RUN]
SKIRT_OVERLAPS = [max(0.25, SKIRT_THICK * math.tan(b - a) / 2 + 0.05)
                  for a, b in zip(SKIRT_ANGLES, SKIRT_ANGLES[1:])]
skirt_top = roof_top(B_FRONT)
x, y = SKIRT_INNER, skirt_top
for i, (run, angle) in enumerate(zip(SKIRT_RUNS, SKIRT_ANGLES)):
    inner_overlap = SKIRT_OVERLAPS[i - 1] if i else 0.0
    outer_overlap = SKIRT_OVERLAPS[i] if i < len(SKIRT_OVERLAPS) else 0.0
    # A negative build-frame z turn lowers +x; pair() mirrors the left turn.
    body += pair(x - inner_overlap, y - SKIRT_THICK, SKIRT_SPAN[0],
                 x + run / math.cos(angle) + outer_overlap, y, SKIRT_SPAN[1], "canvas",
                 pivot=[x, y, sum(SKIRT_SPAN) / 2], rotation=[0, 0, -math.degrees(angle)])
    x += run
    y -= run * math.tan(angle)

# One level bridge covers rear and main: y 34.1 lies inside both top panels, while its
# bottom buries in the roll. Only the drooping lip needs a separate x-turned bridge.
body += pair(15.8, skirt_top - 0.4, B_REAR, 16.1, 34.1, 6.25, "canvas")
_, z0, z1, y0, y1 = ROOF_LIP
angle = ROOF_ANGLES[2]
# The lower plane meets y skirt_top - 0.03 at z 6, and stays above the outer hem at z 9.
bridge_thick = (y0 - skirt_top + 0.03) * math.cos(angle)
body += pair(15.8, y0 - bridge_thick, z0 - 0.25,
             16.1, y0, z0 + math.hypot(z1 - z0, y1 - y0), "canvas",
             pivot=[0, y0, z0], rotation=[math.degrees(angle), 0, 0])

# Two continuous backing plates per side close both end triangles at once. Their upper
# outer corners bury in the roll skins; the flat bottom stays above the physical outer hem.
for x0, x1, top in [(15.8, 16.95, skirt_top - 0.65),
                    (16.7, 17.9, skirt_top - 1.6)]:
    body += pair(x0, skirt_top - SKIRT_DROP - 0.1, B_REAR,
                 x1, top, B_FRONT, "canvas")

# Tower speakers set into the underside of the top near its rear edge, a quarter of the way in from
# each side, facing aft as on the reference. Each is a bullet-shaped matte pod that narrows toward
# the bow, with a blue LED ring behind the bezel and a grille of split spokes round a hub.
G = B_REAR + 1.4  # z of the grille face
under = roof_top(G + 3) - B_THICK
cy = under - 1.6
# Round sections of one speaker, back to front: (name, radius, z0, z1, swatch), z relative to G.
SPEAKER_SECTIONS = (
    ("back", 1.6, -0.05, 0.0, "gloss"),  # behind the grille
    ("hub", 0.45, -0.25, -0.05, "jet"),
    ("bezel", 1.9, 0.0, 0.5, "gunmetal"),
    ("ring", 1.95, 0.5, 0.7, "ring"),  # blue LEDs
    ("pod_0", 1.9, 0.7, 2.4, "gunmetal"),
    ("pod_1", 1.6, 2.4, 3.6, "gunmetal"),
    ("pod_2", 1.15, 3.6, 4.5, "gunmetal"),
    ("pod_3", 0.6, 4.5, 5.0, "gunmetal"),
)
SPEAKER_SPOKES = {"angles": range(0, 360, 60), "offsets": (-0.2, 0.2), "radius": 1.05}
# Mount box: x half-width, y from cy + 1.4 up to under, z from G + 1.5 to G + 3.0.
SPEAKER_MOUNT = {"half_x": 0.5, "dy": 1.4, "z0": 1.5, "z1": 3.0, "swatch": "gloss"}


def speaker(sx):
    """Cubes of one speaker centred on x = sx. The spokes sit between the back disc and the hub."""
    cubes = []
    for k, (_, r, z0, z1, swatch) in enumerate(SPEAKER_SECTIONS):
        cubes += disc(sx, cy, r, G + z0, G + z1, swatch)
        if k == 0:
            for ang in SPEAKER_SPOKES["angles"]:
                ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
                for off in SPEAKER_SPOKES["offsets"]:
                    px = sx + SPEAKER_SPOKES["radius"] * ca - off * sa
                    py = cy + SPEAKER_SPOKES["radius"] * sa + off * ca
                    cubes.append(box(px - 0.55, py - 0.08, G - 0.15, px + 0.55, py + 0.08, G - 0.05,
                                     "jet", pivot=[px, py, G - 0.1], rotation=[0, 0, ang]))
    m = SPEAKER_MOUNT
    cubes.append(box(sx - m["half_x"], cy + m["dy"], G + m["z0"], sx + m["half_x"], under,
                     G + m["z1"], m["swatch"]))
    return cubes


for sx in (-B_HALF / 2, B_HALF / 2):
    body += speaker(sx)
# Stainless bow rails on the foredeck
for z0 in (34.0, 38.0, 42.0):
    body += pair(beam_plan(z0 + 0.4) - 1.6, sheer(z0), z0,
                 beam_plan(z0 + 0.4) - 1.1, sheer(z0) + 1.8, z0 + 0.5, "steel")
body += plan_chain(Band("bow_rail", "steel", Inset(1.1), Inset(1.6),
                        lambda zc, s, k: s + 1.6, lambda zc, s, k: s + 2.1, clip="none"), 34.0, 43.0)

def hull_face(y, z):
    """Rightmost hull face met by a horizontal ray in the build frame."""
    outer = 0.0
    for cube in body:
        if cube["uv"]["up"] != uv("hull")["up"]:
            continue
        px, py, pz = cube.get("pivot", (0, 0, 0))
        rx, ry, _ = cube.get("rotation", (0, 0, 0))
        ax, ay = math.radians(rx), math.radians(ry)
        p = [-px, y - py, z - pz]
        d = [1.0, 0.0, 0.0]
        if rx:
            p = [p[0], p[1] * math.cos(ax) - p[2] * math.sin(ax), p[1] * math.sin(ax) + p[2] * math.cos(ax)]
        if ry:
            p = [p[0] * math.cos(ay) - p[2] * math.sin(ay), p[1], p[0] * math.sin(ay) + p[2] * math.cos(ay)]
            d = [math.cos(ay), 0, math.sin(ay)]
        lo, hi = -math.inf, math.inf
        for q, v, a, size, pivot in zip(p, d, cube["origin"], cube["size"], (px, py, pz)):
            a -= pivot
            if abs(v) < 1e-12:
                if not a <= q <= a + size:
                    hi = -math.inf
                    break
            else:
                ends = ((a - q) / v, (a + size - q) / v)
                lo, hi = max(lo, min(ends)), min(hi, max(ends))
        if lo <= hi:
            outer = max(outer, hi)
    return outer


# Headlights: a slim teardrop lens set into each bow flank, widest at the rear and tapering to a point
# toward the stem: one flat lens per plan segment, turned with it and following the sheer (ADR 0161).
headlights = []
LAMP = (32.0, 42.0)  # on plan stations
LAMP_PROUD = 0.15
LAMP_MIN_PROUD = 0.03  # a flat lens over faceted planks: kept clear of the face so it cannot z-fight
lamp_segments = [(a, b) for a, b in zip(PLAN_STATIONS, PLAN_STATIONS[1:]) if LAMP[0] <= a and b <= LAMP[1]]
lamp_yaws = [yaw(a, beam_plan(a), b, beam_plan(b)) for a, b in lamp_segments]
for k, (za, zb) in enumerate(lamp_segments):
    zm = (za + zb) / 2
    t = (zm - LAMP[0]) / (LAMP[1] - LAMP[0])
    h = 1.5 * (1 - t) + 0.4 * t
    yc = sheer(zm) - 3.2 + 1.2 * t
    angle = lamp_yaws[k]
    cosine = math.cos(angle)
    sine = math.sin(angle)
    overlap = 0.25
    length = math.hypot(zb - za, beam_plan(zb) - beam_plan(za))
    out = LAMP_PROUD
    # Keep the station yaw while fitting its plane to the actual merged faces. The
    # maximum clearance limits standoff; the depth buries the back across sheer-strake joints.
    for _ in range(3):
        clearances = []
        for j in range(81):
            along = -overlap + (length + 2 * overlap) * j / 80
            z = za + along * cosine - out * sine
            x = beam_plan(za) + along * sine + out * cosine
            for fraction in (0.001, 0.25, 0.5, 0.75, 0.999):
                y = yc + h * (fraction - 0.5)
                clearances.append((x - hull_face(y, z)) * cosine)
        out += max(LAMP_PROUD - max(clearances), LAMP_MIN_PROUD - min(clearances))
    depth = 0.4
    headlights += paired_plank(*proud(za, beam_plan(za), zb, beam_plan(zb), out),
                               yc - h / 2, yc + h / 2, "light", depth, overlap)

geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [{
        "description": {
            "identifier": "geometry.yasu_ride.sportsboat",
            "texture_width": TEXTURE_WIDTH, "texture_height": TEXTURE_HEIGHT,
            "visible_bounds_width": 8, "visible_bounds_height": 4, "visible_bounds_offset": [0, 1.5, 0],
        },
        "bones": [
            # The bow rise and the roll turn the whole boat about this point, in the aft third
            # at the waterline, so the bow lifts and the stern squats a little (ADR 0059)
            {"name": "root", "pivot": [0, 7, -20]},
            # Where the wake leaves each jet nozzle's bore
            {"name": "body", "parent": "root", "pivot": [0, 7, 0], "cubes": body,
             "locators": {"jet_left": [-5.0, 3.0, -52.0], "jet_right": [5.0, 3.0, -52.0]}},
            {"name": "headlights", "parent": "body", "pivot": [0, 7, 0], "cubes": headlights},
            {"name": "windshield", "parent": "body", "pivot": [0, 7, 0], "cubes": glass},
            {"name": "mirror", "parent": "body", "pivot": [0, 7, 0], "cubes": mirror},
        ],
    }],
}


def turn_around(bones):
    """Rotate 180 degrees around the Y axis (negate x and z)."""
    for bone in bones:
        if "pivot" in bone:
            bone["pivot"] = [-bone["pivot"][0], bone["pivot"][1], -bone["pivot"][2]]
        for name, (lx, ly, lz) in bone.get("locators", {}).items():
            bone["locators"][name] = [-lx, ly, -lz]
        for cube in bone.get("cubes", []):
            (x, y, z), (w, h, d) = cube["origin"], cube["size"]
            cube["origin"] = [-(x + w), y, -(z + d)]
            if "pivot" in cube:
                cube["pivot"] = [-cube["pivot"][0], cube["pivot"][1], -cube["pivot"][2]]
            if "rotation" in cube:
                rx, ry, rz = cube["rotation"]
                # Turning around negates z rotations too, but the game turns a cube's z rotation the
                # other way from the right-handed one this file builds with, so keeping rz lets the
                # game show the angles as written (ADR 0058). x rotations are written in the game's
                # sense already (ADR 0051).
                cube["rotation"] = [-rx, ry, rz]
            # Turning around swaps which way each face points; quilted faces must follow
            f = cube["uv"]
            f["north"], f["south"], f["east"], f["west"] = f["south"], f["north"], f["west"], f["east"]


def rounded(value):
    """Round floats to 4 places to drop float noise such as 5.714285714285714. The file is written
    compact because `indent=1` output exceeds Biome's 1 MiB `files.maxSize`, and `pnpm model` could
    no longer format it."""
    if isinstance(value, float):
        return round(value, 4) + 0.0  # + 0.0 turns -0.0 into 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


turn_around(geo["minecraft:geometry"][0]["bones"])
emit(MODELS / "sportsboat.geo.json", json.dumps(rounded(geo), separators=(",", ":")))


def png(path, w, h, pixel):
    # pixel returns (r, g, b) for an opaque texel or (r, g, b, a)
    pixels = [[(*pixel(x, y), 255)[:4] for x in range(w)] for y in range(h)]
    rows = b"".join(b"\x00" + b"".join(bytes(texel) for texel in row) for row in pixels)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    emit(path, data, pixels)


def swatch_cell(x, y):
    """The swatch cell (x 4i..4i+3, y 0..3) that holds texel (x, y), or None outside the swatch row."""
    return x // 4 if y < 4 else None


def cell_mer(cells, default=MER_OFF, extra=None):
    """A MER texel function: swatch cell i (x 4i..4i+3, y 0..3) gets cells[i], `extra(x, y)` may claim
    any other texel by returning its MER, and every other texel gets `default`."""

    def mer(x, y):
        value = cells.get(swatch_cell(x, y))
        if value is None and extra is not None:
            value = extra(x, y)
        return (*(default if value is None else value), 255)

    return mer


def write_texture_set(color_name, mer_name):
    texture_set = {
        "format_version": "1.16.100",
        "minecraft:texture_set": {"color": color_name, "metalness_emissive_roughness": mer_name},
    }
    emit(ENTITY_TEXTURES / f"{color_name}.texture_set.json", json.dumps(texture_set))


def lit_textures(kind, width, height, pixel):
    def color(x, y):
        rgba = (*pixel(x, y), 255)[:4]
        return (*rgba[:3], 0) if swatch_cell(x, y) in LIT_SLOTS else rgba

    png(ENTITY_TEXTURES / f"{kind}_lit.png", width, height, color)
    png(ENTITY_TEXTURES / f"{kind}_lit_mer.png", width, height, cell_mer({slot: MER_LIT for slot in LIT_SLOTS}))
    write_texture_set(f"{kind}_lit", f"{kind}_lit_mer")


(MU, MV), (MW, MH) = TILES["mirror"]["uv"], TILES["mirror"]["size"]


def in_mirror_glass(x, y):
    return MU < x < MU + MW - 1 and MV < y < MV + MH - 1


def mirror_tile(x, y):
    if not in_mirror_glass(x, y):
        return MIRROR_RIM
    t = (y - MV - 1) / (MH - 3)
    return tuple(round(a + (b - a) * t) for a, b in zip(MIRROR_SKY, MIRROR_HORIZON))


def mirror_textures(width, height, pixel):
    def glass_mer(x, y):
        return MER_MIRROR if in_mirror_glass(x, y) else None

    png(ENTITY_TEXTURES / "sportsboat_mirror.png", width, height, pixel)
    png(ENTITY_TEXTURES / "sportsboat_mirror_mer.png", width, height,
        cell_mer({MIRROR_SLOT: MER_MIRROR}, extra=glass_mer))
    write_texture_set("sportsboat_mirror", "sportsboat_mirror_mer")


def swatches(hull_color):
    colors = {**PALETTE, "hull": hull_color}

    def swatch(x, y):
        i = swatch_cell(x, y)
        if i is None or i >= len(NAMES):
            return (0, 0, 0)
        name = NAMES[i]
        return (*colors[name], ALPHA.get(name, 255))

    pixels = [[swatch(x, y) for x in range(TEXTURE_WIDTH)] for y in range(TEXTURE_HEIGHT)]
    for tile in TILES.values():
        tile["paint"](pixels)
    return lambda x, y: pixels[y][x]


for paint, hull_color in HULL_PAINTS.items():
    name = "sportsboat" if paint == "khaki" else f"sportsboat_{paint}"
    png(ENTITY_TEXTURES / f"{name}.png", TEXTURE_WIDTH, TEXTURE_HEIGHT, swatches(hull_color))
    png(ENTITY_TEXTURES / f"{name}_mer.png", TEXTURE_WIDTH, TEXTURE_HEIGHT,
        cell_mer({HULL_SLOT: MER_HULL}))
    write_texture_set(name, f"{name}_mer")

lit_textures("sportsboat", TEXTURE_WIDTH, TEXTURE_HEIGHT, swatches(HULL_PAINTS["khaki"]))
mirror_textures(TEXTURE_WIDTH, TEXTURE_HEIGHT, swatches(HULL_PAINTS["khaki"]))

# Item icon: a 16-pixel side view, bow to the right, tower leaning forward, on transparency.
ICON = [
    "................",
    "................",
    "......KKKKKK....",
    ".....KKKKKKKK...",
    ".......F.F......",
    "......F.F.......",
    ".....F.F........",
    "....F.F...GGG...",
    ".TTF.F...GGGGG..",
    "HHHHHHHHHHHHHHHH",
    "SSSSSSSSSSSSSSSS",
    "HHHHHHHHHHHHHHH.",
    ".HHHHHHHHHHHHH..",
    "..HHHHHHHHHHH...",
    "................",
    "................",
]
ICON_COLORS = {"K": (44, 44, 48), "F": (70, 70, 76), "G": (170, 205, 225), "T": PALETTE["seat"],
               "H": (20, 20, 22), "S": PALETTE["trim"]}


def icon(x, y):
    return ICON_COLORS.get(ICON[y][x], (0, 0, 0, 0))


png(ITEM_TEXTURES / "sportsboat_item.png", 16, 16, icon)
print("cubes:", len(body) + len(headlights) + len(glass) + len(mirror))
if STALE:
    sys.exit("Stale sports boat outputs:\n" + "\n".join(STALE))
if CHECK:
    print("sports boat model and textures are up to date")
