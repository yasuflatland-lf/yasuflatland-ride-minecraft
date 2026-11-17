"""Independent front and rear telescoping strut builders."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

kit = load_tool("scooter_kit")

AREA = "struts"


def _front(result):
    pass


REAR_ROD_HALF = 0.25
REAR_SLEEVE_HALF = 0.5
REAR_STEM_HALF = 0.3
# The rod top clears the collar bottom by REAR_SLIDE_OVERLAP after the fold drop,
# so the rod never leaves the collar in flight.
REAR_SLIDE_OVERLAP = 0.4
REAR_COLLAR_BOTTOM = 4.6
# Ends inside the cowl underside plate (y 13.23..13.29 on x = 0), the nearest fixed
# body cube above the rear axle.
REAR_COLLAR_TOP = load_tool("scooter_dims").REAR_STEM_TOP


def _rear(result):
    dims = load_tool("scooter_dims")
    atlas = load_tool("scooter_atlas")
    chrome = atlas.faces("chrome")
    z = dims.REAR_AXLE_Z
    rod_top = REAR_COLLAR_BOTTOM + dims.FOLD_DROP + REAR_SLIDE_OVERLAP

    def column(half, bottom, top):
        return kit.box((-half, bottom, z - half), (half, top, z + half), chrome)

    # The wide sleeve stays inside the tyre at rest; the thin stem crosses the open wheel
    # well only in flight, scaled flat against the cowl on the ground.
    result.add("body", [column(REAR_SLEEVE_HALF, REAR_COLLAR_BOTTOM, rod_top)])
    result.add(dims.REAR_STEM_BONE, [column(REAR_STEM_HALF, rod_top, REAR_COLLAR_TOP)])
    result.add(dims.STRUT_BONES["rear"], column(REAR_ROD_HALF, dims.AXLE_Y, rod_top))


def build():
    result = kit.AreaCubes()
    _front(result)
    _rear(result)
    return result
