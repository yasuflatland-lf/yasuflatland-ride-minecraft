"""Pure checks for the provisional camping gear contracts in ADR 0247."""

import math

from tool_loader import load_tool

gear_atlas = load_tool("gear_atlas")
cube_tilt = load_tool("cube_tilt")

# ADR 0247 counts decomposed item cubes and the two visible pair ends.
MAX_CUBES_PER_ITEM = 256
MAX_CUBES_PER_PAIR_BLOCK = 512
CELL = 128
CELL_GUTTER = 4
CELLS_PER_ROW = 4


def item_budget_errors(item_id, cubes, limit=MAX_CUBES_PER_ITEM):
    return ([f"{item_id}: {len(cubes)} cubes, over MAX_CUBES_PER_ITEM {limit}"]
            if len(cubes) > limit else [])


def pair_budget_errors(kind, counts, limit=MAX_CUBES_PER_PAIR_BLOCK):
    if not counts:
        return []
    item_id = max(counts, key=counts.get)
    count = 2 * counts[item_id]
    return ([f"{kind} pair: {item_id} + {item_id} = {count} visible cubes, over MAX_CUBES_PER_PAIR_BLOCK {limit}"]
            if count > limit else [])


def rotation_errors(item_id, cubes):
    return [f"{item_id}: cube {i} has roll or more than two rotation axes"
            for i, cube in enumerate(cubes) if cube_tilt.axis_count(cube) > 2 or cube.get("rotation", [0, 0, 0])[2] != 0]


def face_rect(face):
    (u, v), (du, dv) = face["uv"], face["uv_size"]
    return min(u, u + du), min(v, v + dv), max(u, u + du), max(v, v + dv)


def allowed_regions(item_id, tiles):
    swatch = gear_atlas.SWATCH
    regions = [(swatch * (i % swatch), swatch * (i // swatch),
                swatch * (i % swatch + 1), swatch * (i // swatch + 1))
               for i in range(len(gear_atlas.PALETTE))]
    if item_id in tiles:
        n = tiles[item_id]
        x, y = CELL * (n % CELLS_PER_ROW), CELL * (n // CELLS_PER_ROW)
        regions.append((x + CELL_GUTTER, y + CELL_GUTTER,
                        x + CELL - CELL_GUTTER, y + CELL - CELL_GUTTER))
    return regions


def uv_errors(item_id, cubes, tiles):
    regions = allowed_regions(item_id, tiles)
    errors = []
    for i, cube in enumerate(cubes):
        for name, face in cube["uv"].items():
            rect = face_rect(face)
            u0, v0, u1, v1 = rect
            if not any(x0 <= u0 <= u1 <= x1 and y0 <= v0 <= v1 <= y1
                       for x0, y0, x1, y1 in regions):
                errors.append(f"{item_id}: cube {i} face {name} UV {rect} outside allowed regions")
    return errors


def sampled_alphas(cubes, pixels, size):
    alphas = set()
    for cube in cubes:
        for face in cube["uv"].values():
            u0, v0, u1, v1 = face_rect(face)
            if u0 == u1 or v0 == v1:
                continue
            for y in range(max(0, math.floor(v0)), min(size, math.ceil(v1))):
                for x in range(max(0, math.floor(u0)), min(size, math.ceil(u1))):
                    alphas.add(pixels[4 * (y * size + x) + 3])
    return alphas


def alpha_errors(item_id, glass, alphas):
    invalid = sorted(a for a in alphas if a not in (0, 255) and not (glass and 64 <= a <= 192))
    errors = [f"{item_id}: forbidden alpha values {invalid}"] if invalid else []
    if glass and not any(64 <= a <= 192 for a in alphas):
        errors.append(f"{item_id}: glass requires translucent alpha 64..192, sampled {sorted(alphas)}")
    return errors
