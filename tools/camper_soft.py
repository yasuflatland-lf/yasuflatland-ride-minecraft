"""Fixed olive upholstery in the camper's build frame (+x right)."""

from __future__ import annotations

import math
import random
from functools import lru_cache
from typing import TYPE_CHECKING

from tool_loader import load_tool

if TYPE_CHECKING:
    from camper_kit import AreaCubes
    from camper_regions import RegionRegistry

regions = load_tool("camper_regions")
AREA = "soft"
TWEED = "olive looped tweed"
BOLSTER = "olive khaki cream bolster"
WELT = "olive welt"
REGIONS = ((TWEED, 192, 256), (BOLSTER, 128, 128), (WELT, 32, 32))
FACES = ("north", "south", "east", "west", "up", "down")
NOISE = (-3, -1, 0, 0, 1, 2, 3)
STRIPES = ((95, 99, 53), (177, 165, 119), (211, 202, 166), (118, 116, 69))


@lru_cache(maxsize=1)
def fabric_pixels() -> dict[str, bytes]:
    rng = random.Random(1968)
    # The approved study drew four kitchen regions before the fabrics. Advance its
    # random stream without coupling upholstery colours to those future modules.
    for _ in range(192 * 192):
        rng.choice(NOISE)
        if rng.random() < .13:
            rng.randrange(8, 35)
    for _ in range(224 * 160):
        rng.choice(NOISE)
    for _ in range(45):
        rng.randrange(8, 224 - 8)
        rng.choice((6, 160 - 7))
    for _ in range(128 * 64):
        rng.choice(NOISE)
        rng.choice((-5, 0, 5))
    for _ in range(128 * 128):
        rng.choice(NOISE)
    result = {}
    for name, width, height in REGIONS:
        pixels = bytearray()
        for y in range(height):
            for x in range(width):
                noise = rng.choice(NOISE)
                if name == WELT:
                    color = (85, 84, 43)
                    noise += round(9 * math.sin(y * .6))
                else:
                    color = STRIPES[(x // 8) % 4] if name == BOLSTER else (100, 105, 56)
                    noise += (-12, -3, 6, 2, 0, -5)[x % 6]
                    noise += -6 if (x // 3 + y // 2) % 3 == 0 else 2
                    if x % 3 == 1 and y % 4 == 1:
                        noise += 13
                pixels.extend((*[max(0, min(255, v + noise)) for v in color], 255))
        result[name] = bytes(pixels)
    return result


def register_regions(registry: RegionRegistry) -> None:
    for name, width, height in REGIONS:
        pixels = fabric_pixels()[name]
        registry.register(regions.Region(name, width, height, regions.Material.FABRIC,
            lambda x, y, data=pixels, w=width: tuple(data[(y * w + x) * 4:(y * w + x + 1) * 4])))


def fabric_box(registry: RegionRegistry, origin: list[float], size: list[float],
               material: str = TWEED) -> dict:
    layout = registry._layout
    if layout is None:
        raise ValueError("Pack the upholstery registry before building cubes")
    region = next(r for r in layout.regions if r.name == material)
    cube = {"origin": origin, "size": size, "uv": {}}
    for face in FACES:
        uv = {"uv": list(layout.origin(material)), "uv_size": [region.width, region.height]}
        layout.bind_face(material, uv)
        cube["uv"][face] = uv
    return cube


def cushion(registry: RegionRegistry, origin: list[float], size: list[float],
            material: str = TWEED, piping: bool = True) -> list[dict]:
    x, y, z = origin
    w, h, d = size
    if min(size) <= 0:
        raise ValueError("Cushion dimensions must be positive")
    r = min(.48, h * .22, w * .22, d * .22)
    slabs = (
        ([x+r, y, z+r], [w-2*r, h, d-2*r]),
        ([x, y+r, z+r], [w, h-2*r, d-2*r]),
        ([x+r, y+r, z], [w-2*r, h-2*r, d]),
        ([x+r*.4, y+r*.4, z+r*.4], [w-r*.8, h-r*.8, d-r*.8]),
        ([x+r*.7, y+r*.15, z+r*.7], [w-r*1.4, h-r*.3, d-r*1.4]),
    )
    cubes = [fabric_box(registry, o, s, material) for o, s in slabs]
    if piping:
        # Only the two exposed shoulder strips survived the study's hidden-cube
        # cleanup. Scale their offsets for small cushions so no strip escapes.
        sx, sy, sz = min(1, w), min(1, h), min(1, d)
        cubes.extend((
            fabric_box(registry, [x+.45*sx, y+h-.30*sy, z+d-.28*sz],
                       [w-.90*sx, .10*sy, .10*sz], WELT),
            fabric_box(registry, [x+w-.28*sx, y+h-.30*sy, z+.45*sz],
                       [.10*sx, .10*sy, d-.90*sz], WELT),
        ))
    return cubes


def _build_cushion(registry: RegionRegistry, x: float, y: float, z: float,
                   w: float, h: float, d: float, material: str = TWEED,
                   piping: bool = True) -> list[dict]:
    # Study coordinates are already mirrored. Reflect each slab, rather than
    # the whole cushion, to retain the exposed welt on the same shoulder.
    cubes = cushion(registry, [x, y, z], [w, h, d], material, piping)
    for c in cubes:
        c['origin'][0] = -c['origin'][0] - c['size'][0]
    return cubes


def build_soft(registry: RegionRegistry) -> AreaCubes:
    kit = load_tool("camper_kit")
    built = kit.AreaCubes()
    for name, z, back in (("seat_2", -23, -24), ("seat_3", 10, 21.5)):
        built[name] = [fabric_box(registry, [-23, kit.FLOOR, z], [15, 5, 13])]
        built[name] += _build_cushion(registry, 8, 21, z, 15, 2, 13, piping=False)
        built[name] += _build_cushion(registry, 8, 23, back, 15, 13, 2.5)
    built['seat_2'] += _build_cushion(registry, 10, 23, -20.4, 9, 2.1, 3, BOLSTER)
    bed = _build_cushion(registry, 8.3, 19, 24.3, 14.4, 4.5, 30.4)
    bed += _build_cushion(registry, 8.2, 23.5, 24.2, 14.6, 1.5, 22.8, piping=False)
    # The foot cover is only 0.3 px deep: a slab and two transverse welts
    # replace the study's inverted chamfer slabs and negative-length piping.
    bed.append(fabric_box(registry, [-22.9, 21, 24.1], [14.8, 2.5, .3]))
    for z in (24.12, 24.3):
        bed.append(fabric_box(registry, [-22.45, 23.2, z], [13.9, .1, .1], WELT))
    bed += _build_cushion(registry, 8.2, 24.6, 46, 14.6, .8, 1.5, piping=False)
    bed += _build_cushion(registry, 10, 23.5, 49, 11, 2.5, 4.5, BOLSTER)
    built['body'] = bed
    bunk = _build_cushion(registry, 8.3, 33, 24.3, 14.4, 2.5, 30.4)
    bunk += _build_cushion(registry, 8.2, 35.5, 24.2, 14.3, 1, 22.8, piping=False)
    bunk += _build_cushion(registry, 10, 35.5, 49, 11, 2, 4.5, BOLSTER, piping=False)
    built['bunk'] = bunk
    return built


def build() -> AreaCubes:
    return build_soft(load_tool("camper_kit").REGISTRY)
