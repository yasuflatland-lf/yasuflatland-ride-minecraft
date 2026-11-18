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
STAND_LUG_THICKNESS = 0.18
STAND_BRACKET = (1.92, 5.17, 5.34, (-0.83, 0.43))
STAND_FOOT = (3.8, 0.7, -0.6)
STAND_PAD_HALF = (0.23, 0.9, (-0.95, -0.25))
STAND_LEG_SIZE, STAND_BAR_SIZE, STAND_PIVOT_SIZE = 0.32, 0.3, 0.28
STAND_PIVOT_HALF_LENGTH = 0.24

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
    pad_x, pad_height, (pad_back, pad_front) = STAND_PAD_HALF
    for sign in (-1, 1):
        x = sign * STAND_LUG_X
        result.add(BONE, kit.profile_plate(lug, x, STAND_LUG_THICKNESS, "running_stand_lug"))
        result.add(BONE, kit.tube([(x - STAND_PIVOT_HALF_LENGTH, pivot_y, bar_z),
                                      (x + STAND_PIVOT_HALF_LENGTH, pivot_y, bar_z)], STAND_PIVOT_SIZE, chrome))
        result.add(BONE, kit.tube([(x, pivot_y, bar_z), (sign * foot_x, foot_y, foot_z)], STAND_LEG_SIZE,
                                     chrome, assembly="running_stand"))
        result.add(BONE, kit.box((sign * foot_x - pad_x, 0, pad_back), (sign * foot_x + pad_x, pad_height, pad_front),
                                    atlas.faces("rubber")))
    result.add(BONE, kit.tube([(-STAND_LUG_X, pivot_y, bar_z), (STAND_LUG_X, pivot_y, bar_z)], STAND_BAR_SIZE,
                                 chrome))


def build():
    register_regions(atlas.REGISTRY)
    result = kit.AreaCubes()
    _stand(result)
    return result
