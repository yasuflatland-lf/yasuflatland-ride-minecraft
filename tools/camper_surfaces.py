"""Registered carpet, veneer, backsplash and oak surfaces in the build frame."""

from __future__ import annotations

import math
import random
from copy import deepcopy
from functools import lru_cache
from typing import TYPE_CHECKING, NotRequired, TypedDict
from tool_loader import load_tool

if TYPE_CHECKING:
    from camper_kit import AreaCubes
    from camper_regions import RegionRef, RegionRegistry

regions = load_tool("camper_regions")
RGBA = tuple[int, int, int, int]


class Face(TypedDict):
    uv: list[float]
    uv_size: list[float]


class Cube(TypedDict):
    origin: list[float]
    size: list[float]
    uv: dict[str, Face]
    rotation: NotRequired[list[float]]
    pivot: NotRequired[list[float]]


AREA = "surfaces"
CARPET_SIZE = (74, 222)
WALL_SIZE = (416, 180)
TILE_SIZE = (124, 152)
TABLE_SIZE = (168, 144)
CARPET_SCALE, WALL_SCALE, TILE_SCALE, TABLE_SCALE = 2, 4, 8, 12
WALL_FRONT, WALL_TOP = -48, 61
WALL_THICKNESS = 0.2
WALL_UV_INSET = 0.5
TILE_FRONT, TILE_REAR, TILE_BOTTOM, TILE_TOP = 24, 39.5, 30, 49
TILE_PITCH = (TILE_REAR - TILE_FRONT) / 13
LEG_CENTER, LEG_WIDTH, LEG_HEIGHT = -14, 1, 11
TABLE_BOUNDS = (-23, 27, -6, -9, 28, 6)
FLOOR_BOTTOM, FLOOR_WIDTH = 13, 36.6
CARPET_BASE = (176, 136, 92)
CARPET_SEED, CARPET_BREAK_LENGTH = 7, 22
CARPET_NOISE, CARPET_FIBRE_RATE, CARPET_FIBRE_SHADE = 4, 0.06, 8

HASH_X, HASH_Y, HASH_SEED, HASH_MIX = 374761393, 668265263, 144269, 1274126177
HASH_WORD_MASK, HASH_SAMPLE_MASK = 0xffffffff, 65535
HASH_SHIFTS = (13, 16)
CARPET_TONES = (0.90, 1.05)
WALL_BASE, WALL_RAIL_BASE = (196, 170, 128), (183, 184, 175)
WALL_THREAD_WIDTH, WALL_WEAVE_PERIOD = 2, 4
WALL_THREAD_SHADE, WALL_THREAD_VARIATION = 4, 3
WALL_WARP_SEED, WALL_WEFT_SEED = 61, 62
WALL_RAILS, WALL_RAIL_HALF_WIDTH = (35.5, 49.5), 0.5
WALL_RAIL_EDGE, WALL_RAIL_SHADES = 0.29, (-15, 22)
WALL_SCREW_OFFSET, WALL_SCREW_PITCH = 47.5, 12
WALL_SCREW_PHASE, WALL_SCREW_HALF_WIDTH, WALL_SCREW_HALF_HEIGHT = 0.5, 0.25, 0.24
WALL_SCREW_SHADE = -55
WALL_RAIL_NOISE = (2, 9, 1/3, 15)
TILE_GROUT, TILE_BASE = (143, 139, 111, 255), (194, 182, 149)
TILE_CLOUDS = ((18, 0.47, 0.53, 23), (9, 0.22, 0.25, 24))
TILE_VEIN_U, TILE_VEIN_V, TILE_VEIN_WARP = 6, 4, 2.2
TILE_VEIN_SCALE, TILE_VEIN_SEED = 0.6, 25
TILE_VEIN_THRESHOLD, TILE_VEIN_SHADE = 0.60, 10
TILE_VARIATION, TILE_VARIATION_SEED = 3, 26
OAK_BASE, OAK_PLANK_WIDTH, OAK_LENGTH = (176, 142, 103), 3.5, 12
OAK_CENTRES, OAK_ENDS, OAK_TONES = (0.37, 0.58, 0.43, 0.61), (-0.22, 1.15, -0.40, 1.30), (2, -4, 4, -1)
OAK_SEED, OAK_SEED_STEP = 50, 7
OAK_CROSS_SCALE, OAK_ALONG_SCALE = 1.7, 0.85
OAK_RING_FREQUENCY, OAK_RING_WARP, OAK_RING_NOISE = 42, 1.7, (4, 7)
OAK_RING_LIGHT, OAK_RING_DARK, OAK_RING_PHASE, OAK_RING_POWER = 3, 11, 0.25, 12
OAK_GRAIN_NOISE = ((3, 18, 3, 1), (1.3, 52, 10, 2))
OAK_KNOTS = {1: (0.28, 0.68), 3: (0.70, 0.30)}
OAK_KNOT_STRETCH, OAK_KNOT_SPREAD = 2.2, 0.10
OAK_KNOT_BASE, OAK_KNOT_RING, OAK_KNOT_FREQUENCY = 12, 13, 95
OAK_KNOT_NOISE = (9, 12)
OAK_KNOT_CORE, OAK_KNOT_CORE_SPREAD = 24, 0.003
OAK_JOINT_WIDTH, OAK_JOINT_SHADE = 0.018, 15


def hash_noise(x: float, y: float, seed: int = 0, *, integer: bool = False) -> float | int:
    # Cloth uses the raw sample to keep thread shading entirely in integer arithmetic.
    n = (int(x) * HASH_X + int(y) * HASH_Y + seed * HASH_SEED) & HASH_WORD_MASK
    n = ((n ^ (n >> HASH_SHIFTS[0])) * HASH_MIX) & HASH_WORD_MASK
    sample = (n ^ (n >> HASH_SHIFTS[1])) & HASH_SAMPLE_MASK
    return sample if integer else sample / (HASH_SAMPLE_MASK / 2) - 1


def noise(x: float, y: float, seed: int = 0) -> float:
    a, b = math.floor(x), math.floor(y)
    u, v = x - a, y - b
    u, v = u*u*(3-2*u), v*v*(3-2*v)
    return ((1-u)*hash_noise(a,b,seed) + u*hash_noise(a+1,b,seed))*(1-v) + \
        ((1-u)*hash_noise(a,b+1,seed) + u*hash_noise(a+1,b+1,seed))*v


def tinted(base: tuple[int, ...], delta: float) -> RGBA:
    return tuple(max(0, min(255, round(c + delta))) for c in base[:3]) + (255,)


@lru_cache(maxsize=1)
def carpet_pixels() -> tuple[RGBA, ...]:
    # The spike's seeded stream is row-major; cache it so sampling order cannot change fibres.
    rng = random.Random(CARPET_SEED)
    tones = (tuple(int(c * CARPET_TONES[0]) for c in CARPET_BASE), CARPET_BASE,
             tuple(min(255, int(c * CARPET_TONES[1])) for c in CARPET_BASE))
    pixels = []
    for y in range(CARPET_SIZE[1]):
        for x in range(CARPET_SIZE[0]):
            color = tones[(x + (y // CARPET_BREAK_LENGTH) % 2) % len(tones)]
            delta = rng.uniform(-CARPET_NOISE, CARPET_NOISE)
            if rng.random() < CARPET_FIBRE_RATE:
                delta -= CARPET_FIBRE_SHADE
            pixels.append(tuple(max(0, min(255, int(c + delta))) for c in color) + (255,))
    return tuple(pixels)


def carpet_pixel(x: int, y: int) -> RGBA:
    return carpet_pixels()[y * CARPET_SIZE[0] + x]


@lru_cache(maxsize=math.prod(WALL_SIZE))
def wall_pixel(x: int, row: int) -> RGBA:
    u, v = x + 0.5, row + 0.5
    z, y = WALL_FRONT + u / WALL_SCALE, WALL_TOP - v / WALL_SCALE
    for rail in WALL_RAILS:
        if abs(y-rail) < WALL_RAIL_HALF_WIDTH:
            edge = abs(y-rail)
            shade = WALL_RAIL_SHADES[0 if edge > WALL_RAIL_EDGE else 1]
            if (abs((z+WALL_SCREW_OFFSET) % WALL_SCREW_PITCH - WALL_SCREW_PHASE) < WALL_SCREW_HALF_WIDTH
                    and edge < WALL_SCREW_HALF_HEIGHT):
                shade = WALL_SCREW_SHADE
            gain, su, sv, seed = WALL_RAIL_NOISE
            return tinted(WALL_RAIL_BASE, shade + noise(u/su, v/sv, seed)*gain)
    warp, weft = x // WALL_THREAD_WIDTH, row // WALL_THREAD_WIDTH
    # Alternate which thread passes over the crossing. Each two-texel cross-section
    # has opposite integer tints, so every 4 x 4 repeat has exactly the base mean.
    if (x % WALL_WEAVE_PERIOD) // WALL_THREAD_WIDTH == (row % WALL_WEAVE_PERIOD) // WALL_THREAD_WIDTH:
        phase = x % WALL_THREAD_WIDTH
        variation = hash_noise(warp, 0, WALL_WARP_SEED, integer=True) % WALL_THREAD_VARIATION
    else:
        phase = row % WALL_THREAD_WIDTH
        variation = hash_noise(weft, 0, WALL_WEFT_SEED, integer=True) % WALL_THREAD_VARIATION
    return tinted(WALL_BASE, (2 * phase - 1) * (WALL_THREAD_SHADE + variation))


@lru_cache(maxsize=math.prod(TILE_SIZE))
def tile_pixel(x: int, row: int) -> RGBA:
    u, v = (x + 0.5) / TILE_SCALE, (row + 0.5) / TILE_SCALE
    if u % TILE_PITCH < 1/TILE_SCALE or v % TILE_PITCH < 1/TILE_SCALE:
        return TILE_GROUT
    cloud = sum(gain*noise(u/su, v/sv, seed) for gain,su,sv,seed in TILE_CLOUDS)
    vein = math.sin(u*TILE_VEIN_U + v*TILE_VEIN_V + TILE_VEIN_WARP*noise(u/TILE_VEIN_SCALE,v/TILE_VEIN_SCALE,TILE_VEIN_SEED))
    cloud -= max(0, vein-TILE_VEIN_THRESHOLD)*TILE_VEIN_SHADE
    variation = hash_noise(math.floor(u/TILE_PITCH), math.floor(v/TILE_PITCH),TILE_VARIATION_SEED)*TILE_VARIATION
    return tinted(TILE_BASE, cloud + variation)


@lru_cache(maxsize=math.prod(TABLE_SIZE))
def oak_pixel(column: int, row: int) -> RGBA:
    x, z = (column + 0.5) / TABLE_SCALE, (row + 0.5) / TABLE_SCALE
    plank = min(len(OAK_CENTRES)-1, int(x/OAK_PLANK_WIDTH))
    q = (x-plank*OAK_PLANK_WIDTH)/OAK_PLANK_WIDTH
    length = z/OAK_LENGTH
    seed = OAK_SEED+plank*OAK_SEED_STEP
    cross = (q-OAK_CENTRES[plank])*OAK_CROSS_SCALE
    along = (length-OAK_ENDS[plank])*OAK_ALONG_SCALE
    radius = math.sqrt(cross*cross+along*along)
    phase = radius*OAK_RING_FREQUENCY + OAK_RING_WARP*noise(q*OAK_RING_NOISE[0],length*OAK_RING_NOISE[1],seed)
    grain = OAK_RING_LIGHT*math.sin(phase) - OAK_RING_DARK*max(0,math.sin(phase+OAK_RING_PHASE))**OAK_RING_POWER
    grain += sum(gain*noise(q*su,length*sv,seed+offset) for gain,su,sv,offset in OAK_GRAIN_NOISE)
    if plank in OAK_KNOTS:
        knot_q, knot_t = OAK_KNOTS[plank]
        dx, dz = q-knot_q, (length-knot_t)*OAK_KNOT_STRETCH
        r = math.sqrt(dx*dx+dz*dz)
        influence = math.exp(-r*r/OAK_KNOT_SPREAD)
        grain += influence*(-OAK_KNOT_BASE - OAK_KNOT_RING*max(0,math.sin(r*OAK_KNOT_FREQUENCY+noise(q*OAK_KNOT_NOISE[0],length*OAK_KNOT_NOISE[1],seed))))
        grain -= OAK_KNOT_CORE*math.exp(-r*r/OAK_KNOT_CORE_SPREAD)
    if q < OAK_JOINT_WIDTH:
        grain -= OAK_JOINT_SHADE
    grain += OAK_TONES[plank]
    return tinted(OAK_BASE,grain)


def register_surfaces(registry: RegionRegistry) -> dict[str, RegionRef]:
    definitions = (
        ("carpet v3", CARPET_SIZE, regions.Material.CARPET, carpet_pixel),
        ("wall veneer", WALL_SIZE, regions.Material.WOOD, wall_pixel),
        ("backsplash tile", TILE_SIZE, regions.Material.TILE, tile_pixel),
        ("table oak", TABLE_SIZE, regions.Material.WOOD, oak_pixel),
    )
    existing = {r.name: r for r in registry.regions()}
    return {name: regions.RegionRef(registry, existing[name]) if name in existing else
            registry.register(regions.Region(name, *size, material, pixel))
            for name, size, material, pixel in definitions}


def area_of(cube: Cube) -> str:
    x, y, z = cube['origin']
    width, height, depth = cube['size']
    if y == FLOOR_BOTTOM:
        return 'floor' if width == FLOOR_WIDTH else 'shell'
    if abs(width - WALL_THICKNESS) < 1e-8:
        return ('tile' if x > 0 and TILE_FRONT <= z < TILE_REAR
                and TILE_BOTTOM <= y < TILE_TOP and z + depth <= TILE_REAR
                and y + height <= TILE_TOP else 'walls')
    return 'table'


def build_surfaces(registry: RegionRegistry) -> AreaCubes:
    kit = load_tool('camper_kit')
    if not any(r.name == 'base' for r in registry.regions()):
        registry.register(kit.BASE_REF.region)
    refs = register_surfaces(registry)
    if registry._layout is None:
        regions.pack(registry)
    def face(name: str, uv: tuple[float, float], size: tuple[float, float]) -> Face:
        result = {'uv': list(refs[name].uv(*uv)), 'uv_size': list(size)}
        registry._layout.bind_face(name, result)
        return result

    raw = kit.surface_geometry()
    for hole in kit.wheel_well_holes():
        raw = [piece for cube in raw for piece in kit.carve(cube, hole)]
    body: list[Cube] = []
    for cube in raw:
        x, y, z = cube['origin']
        width, height, depth = cube['size']
        if y == FLOOR_BOTTOM:
            if width == FLOOR_WIDTH:
                cube['uv']['up'] = face('carpet v3', (0, 0), (width*CARPET_SCALE, depth*CARPET_SCALE))
            body.append(cube)
            continue
        ys, zs = [y, y+height], [z, z+depth]
        if x > 0 and z < TILE_REAR and z+depth > TILE_FRONT and y < TILE_TOP and y+height > TILE_BOTTOM:
            ys = sorted({*ys, *(v for v in (TILE_BOTTOM, TILE_TOP) if y < v < y+height)})
            zs = sorted({*zs, *(v for v in (TILE_FRONT, TILE_REAR) if z < v < z+depth)})
        for y0,y1 in zip(ys,ys[1:]):
            for z0,z1 in zip(zs,zs[1:]):
                part = deepcopy(cube)
                part['origin'] = [x,y0,z0]
                part['size'] = [width,round(y1-y0, 3),round(z1-z0, 3)]
                side = 'east' if x < 0 else 'west'
                # Both broad faces use veneer: no flat swatch can show through the lining.
                # Reflect sampling instead of emitting negative extents, and keep endpoints
                # inside opaque texel centres (ADR 0113), including behind the backsplash.
                su, sv = ((n-2*WALL_UV_INSET)/n for n in WALL_SIZE)
                for wall_side in ('east', 'west'):
                    u0 = (z0-WALL_FRONT)*WALL_SCALE if wall_side == 'west' else WALL_SIZE[0]-(z1-WALL_FRONT)*WALL_SCALE
                    v0 = (WALL_TOP-y1)*WALL_SCALE
                    part['uv'][wall_side] = face('wall veneer',
                        (WALL_UV_INSET+u0*su, WALL_UV_INSET+v0*sv),
                        ((z1-z0)*WALL_SCALE*su, (y1-y0)*WALL_SCALE*sv))
                if area_of(part) == 'tile':
                    part['uv'][side] = face('backsplash tile', ((z0-TILE_FRONT)*TILE_SCALE, (TILE_TOP-y1)*TILE_SCALE),
                                            ((z1-z0)*TILE_SCALE, (y1-y0)*TILE_SCALE))
                body.append(part)
    table = kit.box(*TABLE_BOUNDS, 'wood')
    table['uv']['up'] = face('table oak', (0,0), TABLE_SIZE)
    body.extend([table, kit.box(LEG_CENTER-LEG_WIDTH/2, kit.FLOOR, -LEG_WIDTH/2,
                                LEG_CENTER+LEG_WIDTH/2, kit.FLOOR+LEG_HEIGHT, LEG_WIDTH/2, 'chrome')])
    if registry is not kit.REGISTRY:
        old_x, old_y = kit.LAYOUT.origin('base')
        new_x, new_y = registry._layout.origin('base')
        mapped = {id(f) for _, f in registry._layout._faces}
        for cube in body:
            for f in cube['uv'].values():
                if id(f) not in mapped:
                    f['uv'] = [f['uv'][0]-old_x+new_x, f['uv'][1]-old_y+new_y]
                    registry._layout.bind_face('base', f)
    return kit.AreaCubes(body=body)
