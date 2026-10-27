"""Measure the generated, front-at-minus-z SUV in its unanimated pose (ADR 0170).

Input maps bone names to cube lists. Landmark selection uses shape, not cube order,
UV colors, or generator coordinates; revise it if the body construction changes.
"""

from tool_loader import load_tool

_cube_tilt = load_tool("cube_tilt")

TARGETS = {
    "greenhouse_length": {"ratio": 0.645, "tolerance": 0.01},
    "greenhouse_height": {"ratio": 0.172, "tolerance": 0.01},
    "greenhouse_rear_gap": {"ratio": 0.035, "tolerance": 0.01},
    "windshield_front_gap": {"ratio": 0.320, "tolerance": 0.01},
    "belt_height": {"ratio": 0.263, "tolerance": 0.01},
    "wheel_diameter": {"ratio": 0.174, "tolerance": 0.01},
}


def _bounds(cubes):
    points = []
    for cube in cubes:
        pivot = cube.get("pivot", [0, 0, 0])
        matrix = _cube_tilt.cube_matrix(cube.get("rotation", [0, 0, 0]))
        for n in range(8):
            offset = [cube["origin"][i] + cube["size"][i] * ((n >> i) & 1) - pivot[i]
                      for i in range(3)]
            turned = _cube_tilt._apply(matrix, offset)
            points.append([pivot[i] + turned[i] for i in range(3)])
    if not points:
        raise ValueError("SUV measurement requires nonempty body and road wheel bones")
    return ([min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)])


def measure(cubes_by_bone):
    """Return six ratios to overall z length, including bumpers and rear spare.

    The widest negative-x-only turned body cube is the windshield lower frame.
    Its pivot marks the belt height; its rotated front bound marks the foot.
    The largest horizontal plate above the belt is the roof; its rear bound
    marks the greenhouse rear. Roof ribs count toward overall roof height.
    Road wheel diameter is the mean vertical bound span of the four wheels.
    """
    body = cubes_by_bone["body"]
    frames = [c for c in body if c.get("rotation", [0, 0, 0])[0] < 0
              and c["rotation"][1:] == [0, 0]]
    if not frames:
        raise ValueError("SUV measurement requires a leaning windshield frame")
    frame = max(frames, key=lambda c: c["size"][0])
    belt = frame["pivot"][1]
    roofs = [c for c in body if not any(c.get("rotation", []))
             and c["origin"][1] > belt
             and c["size"][1] < min(c["size"][0], c["size"][2])]
    if not roofs:
        raise ValueError("SUV measurement requires a roof plate above the belt")
    roof = max(roofs, key=lambda c: c["size"][0] * c["size"][2])
    wheels = [_bounds(cubes_by_bone[name])
              for name in ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr")]
    lo, hi = _bounds(body)
    length = hi[2] - lo[2]
    if length <= 0:
        raise ValueError("SUV measurement requires positive overall length")
    foot = _bounds([frame])[0][2]
    rear = _bounds([roof])[1][2]
    ground = min(low[1] for low, _ in wheels)
    return {
        "greenhouse_length": (rear - foot) / length,
        "greenhouse_height": (hi[1] - belt) / length,
        "greenhouse_rear_gap": (hi[2] - rear) / length,
        "windshield_front_gap": (foot - lo[2]) / length,
        "belt_height": (belt - ground) / length,
        "wheel_diameter": sum(high[1] - low[1] for low, high in wheels) / (4 * length),
    }
