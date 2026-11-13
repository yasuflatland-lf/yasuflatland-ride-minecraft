"""Build window curtains, interleaved with the shell in the original cube order.

The body ranges for both shell and curtains are consequently disjoint. Anchors
identify the window panes after which the orchestrator inserts each curtain pair.
"""

import math

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
HW, right_windows, left_windows = kit.HW, kit.right_windows, kit.left_windows
box = kit.box

AREA = "curtains"


def windows():
    for x0, x1, windows in ((HW - 1, HW, right_windows), (-HW, -HW + 1, left_windows)):
        for z0, z1, y0, y1 in windows:
            if z0 > -40 and y1 - y0 > 5:  # curtains drawn to the window edges inside
                yield x0, x1, z0, z1, y0, y1


def anchors():
    return [kit.window_glass(x0, (z0, z1, y0, y1)) for x0, x1, z0, z1, y0, y1 in windows()]


def _depth(sign, wall, depth):
    return sign * round(wall - depth, 3)


def make_panel(registry: kit.regions.RegionRegistry, sign=-1, edge=0, direction=1, span=25, wall=HW - 1) -> list[dict]:
    regions = load_tool("camper_regions")
    tilt = load_tool("cube_tilt")
    ref = next(regions.RegionRef(registry, r) for r in registry.regions() if r.name == "light curtain fabric")
    # A short window narrows the panel below the width the fold shading was baked for (the 5-wide
    # window); the shading is then slightly compressed, as in the approved spike model.
    width = min(regions.CURTAIN_MAX_WIDTH, span * regions.CURTAIN_SPAN_RATIO)
    hem, top, tie = regions.CURTAIN_HEM_Y, regions.CURTAIN_TOP_Y, regions.CURTAIN_TIE_Y
    columns = regions.CURTAIN_FAN_COLUMNS
    levels = regions.CURTAIN_LEVELS
    cubes = []
    cloth_cubes = []

    def cloth(cube, u, v, w, h):
        for face in ("east", "west"):
            start = u + w if direction < 0 else u
            cube["uv"][face] = {"uv": list(ref.uv(start, v)), "uv_size": [-w if direction < 0 else w, h]}
        cloth_cubes.append(cube)
        return cube

    for ya, yb in zip(levels, levels[1:]):
        wa, wb = regions.curtain_width(ya, width), regions.curtain_width(yb, width)
        for j in range(columns):
            p = (j + .5) / columns
            za, zb = edge + direction * (.12 + p * wa), edge + direction * (.12 + p * wb)
            ym, z = (ya + yb) / 2, (za + zb) / 2
            fade = .48 + .52 * min(1, abs(ym - tie) / 4)
            x = sign * round(wall - regions.CURTAIN_CLOTH_DEPTH - regions.CURTAIN_FOLD_DEPTH * fade, 6)
            breadth = max(wa, wb) / columns * 1.05
            if j == 0:
                za = zb = z = edge + direction * (.12 + breadth / 2)
            length = math.hypot(yb - ya, zb - za)
            c = box(x - .035, ym - length / 2, z - breadth / 2, x + .035, ym + length / 2 + (.24 if ya > hem and yb < levels[-1] else .06), z + breadth / 2, "curtain")
            c = cloth(c, j * 24, (top - yb) * 8, 24, (yb - ya) * 8)
            c = tilt.tilt_assembly([c], [x, ym, z], "x", -math.degrees(math.atan2(zb - za, yb - ya)), "curtain_fold", {"curtain_fold": {}})[0]
            cloth_cubes[-1] = c
            cubes.append(c)
    x = _depth(sign, wall, regions.CURTAIN_CLOTH_DEPTH + regions.CURTAIN_FOLD_DEPTH)
    z = edge + direction * (.12 + width / 2)
    cubes.append(cloth(box(x - .055, round(top - .16, 3), z - width / 2, x + .055, top, z + width / 2, "curtain"), 0, 0, 96, 1.28))
    narrow = width * regions.CURTAIN_NARROW_RATIO
    tw = narrow + .20
    x = _depth(sign, wall, regions.CURTAIN_TIE_DEPTH)
    z = edge + direction * (.12 + narrow / 2)
    cubes.append(box(x - .075, tie - .27, z - tw / 2, x + .075, tie + .27, z + tw / 2, "curtain"))
    tab_z = edge + direction * .29
    cubes.append(box(x - .09, tie - .10, tab_z - .22, x + .09, tie + .13, tab_z + .22, "curtain"))
    cubes.append(box(x - sign * .12 - .045, tie - .055, tab_z - .065, x - sign * .12 + .045, tie + .075, tab_z + .065, "chrome"))
    for cube in cloth_cubes:
        for face in ("east", "west"):
            ref.bind(cube["uv"][face])
    return cubes


def build_curtains(registry: kit.regions.RegionRegistry) -> AreaCubes:
    regions = load_tool("camper_regions")
    body = []
    rail_lo, rail_hi = regions.CURTAIN_RAIL_Y
    for x0, x1, z0, z1, y0, y1 in windows():
        sign = 1 if x0 > 0 else -1
        wall = abs(x0 if sign > 0 else x1)
        for edge, direction in ((z0, 1), (z1, -1)):
            body.extend(make_panel(registry, sign, edge, direction, z1 - z0, wall))
        x = _depth(sign, wall, regions.CURTAIN_RAIL_DEPTH)
        body.append(box(x - .11, rail_lo, z0, x + .11, rail_hi, z1, "aluminium"))
    return AreaCubes({"body": body})


def build() -> AreaCubes:
    return build_curtains(kit.REGISTRY)
