"""Build the photo-shaped fridge without changing its storage or hinge contract."""

import json
import math
from copy import deepcopy
from typing import Any

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
Cube = dict[str, Any]
Profile = tuple[float, float, float, float, float]
AREA = "fridge"

FRIDGE_HINGE = [8.3, 0, -23.3]
FRIDGE_X = (9.0, 22.4)
FRIDGE_Y = (16.0, 49.0)
FRIDGE_Z = (-23.5, -8.5)
FRIDGE_SIDE = 0.6
FRIDGE_TOP_UNDERSIDE = 48.0
FRIDGE_TOP_RADIUS = 2.2
FRIDGE_BOTTOM_RADIUS = 0.5
CARCASS_SLICE = 0.25
# The 3 px floor hides the wheel-arch hump and preserves the decor slot surface.
BACK_LINER = (21.9, 19.0, -22.9, 22.4, 48.0, -9.1)
BOTTOM_PANEL = (9.0, 16.0, -22.9, 22.4, 19.0, -9.1)
DIVIDER = (9.0, 35.0, -22.9, 21.9, 36.0, -9.1)
CHROME_SEAM = (8.4, 35.2, -23.2, 9.0, 35.8, -8.8)
TOP_DOOR = (35.8, 48.8, 39.66)
BOTTOM_DOOR = (16.5, 35.2, 31.74)
DOOR_X = (8.5, 9.0)
DOOR_Z = (-23.3, -8.6)
TOP_DOOR_RADIUS = 2.05
SMALL_DOOR_RADIUS = 0.5
FACE_X = (8.29, 8.5)
FACE_Y_INSET = 0.08
FACE_Z = (-23.22, -8.68)
TOP_FACE_RADIUS = 1.97
SMALL_FACE_RADIUS = 0.45
PANEL_Y_INSET = 1.0
PANEL_HANDLE_RISE = 3.1
PANEL_Z = (-19.8, -9.65)
PANEL_RADIUS = 1.15
BEVEL_RINGS = 3
BEVEL_STEP = 0.09
BEVEL_X_STEP = 0.055
PANEL_X = (8.455, 8.5)
PANEL_INSET = BEVEL_RINGS * BEVEL_STEP
HOUSING_X = (8.04, 8.29)
HOUSING_HALF_HEIGHT = 0.48
HOUSING_Z = (-11.3, -9.45)
HOUSING_RADIUS = 0.32
INSERT_X = (7.98, 8.04)
INSERT_HALF_HEIGHT = 0.30
INSERT_Z = (-11.12, -9.62)
INSERT_RADIUS = 0.2
# Handle boxes use y offsets from the handle centre; the tip flares toward the aisle.
LEVER = (7.68, -0.17, -13.9, 7.98, 0.17, -10.2)
LEVER_RIM = (7.65, 0.11, -13.9, 7.96, 0.20, -10.2)
LEVER_TIP = (7.6, -0.24, -14.23, 7.91, 0.24, -13.85)
LINER_X = (9.0, 9.22)
LINER_Y_INSET = 0.55
LINER_Z = (-22.7, -9.2)
TOP_LINER_RADIUS = 1.4
SMALL_LINER_RADIUS = 0.3
TOP_BIN_OFFSETS = (2.0,)
BOTTOM_BIN_OFFSETS = (3.0, 9.0)
BIN_FLOOR = (9.22, 0.0, -22.0, 10.1, 0.18, -10.0)
BIN_LIP = (9.95, 0.0, -22.0, 10.1, 1.35, -10.0)
BIN_ENDS = ((9.22, 0.0, -22.0, 10.1, 1.35, -21.8),
            (9.22, 0.0, -10.2, 10.1, 1.35, -10.0))
CURVE_SEGMENTS = 9
MERGE_PRECISION = 7
MERGE_EPSILON = 1e-7
OUTPUT_PRECISION = 3


def box(x0: float, y0: float, z0: float, x1: float, y1: float,
        z1: float, color: str = "ivory") -> Cube:
    cube = kit.box(x0, y0, z0, x1, y1, z1, color)
    # Merge at spike precision before rounding: independently rounded slices leave gaps.
    cube["origin"] = [x0, y0, z0]
    cube["size"] = [x1 - x0, y1 - y0, z1 - z0]
    return cube


def bounds(y: float, y0: float, y1: float, z0: float, z1: float,
           top_radius: float, bottom_radius: float) -> tuple[float, float]:
    inset = 0.0
    if y > y1 - top_radius:
        inset = top_radius - math.sqrt(max(0, top_radius**2 - (y - (y1 - top_radius))**2))
    elif y < y0 + bottom_radius:
        inset = bottom_radius - math.sqrt(max(0, bottom_radius**2 - (y - (y0 + bottom_radius))**2))
    return z0 + inset, z1 - inset


def rounded(x0: float, x1: float, y0: float, y1: float, z0: float, z1: float,
            top_radius: float, bottom_radius: float, color: str = "ivory",
            hole: Profile | None = None) -> list[Cube]:
    cuts = {y0, y1, y0 + bottom_radius, y1 - top_radius}
    for radius, base in ((bottom_radius, y0), (top_radius, y1 - top_radius)):
        cuts.update(base + radius * i / CURVE_SEGMENTS for i in range(1, CURVE_SEGMENTS))
    if hole:
        hy0, hy1, hz0, hz1, hr = hole
        cuts.update((hy0, hy1, hy0 + hr, hy1 - hr))
        for i in range(1, CURVE_SEGMENTS):
            cuts.update((hy0 + hr * i / CURVE_SEGMENTS, hy1 - hr + hr * i / CURVE_SEGMENTS))
    ordered = sorted(v for v in cuts if y0 <= v <= y1)
    cubes = []
    for a, b in zip(ordered, ordered[1:]):
        mid = (a + b) / 2
        left, right = bounds(mid, y0, y1, z0, z1, top_radius, bottom_radius)
        if hole and hy0 < mid < hy1:
            hole_left, hole_right = bounds(mid, hy0, hy1, hz0, hz1, hr, hr)
            spans = ((left, hole_left), (hole_right, right))
        else:
            spans = ((left, right),)
        cubes.extend(box(x0, a, left, x1, b, right, color) for left, right in spans if right > left)
    return cubes


def offset_box(dimensions: tuple[float, ...], y: float, color: str) -> Cube:
    x0, y0, z0, x1, y1, z1 = dimensions
    return box(x0, y + y0, z0, x1, y + y1, z1, color)


def door(y0: float, y1: float, handle_y: float, top: bool) -> list[Cube]:
    cubes = rounded(*DOOR_X, y0, y1, *DOOR_Z,
                    TOP_DOOR_RADIUS if top else SMALL_DOOR_RADIUS, SMALL_DOOR_RADIUS)
    panel = (y0 + PANEL_Y_INSET, min(y1 - PANEL_Y_INSET, handle_y + PANEL_HANDLE_RISE),
             *PANEL_Z, PANEL_RADIUS)
    cubes += rounded(*FACE_X, y0 + FACE_Y_INSET, y1 - FACE_Y_INSET, *FACE_Z,
                     TOP_FACE_RADIUS if top else SMALL_FACE_RADIUS, SMALL_FACE_RADIUS, hole=panel)
    hy0, hy1, hz0, hz1, radius = panel
    for i in range(BEVEL_RINGS):
        d = BEVEL_STEP * i
        outer = (hy0 + d, hy1 - d, hz0 + d, hz1 - d, radius - d)
        inner = (hy0 + d + BEVEL_STEP, hy1 - d - BEVEL_STEP,
                 hz0 + d + BEVEL_STEP, hz1 - d - BEVEL_STEP, radius - d - BEVEL_STEP)
        cubes += rounded(FACE_X[0] + BEVEL_X_STEP * i, FACE_X[1],
                         *outer[:4], outer[4], outer[4], hole=inner)
    cubes += rounded(*PANEL_X, hy0 + PANEL_INSET, hy1 - PANEL_INSET,
                     hz0 + PANEL_INSET, hz1 - PANEL_INSET,
                     radius - PANEL_INSET, radius - PANEL_INSET)
    cubes += rounded(*HOUSING_X, handle_y - HOUSING_HALF_HEIGHT, handle_y + HOUSING_HALF_HEIGHT,
                     *HOUSING_Z, HOUSING_RADIUS, HOUSING_RADIUS, "chrome")
    cubes += rounded(*INSERT_X, handle_y - INSERT_HALF_HEIGHT, handle_y + INSERT_HALF_HEIGHT,
                     *INSERT_Z, INSERT_RADIUS, INSERT_RADIUS, "steel")
    for dimensions, color in ((LEVER, "chrome"), (LEVER_RIM, "rim"), (LEVER_TIP, "chrome")):
        cubes.append(offset_box(dimensions, handle_y, color))
    cubes += rounded(*LINER_X, y0 + LINER_Y_INSET, y1 - LINER_Y_INSET, *LINER_Z,
                     TOP_LINER_RADIUS if top else SMALL_LINER_RADIUS, SMALL_LINER_RADIUS, "white")
    for offset in TOP_BIN_OFFSETS if top else BOTTOM_BIN_OFFSETS:
        cubes.extend(offset_box(dimensions, y0 + offset, "white")
                     for dimensions in (BIN_FLOOR, BIN_LIP, *BIN_ENDS))
    # The spike cleanup joins the straight bevel edges to the surrounding face.
    return finish(merge_axis(merge_vertical(cubes), 2))


def merge_axis(cubes: list[Cube], axis: int) -> list[Cube]:
    groups: dict[tuple, list[Cube]] = {}
    other = [i for i in range(3) if i != axis]
    for cube in cubes:
        key = (*[round(cube[field][i], MERGE_PRECISION)
                 for field in ("origin", "size") for i in other], json.dumps(cube["uv"], sort_keys=True))
        groups.setdefault(key, []).append(deepcopy(cube))
    result = []
    for group in groups.values():
        previous = None
        for cube in sorted(group, key=lambda c: c["origin"][axis]):
            if previous is not None and abs(previous["origin"][axis] + previous["size"][axis] - cube["origin"][axis]) < MERGE_EPSILON:
                previous["size"][axis] += cube["size"][axis]
            else:
                result.append(cube)
                previous = cube
    return result


def merge_vertical(cubes: list[Cube]) -> list[Cube]:
    return merge_axis(cubes, 1)


def finish(cubes: list[Cube]) -> list[Cube]:
    for cube in cubes:
        for field in ("origin", "size"):
            cube[field] = [round(v, OUTPUT_PRECISION) for v in cube[field]]
    return cubes


def build_fridge() -> AreaCubes:
    body = [box(*dimensions, "white") for dimensions in (BACK_LINER, BOTTOM_PANEL, DIVIDER)]
    for i in range(round((FRIDGE_Y[1] - FRIDGE_Y[0]) / CARCASS_SLICE)):
        a = FRIDGE_Y[0] + i * CARCASS_SLICE
        b = a + CARCASS_SLICE
        left, right = bounds((a + b) / 2, *FRIDGE_Y, *FRIDGE_Z, FRIDGE_TOP_RADIUS, FRIDGE_BOTTOM_RADIUS)
        if b <= FRIDGE_TOP_UNDERSIDE:
            body.extend((box(FRIDGE_X[0], a, left, FRIDGE_X[1], b, left + FRIDGE_SIDE),
                         box(FRIDGE_X[0], a, right - FRIDGE_SIDE, FRIDGE_X[1], b, right)))
        else:
            body.append(box(FRIDGE_X[0], a, left, FRIDGE_X[1], b, right))
    body.append(box(*CHROME_SEAM, "chrome"))
    return AreaCubes({"body": finish(merge_vertical(body)),
                      "fridge_top_door": door(*TOP_DOOR, top=True),
                      "fridge_bottom_door": door(*BOTTOM_DOOR, top=False)})


build = build_fridge
