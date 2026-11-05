"""Measure the generated, front-at-minus-z SUV in its unanimated pose (ADR 0170, 0214).

Input maps bone names to cube lists. Landmark selection uses shape, not cube order,
UV colors, or generator coordinates; revise it if the body construction changes.
"""

from tool_loader import load_tool

_cube_tilt = load_tool("cube_tilt")

# Targets in tyre diameters D, measured on the Rubicon body of ADR 0214 and checked against the photo
# estimates of docs/specs/suv-body.md (wheelbase 2.95 to 3.10, roof 2.00 to 2.10, hood 1.43 to 1.50,
# rake 34 to 38 degrees). Rake is in degrees.
TARGETS = {
    name: {"ratio": ratio, "tolerance": 0.05}
    for name, ratio in {
        "wheelbase": 3.007,
        "front_overhang": 0.974,
        "rear_overhang": 0.722,
        "ground_clearance": 0.679,
        "overall_height": 2.064,
        "belt_height": 1.495,
        "side_window_height": 0.460,
        "hood_height": 1.461,
        "hood_length": 1.748,
        "front_bumper_length": 0.287,
        "rear_bumper_length": 0.316,
        "bumper_height": 0.241,
    }.items()
}
TARGETS["windshield_rake"] = {"degrees": 35.78, "tolerance": 3}
# Every row meets its target; a row added later starts here until the model meets it.
PENDING = set()


def _corners(cube):
    pivot = cube.get("pivot", [0, 0, 0])
    matrix = _cube_tilt.cube_matrix(cube.get("rotation", [0, 0, 0]))
    points = []
    for n in range(8):
        offset = [cube["origin"][i] + cube["size"][i] * ((n >> i) & 1) - pivot[i]
                  for i in range(3)]
        turned = _cube_tilt.apply_matrix(matrix, offset)
        points.append([pivot[i] + turned[i] for i in range(3)])
    return points


def _bounds(cubes):
    points = [p for cube in cubes for p in _corners(cube)]
    if not points:
        raise ValueError("SUV measurement requires nonempty body and road wheel bones")
    return ([min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)])


def _only_x_turn(cube):
    rotation = cube.get("rotation", [0, 0, 0])
    return rotation[1] == 0 and rotation[2] == 0


def measure(cubes_by_bone):
    """Return linear rows as {pixels, ratio}; rake as {degrees} (not a length).

    It deliberately fails if the generator no longer supplies these landmarks. Landmarks follow the
    Rubicon body of ADR 0214: the windshield frame's two wide rails, the rock rails, the low bumper
    cubes beyond each axle, and the largest flat side-window plate of `windows_sealed`.
    """
    body = cubes_by_bone["body"]
    wheels = [_bounds(cubes_by_bone[name])
              for name in ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr")]
    diameter = sum(hi[1] - lo[1] for lo, hi in wheels) / 4
    ground = min(lo[1] for lo, hi in wheels)
    centers = [(lo[2] + hi[2]) / 2 for lo, hi in wheels]
    front_axle, rear_axle = sum(centers[:2]) / 2, sum(centers[2:]) / 2
    # The windshield frame is a plane leaning back 30 to 40 degrees; its two rails are wider than a tyre.
    rails = [c for c in body if _only_x_turn(c) and -40 < c.get("rotation", [0, 0, 0])[0] < -30
             and c["size"][0] > diameter]
    if len(rails) != 2:
        raise ValueError("SUV measurement needs the windshield frame's two rails")
    foot_rail = min(rails, key=lambda c: _bounds([c])[0][1])
    corners = _corners(foot_rail)
    foot = min(corners, key=lambda p: (p[1], p[2]))
    # The rock rails are long, thin bars under the doors, away from the centre line.
    rock_rails = [c for c in body if not any(c.get("rotation", []))
                  and c["size"][2] > diameter and c["size"][0] < diameter / 4 and c["size"][1] < diameter / 4
                  and abs(c["origin"][0] + c["size"][0] / 2) > diameter * 0.7]
    sill = _bounds(rock_rails)[0][1]
    # The sealed side plates fill the window openings exactly, without frame thickness.
    panes = [c for c in cubes_by_bone["windows_sealed"]
             if not any(c.get("rotation", [])) and c["size"][1] > diameter / 4
             and c["size"][0] < diameter / 4]
    pane = max(panes, key=lambda c: c["size"][1] * c["size"][2])
    window_lo, window_hi = _bounds([pane])

    def bumper(front):
        # The bumper is the cubes between 0.55 and 0.95 D high entirely beyond 0.4 D past an axle, which leaves
        # out the axles' links and shock absorbers and the exhaust tips. The spare's tyre blocks turn about z.
        def beyond(c):
            lo, hi = _bounds([c])
            past = (hi[2] < front_axle - 0.4 * diameter) if front else (lo[2] > rear_axle + 0.4 * diameter)
            return past and ground + 0.55 * diameter < lo[1] and hi[1] < ground + 0.95 * diameter
        return _bounds([c for c in body if beyond(c) and c.get("rotation", [0, 0, 0])[2] == 0])

    front_lo, front_hi = bumper(True)
    rear_lo, rear_hi = bumper(False)
    values = {
        "wheelbase": rear_axle - front_axle,
        "front_overhang": front_axle - front_lo[2],
        "rear_overhang": rear_hi[2] - rear_axle,
        "ground_clearance": sill - ground,
        "overall_height": _bounds(body)[1][1] - ground,
        "belt_height": window_lo[1] - ground,
        "side_window_height": window_hi[1] - window_lo[1],
        "hood_height": foot[1] - ground,
        "hood_length": foot[2] - front_lo[2],
        "front_bumper_length": front_hi[2] - front_lo[2],
        "rear_bumper_length": rear_hi[2] - rear_lo[2],
        "bumper_height": max(front_hi[1] - front_lo[1], rear_hi[1] - rear_lo[1]),
    }
    result = {name: {"pixels": value, "ratio": value / diameter}
              for name, value in values.items()}
    result["windshield_rake"] = {"degrees": abs(foot_rail["rotation"][0])}
    return result
