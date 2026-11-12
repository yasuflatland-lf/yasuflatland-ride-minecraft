"""Build the glass sugar pot model in pixels from the historical reference (ADR 0247).

A straight-sided 32-sided glass jar on a thick glass base, a rolled rim, a flat lid with a
rounded edge and a knob, sugar crystals inside, and a steel spoon. Rings are yaw-only 32-sided
panel rings; discs are z strips of one box each, so no texel is cut out (alpha 0) and the pair
blocks can stay opaque (ADR 0247). Glass regions carry alpha 64..192; sugar and steel are opaque.
"""

import math

from tool_loader import load_tool as _load_tool

_gear_model = _load_tool("gear_model")
_atlas = _load_tool("gear_atlas")
_kit = _load_tool("gear_kit")
_paint = _load_tool("gear_paint")
_panels = _load_tool("panels")

SIDES = 32
# The widest ring: its panel corners, not its flat faces, reach the item width of 3 px.
RIM_APOTHEM = 1.4844
JAR_APOTHEM = 1.4
SUGAR_RADIUS = 1.3
SUGAR_TOP = 1.75
BASE_TOP = 0.3
WALL_TOP = 2.9
RIM_TOP = 3.1
LID_TOP = 3.3
NECK_TOP = 3.75
KNOB_TOP = 4.0
DISC_STRIPS = 10
SUGAR_STRIPS = 12
# Direction of the light that shades the wall panels (x, z), front left.
LIGHT = (-0.6, -0.8)
SUGAR_PX = 24
LID_PX = 20
SPOON_FROM = (0.8, 1.45, -0.9)
SPOON_TO = (0.8, 3.8, 0.0)


def _glass_wall(tile, level):
    """A wall panel strip: clear glass above the sugar line and, below it, the sugar seen through
    the glass, so the jar still shows its contents when a pair block draws every face opaque."""
    shift = 6 * level - 9
    fill = round(tile.height * (WALL_TOP - SUGAR_TOP) / (WALL_TOP - BASE_TOP))
    top = (226 + shift, 240 + shift, 238 + shift, 132 + 6 * level)
    bottom = (204 + shift, 226 + shift, 224 + shift, 108 + 6 * level)
    _paint.linear_gradient(tile, top, bottom, (0, 0), (0, fill))
    sugar = (min(244 + shift, 255), min(238 + shift, 255), min(220 + shift, 255), 176)
    _paint.fill(tile, sugar, 0, fill, tile.width, tile.height)
    _paint.fill(tile, (252, 250, 238, 188), 0, fill, tile.width, fill + 1)
    _paint.noise(tile, 90 + level, 6, (0, fill + 1, tile.width, tile.height))


def _paint_sugar(tile):
    _paint.fill(tile, (238, 233, 216, 255))
    _paint.noise(tile, 14237, 14)
    for i in range(tile.width * tile.height // 4):
        x = (i * 7919 + i // 5 * 31) % tile.width
        y = (i * 104729 // 3 + i * 13) % tile.height
        tile.set(x, y, (255, 255, 252, 255) if i % 3 else (214, 206, 186, 255))


def _paint_lid(tile):
    w, h = tile.width, tile.height
    _paint.radial_gradient(tile, (236, 248, 246, 112), (190, 214, 214, 150), (w * 0.4, h * 0.38), w * 0.7)
    _paint.ellipse(tile, (w / 2, h / 2), (w * 0.2, h * 0.2), (226, 242, 240, 90))
    _paint.line(tile, (w * 0.2, h * 0.72), (w * 0.8, h * 0.72), (248, 255, 254, 176), 1)


def _paint_steel(tile):
    half = tile.width // 2
    _paint.linear_gradient(tile, (60, 72, 78, 255), (236, 246, 246, 255), (0, 0), (half, 0), (0, 0, half, tile.height))
    _paint.linear_gradient(tile, (236, 246, 246, 255), (44, 56, 62, 255), (half, 0), (tile.width, 0),
                           (half, 0, tile.width, tile.height))


def _circle(radius):
    return {"a": radius, "zf": -radius, "zb": radius, "nf": 2, "nb": 2}


def _disc(radius, y0, y1, strips, uv_for):
    """A disc of z strips, one box each; uv_for(lo, hi, half_width) returns the strip's face."""
    outline = _circle(radius)
    cuts = [-radius * math.cos(math.pi * i / strips) for i in range(strips + 1)]
    cubes = []
    for lo, hi in zip(cuts, cuts[1:]):
        half = _kit.width_at(outline, (lo + hi) / 2)
        cubes.extend(_kit.plate({"a": half, "zf": lo, "zb": hi}, y0, y1, uv_for(lo, hi, half)))
    return cubes


def _mapped(tile, radius):
    """A strip's face as the matching rectangle of a region that spans the disc's diameter."""
    scale_x, scale_y = tile.width / (2 * radius), tile.height / (2 * radius)

    def uv_for(lo, hi, half):
        return tile.uv(tile.width / 2 - half * scale_x, (lo + radius) * scale_y,
                       tile.width / 2 + half * scale_x, (hi + radius) * scale_y)

    return uv_for


def _shade(cube):
    """0 (dark side) to 3 (lit side) from the panel's outward direction against LIGHT."""
    # A ring panel with yaw 0 sits on the -z side; its outward direction turns with the yaw.
    angle = math.radians(cube["rotation"][1])
    facing = -math.sin(angle) * LIGHT[0] - math.cos(angle) * LIGHT[1]
    return 3 if facing > 0.6 else 2 if facing > 0 else 1 if facing > -0.6 else 0


def _shaded_ring(apothem, y0, y1, thickness, regions):
    cubes = _kit.ring(SIDES, apothem, y0, y1, regions[1], thickness)
    for cube in cubes:
        face = regions[_shade(cube)]
        cube["uv"] = {side: dict(face) for side in cube["uv"]}
    return cubes


def _spoon(steel):
    """A handle and a flat bowl pitched about x only, leaning back out of the sugar."""
    dy, dz = SPOON_TO[1] - SPOON_FROM[1], SPOON_TO[2] - SPOON_FROM[2]
    length = math.hypot(dy, dz)
    pitch = _panels.r4(math.degrees(math.atan2(dy, dz)))
    cubes = list(_kit.tube([SPOON_FROM, SPOON_TO], 0.1, steel))
    cx, cy, cz = SPOON_FROM[0], SPOON_FROM[1] + 0.15 * dy / length, SPOON_FROM[2] + 0.15 * dz / length
    cubes.append(_panels.panel(cx - 0.14, cy - 0.03, cz - 0.22, cx + 0.14, cy + 0.03, cz + 0.22,
                               steel, (cx, cy, cz), (pitch, 0, 0)))
    return cubes


def _to_millipixels(cube):
    """The block files keep three decimals; pair ends shift cubes by whole pixels or halves."""
    return {key: [round(v, 3) for v in value] if key in ("origin", "size", "pivot") else value
            for key, value in cube.items()}


def build() -> _gear_model.GearModel:
    wall = []
    for level in range(4):
        region = _atlas.tile("sugar_pot", 4, 22)
        _glass_wall(region, level)
        wall.append(region.uv(0, 0, 4, 22))
    sugar = _atlas.tile("sugar_pot", SUGAR_PX, SUGAR_PX)
    _paint_sugar(sugar)
    lid = _atlas.tile("sugar_pot", LID_PX, LID_PX)
    _paint_lid(lid)
    base = _atlas.tile("sugar_pot", 4, 4)
    _paint.fill(base, (200, 226, 216, 150))
    rim = _atlas.tile("sugar_pot", 4, 4)
    _paint.fill(rim, (238, 252, 250, 176))
    steel_tile = _atlas.tile("sugar_pot", 8, 8)
    _paint_steel(steel_tile)
    base_face, rim_face, steel = base.uv(0, 0, 4, 4), rim.uv(0, 0, 4, 4), steel_tile.uv(0, 0, 8, 8)

    cubes = []
    cubes += _disc(JAR_APOTHEM, 0, BASE_TOP, DISC_STRIPS, lambda lo, hi, half: base_face)
    cubes += _kit.ring(SIDES, JAR_APOTHEM, 0, BASE_TOP, base_face, 0.5)
    cubes += _disc(SUGAR_RADIUS, BASE_TOP, SUGAR_TOP, SUGAR_STRIPS, _mapped(sugar, SUGAR_RADIUS))
    cubes += _shaded_ring(JAR_APOTHEM, BASE_TOP, WALL_TOP, 0.12, wall)
    cubes += _kit.ring(SIDES, RIM_APOTHEM, WALL_TOP, RIM_TOP, rim_face, 0.3)
    cubes += _disc(JAR_APOTHEM, RIM_TOP - 0.1, LID_TOP, DISC_STRIPS, _mapped(lid, JAR_APOTHEM))
    cubes += _kit.ring(SIDES, 1.45, RIM_TOP, RIM_TOP + 0.12, rim_face, 0.3)
    cubes += _disc(0.35, LID_TOP, LID_TOP + 0.2, 6, _mapped(lid, 0.35))
    cubes += _kit.ring(16, 0.27, LID_TOP + 0.2, NECK_TOP, rim_face, 0.12)
    cubes += _disc(0.41, NECK_TOP, KNOB_TOP, 6, _mapped(lid, 0.41))
    cubes += _spoon(steel)
    return _gear_model.GearModel(
        cubes=tuple(_to_millipixels(cube) for cube in cubes),
        texture_request=("sugar_pot",),
    )
