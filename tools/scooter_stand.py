"""Scooter centre stand."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")

AREA = "stand"
BONE = "stand"

STAND_FLOOR_Y = 5.29
STAND_LUG_X = 1.6
STAND_LUG_THICKNESS = 0.28
STAND_BRACKET = (1.98, 5.17, 5.34, (-0.83, 0.43))
STAND_FOOT = (3.45, 0.55, -0.25)
STAND_KNEE = (2.35, 2.65, 0.55)
STAND_PAD_HALF = (0.36, 0.38)
STAND_SOLE_HEIGHT = 0.16
STAND_CAP_HEIGHT = 0.72
STAND_CAP_INSET = 0.05
STAND_LEG_SIZE, STAND_BAR_SIZE, STAND_PIVOT_SIZE = 0.43, 0.38, 0.65
STAND_PIVOT_HALF_LENGTH = 0.32
STAND_COLLAR_SIZE = 0.58
STAND_COLLAR_FRACTION = 0.25
STAND_JOIN_SIZE = 0.52
STAND_JOIN_FRACTION = 0.16
STAND_BAR_DROP = 0.65
STAND_BAR_BACK = -0.28
STAND_BAR_HALF = 2.05
STAND_BAR_BOSS_LENGTH = 0.38
STAND_BAR_BOSS_SIZE = 0.56
STAND_TUBE_ROLLS = (0, 45)


def _tube(result, points, size):
    for roll in STAND_TUBE_ROLLS:
        result.add(BONE, kit.tube(points, size, atlas.faces("chrome"),
                                  assembly="running_stand", roll=roll))


def _along(a, b, fraction):
    return tuple(x + (y-x)*fraction for x, y in zip(a, b))


def _stand_lug(pivot_z, pivot_y):
    return [(pivot_z - 0.8, STAND_FLOOR_Y), (pivot_z + 0.4, STAND_FLOOR_Y), (pivot_z + 0.25, pivot_y - 0.13),
            (pivot_z - 0.2, pivot_y - 0.3), (pivot_z - 0.65, pivot_y - 0.13)]


def register_regions(registry):
    if "running_stand_lug" in registry._regions:
        return
    pivot_z, pivot_y = dims.i2m(*dims.STAND_PIXEL)
    width, height, pixel = atlas.outline_pixel(
        _stand_lug(pivot_z, pivot_y), dims.OUTLINE_TEXELS_PER_PX, lambda u, v: dims.LINK_COLOR)
    registry.register(atlas.Region("running_stand_lug", width, height, atlas.Material.CHROME, pixel))


def _stand(result):
    chrome = atlas.faces("chrome")
    pivot_z, pivot_y = dims.i2m(*dims.STAND_PIXEL)
    bar_z = dims.STAND_PIVOT[2]
    half_x, floor_lo, floor_hi, (back, front) = STAND_BRACKET
    result.add(BONE, kit.box((-half_x, floor_lo, pivot_z + back), (half_x, floor_hi, pivot_z + front), chrome))
    lug = _stand_lug(pivot_z, pivot_y)
    foot_x, foot_y, foot_z = STAND_FOOT
    pad_x, pad_z = STAND_PAD_HALF
    bar_y, bar_z = pivot_y - STAND_BAR_DROP, bar_z + STAND_BAR_BACK
    for sign in (-1, 1):
        x = sign * STAND_LUG_X
        pivot = (x, pivot_y, dims.STAND_PIVOT[2])
        knee = (sign * STAND_KNEE[0], *STAND_KNEE[1:])
        foot = (sign * foot_x, foot_y, foot_z)
        result.add(BONE, kit.profile_plate(lug, x, STAND_LUG_THICKNESS, "running_stand_lug"))
        _tube(result, [(x - STAND_PIVOT_HALF_LENGTH, *pivot[1:]),
                       (x + STAND_PIVOT_HALF_LENGTH, *pivot[1:])], STAND_PIVOT_SIZE)
        _tube(result, [pivot, knee, foot], STAND_LEG_SIZE)
        _tube(result, [pivot, _along(pivot, knee, STAND_COLLAR_FRACTION)], STAND_COLLAR_SIZE)
        _tube(result, [_along(knee, pivot, STAND_JOIN_FRACTION), knee], STAND_JOIN_SIZE)
        _tube(result, [(sign * (STAND_BAR_HALF - STAND_BAR_BOSS_LENGTH), bar_y, bar_z),
                       (sign * STAND_BAR_HALF, bar_y, bar_z)], STAND_BAR_BOSS_SIZE)
        result.add(BONE, kit.box((foot[0] - pad_x, 0, foot_z - pad_z),
                                 (foot[0] + pad_x, STAND_SOLE_HEIGHT, foot_z + pad_z), atlas.faces("rubber")))
        inset = STAND_CAP_INSET
        result.add(BONE, kit.box((foot[0] - pad_x + inset, STAND_SOLE_HEIGHT, foot_z - pad_z + inset),
                                 (foot[0] + pad_x - inset, STAND_CAP_HEIGHT, foot_z + pad_z - inset),
                                 atlas.faces("rubber")))
    _tube(result, [(-STAND_BAR_HALF, bar_y, bar_z), (STAND_BAR_HALF, bar_y, bar_z)], STAND_BAR_SIZE)


def build():
    register_regions(atlas.REGISTRY)
    result = kit.AreaCubes()
    _stand(result)
    return result
