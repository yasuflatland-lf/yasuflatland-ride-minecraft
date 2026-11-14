"""Build the laminate kitchen and the single-burner range (ADR 0100, 0112)."""

import math
import random
from dataclasses import dataclass
from functools import cache
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from camper_kit import AreaCubes

from tool_loader import load_tool

regions = load_tool("camper_regions")
RegionRef = regions.RegionRef
RegionRegistry = regions.RegionRegistry
Cube = dict[str, Any]
AREA = "kitchen"
FACES = ("north", "south", "east", "west", "up", "down")
BURNER_CENTER = (16.0, 32.0)
COUNTER_TOP = 30.0
VENT_CENTER = BURNER_CENTER[1]
VENT_WIDTH = 7.3
VENT_START = VENT_CENTER - VENT_WIDTH / 2
VENT_SLOTS = 12
VENT_SLOT_PITCH = 0.55
VENT_SLOT_MARGIN = 0.4
DIAL_ANGLES = (0, 60, 120)
ARM_YAWS = (0, 66, 114, 180, 246, 294)
ARM_SPREADS = (0, -3.8, 3.8)
ARM_TIPS = ((1.425, 1.48, .072, 30.90), (1.48, 1.55, .105, 30.94),
            (1.55, 1.62, .109, 30.95), (1.62, 1.68, .092, 30.94),
            (1.68, 1.71, .055, 30.90))
HEAD_RADIUS = 3.24 * .384 / 2
BORE_RADIUS = HEAD_RADIUS * .565
HEAD_MID_RADIUS = (HEAD_RADIUS + BORE_RADIUS) / 2
HEAD_THICKNESS = HEAD_RADIUS - BORE_RADIUS
# Ellipse radii, strap thickness, bottom, top, swatch, segment count.
BURNER_RINGS = (
    (.85572, .85572, .09, 30.025, 30.065, "tire", 16),
    (1.535, 1.465, .17, 30.035, 30.31, "black", 32),
    (1.535, 1.465, .125, 30.31, 30.365, "tire", 24),
    (1.535, 1.465, .07, 30.365, 30.385, "black", 24),
    (.449, .449, .285, 30.06, 30.47, "grille", 12),
    (.461, .461, .29, 30.47, 30.515, "tire", 12),
    (HEAD_MID_RADIUS, HEAD_MID_RADIUS, HEAD_THICKNESS, 30.515, 30.735, "aluminium", 24),
)
WELL_RADIUS, WELL_BOTTOM, WELL_TOP, WELL_BARS = .90072, 30.002, 30.025, 8
ARM_BAR = (.738, 30.485, -.0375, 1.695, 30.81716, .0375)
ARM_PIVOT = (.738, 30.485, 0)
ARM_TIP_BOTTOM = 30.52
STRAP_YAWS = (30, 150, 270)
STRAPS = ((.86, 30.155, -.0729, 1.49, 30.205, .0729),
          (1.43, 30.205, -.0729, 1.57, 30.395, .0729),
          (1.49, 30.385, -.0729, 1.655, 30.415, .0729))

# Recess the slab under the flush cover so its notch opens onto the basin, not a coplanar face.
COUNTER_LAMINATE = (
    (-22.8, 29, 8.5, 14.3, .75, 15.5),
    (-22.8, 29.75, 8.5, 2.8, .25, 15.5),
    (-11, 29.75, 8.5, 2.5, .25, 15.5),
    (-20, 29.75, 8.5, 9, .25, 9),
    (-20, 29.75, 23, 9, .25, 1),
    (-20, 29.87, 17.5, 8.4, .13, 5.5),
    (-11.6, 29.87, 17.5, .6, .13, 2.2),
    (-11.6, 29.87, 20.25, .6, .13, 2.75),
)
COUNTER_METAL = (
    (-20, 29.75, 17.5, 9, .05, 5.5),
    (-8.53, 29.45, 8.5, .08, .36, 15.5),
    (-22.8, 29.45, 8.5, 14.3, .36, .08), (-22.8, 29.45, 23.85, 14.3, .36, .08),
    (-21.2, 30, 19, 1, .18, 3.3),
    (-21.05, 30.18, 19.4, .65, .65, .55), (-21.18, 30.75, 19.34, .90, .12, .67),
    (-21.05, 30.18, 21.4, .65, .65, .55), (-21.18, 30.75, 21.34, .90, .12, .67),
    (-20.7, 30.18, 20.25, .48, .65, .50),
    (-19.3, 30.6, 20.25, .45, .32, .50),
)
SPOUT = (-20.4, 30.65, 20.25, 1.2, .38, .50)
SPOUT_TURN, SPOUT_PIVOT = [0, 0, -18], [-20.4, 30.65, 20.5]
RANGE_METAL = (
    (-22.8, 29, 24, 14.3, 1, 15.5), (-8.8, 29.2, 24.2, .5, 1, 15.1),
    (-22.8, 30, 39.1, 14, .3, .4), (-22.8, 29.9, 24, 14, .3, .3),
    (-9, 17, 24.5, .4, 9.1, 14.5),
    (-9, 16.5, 24, .5, 12.5, .4), (-9, 16.5, 39.1, .5, 12.5, .4),
    (-8.8, 26.6, 24.2, .3, 2.6, 15.1),
)
RANGE_BASE = (
    ((-22.4, 30, 24.3, .7, .4, 4.05), "steel"),
    ((-22.4, 30, 35.65, .7, .4, 3.45), "steel"),
    ((-22.8, 30, 24, .4, 1, 15.5), "ivory"),
    ((-9, 26.3, 24.2, .55, .3, 15.1), "chrome"),
    ((-9, 26.1, 24.5, .3, .2, 14.5), "brown"),
    ((-8.45, 25.3, 25, .35, .5, 13.5), "chrome"),
    ((-8.7, 25.4, 25.3, .25, .3, .5), "chrome"),
    ((-8.7, 25.4, 37.7, .25, .3, .5), "chrome"),
    ((-9, 16, 24.5, .1, 1, 14.5), "black"),
)
OVEN_FACE = (-8.6, 17.8, 25.5, .1, 7, 12.5)
HANDLE_INSET = (-8.07, 25.4, 25.3, .045, .28, 12.9)
DIAL_BEZEL = (-8.50, 27.17, VENT_CENTER - .422, .35, 1.46, .844)
DIAL_PIVOT = [-8.30, 27.90, VENT_CENTER]
DIAL_FACE = (-8.18, 27.39, VENT_CENTER - .52, .18, 1.02, 1.04)


@dataclass(frozen=True)
class KitchenRegions:
    LAMINATE: RegionRef
    STAINLESS: RegionRef
    DIAL: RegionRef
    DARK_OLIVE: RegionRef
    BROWN_ENDGRAIN: RegionRef


BROWN_ENDGRAIN: RegionRef


def __getattr__(name: str):
    if name == "BROWN_ENDGRAIN":
        return load_tool("camper_kit").KITCHEN_REGIONS.BROWN_ENDGRAIN
    raise AttributeError(name)
TEXTURE_SEED = 1968
NOISE = (-3, -1, 0, 0, 1, 2, 3)
# Advance the spike's shared RNG through intervening studies without registering them.
TEXTURE_SEQUENCE = (("laminate", 192, 192), ("panel", 224, 160), ("metal", 128, 64),
                    ("wood", 128, 128), ("fabric", 192, 256), ("stripe", 128, 128),
                    ("welt", 32, 32), ("dial", 64, 64), ("dark", 128, 64))
TEXTURE_BASES = {"laminate": (220, 215, 192), "metal": (176, 177, 165),
                 "wood": (103, 76, 45), "dark": (69, 62, 35), "dial": (53, 45, 29)}
LAMINATE_FLECK_RATE, LAMINATE_FLECK_DEPTH = .13, (8, 35)
LAMINATE_WAVE = (.19, .15, 2)
METAL_WAVE, METAL_STREAKS = (.7, 7), (-5, 0, 5)
WOOD_WAVE = (.32, .04, 2, 9, .91, .03, 4)
DARK_STREAKS = (-3, 3, 1, 0)
DIAL_RINGS = ((2, (177, 177, 163), (231, 229, 210), 3),
              (9, (45, 39, 25), (95, 83, 52), 2))
DIAL_TICKS, DIAL_TICK_START, DIAL_TICK_STEP = 17, 35, 18
DIAL_TICK_RADII = (23, 27)
DIAL_TICK_COLOR = (222, 212, 174)
DIAL_POINTER_COLOR = (229, 220, 184)
DIAL_POINTER_END = (19, 20)
DIAL_POINTER_WIDTH = 3


@cache
def texture_pixels() -> dict[str, tuple]:
    rng = random.Random(TEXTURE_SEED)
    result = {}
    for kind, width, height in TEXTURE_SEQUENCE:
        pixels = []
        for y in range(height):
            for x in range(width):
                n = rng.choice(NOISE)
                if kind == "laminate":
                    if rng.random() < LAMINATE_FLECK_RATE:
                        n -= rng.randrange(*LAMINATE_FLECK_DEPTH)
                    fx, fy, gain = LAMINATE_WAVE
                    n += round(gain * math.sin(x * fx + y * fy))
                elif kind == "metal":
                    frequency, gain = METAL_WAVE
                    n += round(gain * math.sin(y * frequency)) + rng.choice(METAL_STREAKS)
                elif kind == "wood":
                    fx, fy, warp, gain, sx, sy, second = WOOD_WAVE
                    n += round(gain * math.sin(x * fx + warp * math.sin(y * fy)) + second * math.sin(x * sx + y * sy))
                elif kind == "dark":
                    n += DARK_STREAKS[x % len(DARK_STREAKS)]
                if kind in TEXTURE_BASES:
                    pixels.append(tuple(max(0, min(255, v + n)) for v in TEXTURE_BASES[kind]) + (255,))
        if kind == "panel":
            for _ in range(45):
                rng.randrange(8, width - 8)
                rng.choice((6, height - 7))
        if kind in TEXTURE_BASES:
            result[kind] = tuple(pixels)
    result['dial'] = draw_dial(list(result['dial']))
    return result


def draw_dial(pixels: list[tuple]) -> tuple:
    width = 64
    for inset, fill, outline, stroke in DIAL_RINGS:
        center = (width - 1) / 2
        radius = center - inset
        for y in range(width):
            for x in range(width):
                distance = math.hypot(x - center, y - center)
                if distance <= radius:
                    color = outline if distance > radius - stroke else fill
                    pixels[y * width + x] = (*color, 255)
    def line(a, b, color, stroke=1):
        length = math.ceil(round(math.dist(a, b), 6))
        for i in range(length + 1):
            x, y = (round(a[j] + (b[j] - a[j]) * i / length) for j in range(2))
            for dy in range(-(stroke // 2), stroke // 2 + 1):
                for dx in range(-(stroke // 2), stroke // 2 + 1):
                    if 0 <= x + dx < width and 0 <= y + dy < width:
                        pixels[(y + dy) * width + x + dx] = (*color, 255)
    for i in range(DIAL_TICKS):
        angle = math.radians(DIAL_TICK_START + i * DIAL_TICK_STEP)
        points = [(width / 2 + r * math.cos(angle), width / 2 + r * math.sin(angle)) for r in DIAL_TICK_RADII]
        line(*points, DIAL_TICK_COLOR)
    line((width / 2, width / 2), DIAL_POINTER_END, DIAL_POINTER_COLOR, DIAL_POINTER_WIDTH)
    return tuple(pixels)


def register_kitchen(registry: RegionRegistry) -> KitchenRegions:
    definitions = (
        ("flecked laminate", 192, 192, regions.Material.LACQUER, "laminate"),
        ("brushed stainless", 128, 64, regions.Material.METAL, "metal"),
        ("range dial", 64, 64, regions.Material.GLASS_COAT, "dial"),
        ("dark olive cab panel", 128, 64, regions.Material.DARK_LACQUER, "dark"),
        ("brown endgrain and pulls", 128, 128, regions.Material.WOOD, "wood"),
    )
    existing = {r.name: r for r in registry.regions()}
    refs = []
    for name, width, height, material, kind in definitions:
        pixel = lambda x, y, kind=kind, width=width: texture_pixels()[kind][y * width + x]
        refs.append(regions.RegionRef(registry, existing[name]) if name in existing else
                    registry.register(regions.Region(name, width, height, material, pixel)))
    result = KitchenRegions(*refs)
    return result


def model_box(dimensions: tuple, color, registry: RegionRegistry) -> Cube:
    kit = load_tool("camper_kit")
    x, y, z, width, height, depth = dimensions
    if isinstance(color, RegionRef):
        def face():
            value = {"uv": list(color.uv(0, 0)), "uv_size": [color.region.width, color.region.height]}
            registry._layout.bind_face(color.region.name, value)
            return value
    else:
        base = regions.RegionRef(registry, next(r for r in registry.regions() if r.name == "base"))
        def face():
            value = kit.ATLAS.face(color)
            ox, oy = kit.LAYOUT.origin("base")
            value["uv"] = list(base.uv(value["uv"][0] - ox, value["uv"][1] - oy))
            registry._layout.bind_face("base", value)
            return value
    return {"origin": [x, y, z], "size": [width, height, depth], "uv": {f: face() for f in FACES}}


def build_frame(cubes: list[Cube]) -> list[Cube]:
    """Undo the final generator mirror so measurements can stay in the reference's model frame."""
    for c in cubes:
        c['origin'][0] = -(c['origin'][0] + c['size'][0])
        c['uv']['east'], c['uv']['west'] = c['uv']['west'], c['uv']['east']
        if 'pivot' in c:
            c['pivot'][0] *= -1
            c['rotation'][1] *= -1
    return cubes


def burner(cx: float, cz: float, turn: float, registry: RegionRegistry | None = None) -> list[Cube]:
    kit = load_tool("camper_kit")
    tilt = load_tool("cube_tilt")
    registry = registry or kit.REGISTRY
    center = [-cx, COUNTER_TOP, cz]
    cubes = []
    def box(bounds, color, yaw=0, pivot=None):
        x0, y0, z0, x1, y1, z1 = bounds
        c = model_box((-cx+x0, y0, cz+z0, x1-x0, y1-y0, z1-z0), color, registry)
        c.update(rotation=[0, yaw, 0], pivot=list(pivot or center))
        cubes.append(c)
        return c
    def annulus(rx, rz, thickness, bottom, top, color, count):
        for i in range(count):
            angle = i * math.tau / count
            mx, mz = rx * math.cos(angle), rz * math.sin(angle)
            tx, tz = -rx * math.sin(angle), rz * math.cos(angle)
            length = (math.hypot(tx, tz) + thickness / 2) * 2 * math.tan(math.pi / count)
            yaw = math.degrees(math.atan2(-tz, tx))
            box((mx-length/2, bottom, mz-thickness/2, mx+length/2, top, mz+thickness/2),
                color, yaw, [-cx+mx, bottom, cz+mz])
    half = WELL_RADIUS * math.tan(math.pi / (2 * WELL_BARS))
    for i in range(WELL_BARS):
        box((-WELL_RADIUS, WELL_BOTTOM, -half, WELL_RADIUS, WELL_TOP, half), "black", i * 180 / WELL_BARS)
    for ring in BURNER_RINGS:
        start = len(cubes)
        annulus(*ring)
        if ring[5] == "grille":
            for c in cubes[start:]:
                for name in ("north", "south", "east", "west"):
                    f = kit.ATLAS.face(kit.BURNER_CAST_REGION)
                    old_x, old_y = kit.LAYOUT.origin("base")
                    base = regions.RegionRef(registry, next(r for r in registry.regions() if r.name == "base"))
                    f['uv'] = list(base.uv(f['uv'][0] - old_x, f['uv'][1] - old_y))
                    registry._layout.bind_face("base", f)
                    c['uv'][name] = f
    for yaw in ARM_YAWS:
        start = len(cubes)
        for spread in ARM_SPREADS:
            box(ARM_BAR, "black", spread, [-cx+ARM_PIVOT[0], ARM_PIVOT[1], cz])
        for a, b, half, top in ARM_TIPS:
            box((a, ARM_TIP_BOTTOM, -half, b, top, half), "black")
        for c in cubes[start:]:
            shift = [c['pivot'][i] - center[i] for i in range(3)]
            matrix = tilt.cube_matrix(c['rotation'])
            offset = [shift[i] - sum(matrix[i][j] * shift[j] for j in range(3)) for i in range(3)]
            c['origin'] = [c['origin'][i] + offset[i] for i in range(3)]
            c['pivot'] = list(center)
            c['rotation'] = [0, yaw + c['rotation'][1], 0]
    for yaw in STRAP_YAWS:
        for bounds in STRAPS:
            box(bounds, "stripe", yaw)
    if turn:
        matrix = tilt._ry(turn)
        for c in cubes:
            old = c['pivot']
            shift = [old[i] - center[i] for i in range(3)]
            pivot = [center[i] + sum(matrix[i][j] * shift[j] for j in range(3)) for i in range(3)]
            c['origin'] = [c['origin'][i] + pivot[i] - old[i] for i in range(3)]
            c['pivot'] = pivot
            c['rotation'][1] += turn
    return build_frame(cubes)


def build_kitchen_top(registry: RegionRegistry) -> "tuple[AreaCubes, KitchenRegions]":
    kit = load_tool("camper_kit")
    if not any(r.name == "base" for r in registry.regions()):
        registry.register(kit.BASE_REF.region)
    refs = register_kitchen(registry)
    if registry._layout is None:
        regions.pack(registry)
    counter = [model_box(d, refs.LAMINATE, registry) for d in COUNTER_LAMINATE]
    counter += [model_box(d, refs.STAINLESS, registry) for d in COUNTER_METAL]
    spout = model_box(SPOUT, refs.STAINLESS, registry)
    spout.update(rotation=list(SPOUT_TURN), pivot=list(SPOUT_PIVOT))
    counter.append(spout)
    stove = [model_box(d, refs.STAINLESS, registry) for d in RANGE_METAL]
    stove += [model_box(d, color, registry) for d, color in RANGE_BASE]
    stove.append(model_box((-22.4, 29.95, VENT_START, .7, .4, VENT_WIDTH), 'grille', registry))
    for i in range(VENT_SLOTS):
        stove.append(model_box((-22.3, 30.35, VENT_START + VENT_SLOT_MARGIN + VENT_SLOT_PITCH*i, .5, .03, .25), 'black', registry))
    for angle in DIAL_ANGLES:
        c = model_box(DIAL_BEZEL, refs.STAINLESS, registry)
        c.update(rotation=[angle, 0, 0], pivot=list(DIAL_PIVOT))
        stove.append(c)
    dial = model_box(DIAL_FACE, refs.STAINLESS, registry)
    f = {"uv": list(refs.DIAL.uv(0, 0)), "uv_size": [refs.DIAL.region.width, refs.DIAL.region.height]}
    registry._layout.bind_face(refs.DIAL.region.name, f)
    dial['uv']['east'] = f
    stove.extend((dial, model_box(OVEN_FACE, refs.DARK_OLIVE, registry),
                  model_box(HANDLE_INSET, refs.BROWN_ENDGRAIN, registry)))
    return kit.AreaCubes(body=build_frame(counter + stove) + burner(*BURNER_CENTER, 0, registry)), refs


def area_of(cube: Cube) -> str:
    x, y, z = cube['origin']
    if 14 < x < 18 and y >= COUNTER_TOP and 30 < z < 34:
        return 'burner'
    return 'counter' if z < 24 else 'range'
