"""Scooter centre stand."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")

AREA = "stand"
BONE = "stand"
ASSEMBLY = "running_stand"
STAND_FLOOR_Y = 5.29
STAND_HALF_WIDTH = 2.6
STAND_TILT_DEGREES = 8
STAND_LEG_DIAMETER = 0.5
STAND_LEG_BREAKS = (0, 0.15, 0.28, 0.5, 0.75, 1)
STAND_FOOT_DIAMETER = 0.75
STAND_FOOT_LENGTH = 0.6
STAND_BAR_Y = 0.95
STAND_BAR_DIAMETER = 0.55
STAND_SHAFT_DIAMETER = 0.6
STAND_SHAFT_OVERHANG = 0.35
STAND_LUG_DIAMETER = 0.6
STAND_LUG_THICKNESS = 0.45
STAND_BRACKET_HALF_DEPTH = 0.1
STAND_BRACKET_FORWARD_OFFSET = 0.1
STAND_BRACKET_INNER_X = STAND_HALF_WIDTH - 0.4
STAND_BRACKET_PLATE_THICKNESS = 0.16
STAND_TUBE_ROLLS = tuple(index * 22.5 for index in range(4))


def _tube(points, diameter, finish="chrome"):
    # Overlapping rolled squares share a circular envelope; trim the kit's joint overlap.
    size = diameter / math.sqrt(2)
    cubes = []
    for roll in STAND_TUBE_ROLLS:
        cube, = kit.tube(points, size, atlas.faces(finish), assembly=ASSEMBLY, roll=roll)
        extension = kit.TUBE_END_EXTENSION * size
        cube["origin"][2] += extension
        cube["size"][2] -= 2 * extension
        cubes.append(cube)
    return cubes


def _leg_at_y(x, y):
    return (x, y, dims.STAND_PIVOT[2] + (dims.STAND_PIVOT[1] - y)
            * math.tan(math.radians(STAND_TILT_DEGREES)))


def build():
    result = kit.AreaCubes()
    _, pivot_y, pivot_z = dims.STAND_PIVOT
    cosine = math.cos(math.radians(STAND_TILT_DEGREES))
    bracket_front = pivot_z - STAND_BRACKET_FORWARD_OFFSET - STAND_BRACKET_HALF_DEPTH
    bracket_back = pivot_z - STAND_BRACKET_FORWARD_OFFSET + STAND_BRACKET_HALF_DEPTH
    for sign in (-1, 1):
        x = sign * STAND_HALF_WIDTH
        foot = _tube([_leg_at_y(x, STAND_FOOT_LENGTH * cosine), _leg_at_y(x, 0)],
                     STAND_FOOT_DIAMETER, "rubber")
        # Raise along the leg axis so the rotated rubber envelope meets the tyre ground plane.
        ground_offset = -min(p[1] for cube in foot for p in kit.tilt.corners(cube))
        foot_top_y = ground_offset + STAND_FOOT_LENGTH * cosine
        result.add(BONE, _tube([_leg_at_y(x, foot_top_y), _leg_at_y(x, ground_offset)],
                               STAND_FOOT_DIAMETER, "rubber"))
        # Shorter collinear sections keep conservative fold bounds out of the exhaust bend.
        for top, bottom in zip(STAND_LEG_BREAKS, STAND_LEG_BREAKS[1:]):
            top_y = pivot_y + (foot_top_y - pivot_y) * top
            bottom_y = pivot_y + (foot_top_y - pivot_y) * bottom
            result.add(BONE, _tube([_leg_at_y(x, top_y), _leg_at_y(x, bottom_y)], STAND_LEG_DIAMETER))
        result.add(BONE, _tube([(x - STAND_LUG_THICKNESS/2, pivot_y, pivot_z),
                                (x + STAND_LUG_THICKNESS/2, pivot_y, pivot_z)], STAND_LUG_DIAMETER))
        result.add(BONE, kit.box((x - STAND_LUG_THICKNESS/2, pivot_y, bracket_front),
                                 (x + STAND_LUG_THICKNESS/2, STAND_FLOOR_Y,
                                  bracket_back), atlas.faces("chrome")), assembly=ASSEMBLY)
        plate_x = sorted((sign * STAND_BRACKET_INNER_X,
                          sign * (STAND_HALF_WIDTH + STAND_LUG_THICKNESS/2)))
        result.add(BONE, kit.box((plate_x[0], STAND_FLOOR_Y - STAND_BRACKET_PLATE_THICKNESS,
                                  bracket_front),
                                 (plate_x[1], STAND_FLOOR_Y, bracket_back),
                                 atlas.faces("chrome")), assembly=ASSEMBLY)
    shaft_half = STAND_HALF_WIDTH + STAND_SHAFT_OVERHANG
    result.add(BONE, _tube([(-shaft_half, pivot_y, pivot_z), (shaft_half, pivot_y, pivot_z)],
                           STAND_SHAFT_DIAMETER))
    result.add(BONE, _tube([_leg_at_y(-STAND_HALF_WIDTH, STAND_BAR_Y),
                            _leg_at_y(STAND_HALF_WIDTH, STAND_BAR_Y)], STAND_BAR_DIAMETER))
    return result
