"""Wheel-local hover discs on the side that faces down after the game fold."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

dims = load_tool("scooter_dims")
kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
tilt = load_tool("cube_tilt")


def build():
    wheels = load_tool("scooter_running").build()
    result = kit.AreaCubes()
    half = dims.TYRE_RADIUS / math.sqrt(2)
    for side, z in (("front", dims.FRONT_AXLE_Z), ("rear", dims.REAR_AXLE_Z)):
        outer = tilt.bounds(wheels["wheel_" + side])[0][0] - dims.GLOW_GAP
        for i in range(dims.GLOW_SEGMENTS):
            cube = kit.box((outer - dims.GLOW_DEPTH, dims.AXLE_Y - half, z - half),
                           (outer, dims.AXLE_Y + half, z + half), atlas.faces("glow"))
            cube.update(pivot=[0, dims.AXLE_Y, z], rotation=[i * 90 / dims.GLOW_SEGMENTS, 0, 0])
            result.add("glow_" + side, cube)
    return result
