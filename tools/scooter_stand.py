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
STAND_HALF_WIDTH = 4.3
STAND_TILT_DEGREES = 20
STAND_LEG_DIAMETER = 0.95
STAND_FOOT_DIAMETER = 1.2
STAND_FOOT_LENGTH = 1.4
STAND_BAR_Y = 1.8
STAND_BAR_DIAMETER = 0.95
STAND_SHAFT_DIAMETER = 0.6
STAND_SHAFT_OVERHANG = 0.35
STAND_LUG_DIAMETER = 1.4
STAND_LUG_THICKNESS = 0.45
STAND_BRACKET_HALF_DEPTH = 0.55
STAND_BRACKET_INNER_X = 3.3
STAND_BRACKET_PLATE_THICKNESS = 0.16
STAND_TUBE_ROLLS = tuple(index * 11.25 for index in range(8))


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
    for sign in (-1, 1):
        x = sign * STAND_HALF_WIDTH
        foot = _tube([_leg_at_y(x, STAND_FOOT_LENGTH * cosine), _leg_at_y(x, 0)],
                     STAND_FOOT_DIAMETER, "rubber")
        # Raise along the leg axis so the rotated rubber envelope meets the tyre ground plane.
        ground_offset = -min(p[1] for cube in foot for p in kit.tilt.corners(cube))
        foot_top_y = ground_offset + STAND_FOOT_LENGTH * cosine
        result.add(BONE, _tube([_leg_at_y(x, foot_top_y), _leg_at_y(x, ground_offset)],
                               STAND_FOOT_DIAMETER, "rubber"))
        result.add(BONE, _tube([_leg_at_y(x, pivot_y), _leg_at_y(x, foot_top_y)], STAND_LEG_DIAMETER))
        result.add(BONE, _tube([(x - STAND_LUG_THICKNESS/2, pivot_y, pivot_z),
                                (x + STAND_LUG_THICKNESS/2, pivot_y, pivot_z)], STAND_LUG_DIAMETER))
        result.add(BONE, kit.box((x - STAND_LUG_THICKNESS/2, pivot_y, pivot_z - STAND_BRACKET_HALF_DEPTH),
                                 (x + STAND_LUG_THICKNESS/2, STAND_FLOOR_Y,
                                  pivot_z + STAND_BRACKET_HALF_DEPTH), atlas.faces("chrome")), assembly=ASSEMBLY)
        plate_x = sorted((sign * STAND_BRACKET_INNER_X,
                          sign * (STAND_HALF_WIDTH + STAND_LUG_THICKNESS/2)))
        result.add(BONE, kit.box((plate_x[0], STAND_FLOOR_Y - STAND_BRACKET_PLATE_THICKNESS,
                                  pivot_z - STAND_BRACKET_HALF_DEPTH),
                                 (plate_x[1], STAND_FLOOR_Y, pivot_z + STAND_BRACKET_HALF_DEPTH),
                                 atlas.faces("chrome")), assembly=ASSEMBLY)
    shaft_half = STAND_HALF_WIDTH + STAND_SHAFT_OVERHANG
    result.add(BONE, _tube([(-shaft_half, pivot_y, pivot_z), (shaft_half, pivot_y, pivot_z)],
                           STAND_SHAFT_DIAMETER))
    result.add(BONE, _tube([_leg_at_y(-STAND_HALF_WIDTH, STAND_BAR_Y),
                            _leg_at_y(STAND_HALF_WIDTH, STAND_BAR_Y)], STAND_BAR_DIAMETER))
    return result
