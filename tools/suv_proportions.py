"""Measure the generated, front-at-minus-z SUV in its unanimated pose (ADR 0170).

Input maps bone names to cube lists. Landmark selection uses shape, not cube order,
UV colors, or generator coordinates; revise it if the body construction changes.
"""

from tool_loader import load_tool

_cube_tilt = load_tool("cube_tilt")

# Pixel landmarks and uncertainty are recorded in ADR 0170. Rake is in degrees.
_REFERENCE_D = 138
TARGETS = {
    name: {"ratio": pixels / _REFERENCE_D, "tolerance": 0.05}
    for name, pixels in {
        "wheelbase": 489,
        "front_overhang": 96,
        "rear_overhang": 126,
        "ground_clearance": 79,
        "overall_height": 303,
        "belt_height": 211,
        "side_window_height": 74,
        "hood_height": 217,
        "hood_length": 249,
        "front_bumper_length": 45,
        "rear_bumper_length": 58,
        "bumper_height": 51,
    }.items()
}
TARGETS["windshield_rake"] = {"degrees": 34.34609740006154, "tolerance": 3}
PENDING = set(TARGETS) - {"wheelbase", "front_overhang", "rear_overhang", "ground_clearance"}


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
    """Return linear rows as {pixels, ratio}; rake as {degrees} (not a length).

    It deliberately fails if the generator no longer supplies these landmarks.
    """
    body = cubes_by_bone["body"]
    wheels = [_bounds(cubes_by_bone[name])
              for name in ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr")]
    diameter = sum(hi[1] - lo[1] for lo, hi in wheels) / 4
    ground = min(lo[1] for lo, hi in wheels)
    centers = [(lo[2] + hi[2]) / 2 for lo, hi in wheels]
    front_axle, rear_axle = sum(centers[:2]) / 2, sum(centers[2:]) / 2
    frames = [c for c in body if c.get("rotation", [0, 0, 0])[0] < 0
              and c["rotation"][1:] == [0, 0]]
    frame = max(frames, key=lambda c: c["size"][0])
    # The target's foot is the outer (front) A-pillar edge extrapolated to the cowl,
    # so follow the frame's tilted front face down to the pivot (hood) height.
    pivot = frame["pivot"]
    matrix = _cube_tilt.cube_matrix(frame["rotation"])
    face = [_cube_tilt._apply(matrix, [0, frame["origin"][1] + h - pivot[1],
                                       frame["origin"][2] - pivot[2]])
            for h in (0, frame["size"][1])]
    foot = pivot[2] + face[0][2] - face[0][1] * (
        (face[1][2] - face[0][2]) / (face[1][1] - face[0][1]))
    roofs = [c for c in body if not any(c.get("rotation", []))
             and c["origin"][1] > frame["pivot"][1]
             and c["size"][1] < min(c["size"][0], c["size"][2])]
    roof = max(roofs, key=lambda c: c["size"][0] * c["size"][2])
    # The sealed rear door pane fills the open window exactly, without frame thickness.
    panes = [c for c in cubes_by_bone["windows_sealed"]
             if not any(c.get("rotation", [])) and c["size"][1] > diameter / 4
             and c["size"][0] < diameter / 4]
    pane = max(panes, key=lambda c: c["size"][1] * c["size"][2])
    window_lo, window_hi = _bounds([pane])
    steps = [c for c in body if abs(c["origin"][0]) >= roof["size"][0] / 2
             and c["size"][0] < diameter / 2
             and c["size"][2] > diameter and c["size"][1] < diameter / 4
             and c["origin"][1] < window_lo[1] / 2]
    sill = _bounds(steps)[0][1]

    def bumper(front):
        def beyond(c):
            lo, hi = _bounds([c])
            return hi[2] < front_axle if front else lo[2] > rear_axle
        slabs = [c for c in body if c["size"][0] > diameter
                 and diameter / 6 < c["size"][2] < diameter and beyond(c)
                 and _bounds([c])[1][1] < ground + diameter]
        bands = {(c["origin"][1], c["size"][1]) for c in slabs}
        return _bounds([c for c in body if beyond(c)
                        and (c["origin"][1], c["size"][1]) in bands])

    front_lo, front_hi = bumper(True)
    rear_lo, rear_hi = bumper(False)
    # Bumper tips exclude the spare, exhaust, tow hooks and lamp lenses.
    values = {
        "wheelbase": rear_axle - front_axle,
        "front_overhang": front_axle - front_lo[2],
        "rear_overhang": rear_hi[2] - rear_axle,
        "ground_clearance": sill - ground,
        "overall_height": _bounds(body)[1][1] - ground,
        "belt_height": window_lo[1] - ground,
        "side_window_height": window_hi[1] - window_lo[1],
        "hood_height": frame["pivot"][1] - ground,
        "hood_length": foot - front_lo[2],
        "front_bumper_length": front_hi[2] - front_lo[2],
        "rear_bumper_length": rear_hi[2] - rear_lo[2],
        "bumper_height": max(front_hi[1] - front_lo[1], rear_hi[1] - rear_lo[1]),
    }
    result = {name: {"pixels": value, "ratio": value / diameter}
              for name, value in values.items()}
    result["windshield_rake"] = {"degrees": abs(frame["rotation"][0])}
    return result
