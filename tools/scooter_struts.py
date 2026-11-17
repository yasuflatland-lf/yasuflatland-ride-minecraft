"""Independent front and rear telescoping strut builders."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

kit = load_tool("scooter_kit")

AREA = "struts"


def _front(result):
    dims = load_tool("scooter_dims")
    atlas = load_tool("scooter_atlas")
    chrome = atlas.faces("chrome")
    y, z = dims.AXLE_Y, dims.FRONT_AXLE_Z
    # The upper spring seat reaches x=0.92 and z=axle+1.088; the collar
    # overlaps it while remaining inside the wheel disc at rest.
    result.add("steer", kit.box((-1.0, y, z - 1.2), (1.0, y + 3.7, z + 1.2), chrome))
    # Leave 0.15 px engaged after the full drop and 0.05 px below the collar top.
    result.add("wheel_front_strut", kit.box((-0.25, y, z - 0.25),
                                             (0.25, y + dims.FOLD_DROP + 0.15, z + 0.25), chrome))


REAR_ROD_HALF = 0.25
REAR_SLEEVE_HALF = 0.5
REAR_STEM_HALF = 0.3
# The rod top clears the collar bottom by REAR_SLIDE_OVERLAP after the fold drop,
# so the rod never leaves the collar in flight.
REAR_SLIDE_OVERLAP = 0.4
REAR_COLLAR_BOTTOM = 4.6
# Highest stem top that leaves the road-pose previews identical to main: measured pixel
# by pixel, a stem to y 9.0 is fully hidden behind the tyre and fender, while a stem to
# y 10.0 already shows through the open wheel well (side, rear and tail lamp previews).
REAR_COLLAR_TOP = 9.0


def _rear(result):
    dims = load_tool("scooter_dims")
    atlas = load_tool("scooter_atlas")
    chrome = atlas.faces("chrome")
    z = dims.REAR_AXLE_Z
    rod_top = REAR_COLLAR_BOTTOM + dims.FOLD_DROP + REAR_SLIDE_OVERLAP

    def column(half, bottom, top):
        return kit.box((-half, bottom, z - half), (half, top, z + half), chrome)

    # The wide sleeve stays inside the tyre at rest, and the thin stem stops where the
    # tyre and fender still hide it, so no strut cube shows in the road pose.
    result.add("body", [column(REAR_SLEEVE_HALF, REAR_COLLAR_BOTTOM, rod_top),
                        column(REAR_STEM_HALF, rod_top, REAR_COLLAR_TOP)])
    result.add(dims.STRUT_BONES["rear"], column(REAR_ROD_HALF, dims.AXLE_Y, rod_top))


def build():
    result = kit.AreaCubes()
    _front(result)
    _rear(result)
    return result
