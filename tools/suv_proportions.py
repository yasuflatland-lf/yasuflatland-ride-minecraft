"""Measure the generated, front-at-minus-z SUV in its unanimated pose (ADR 0170).

Input maps bone names to cube lists. Landmark selection uses shape, not cube order,
UV colors, or generator coordinates; revise it if the body construction changes.
"""

from tool_loader import load_tool

_cube_tilt = load_tool("cube_tilt")

# Pixel landmarks, D used per image and uncertainty are recorded in ADR 0213.
# Rake is in degrees.
TARGETS = {
    name: {"ratio": ratio, "tolerance": 0.05}
    for name, ratio in {
        "wheelbase": 3.16,
        "front_overhang": 0.86,
        "rear_overhang": 0.95,
        "ground_clearance": 0.59,
        "overall_height": 2.13,
        "belt_height": 1.52,
        "side_window_height": 0.545,
        "hood_height": 1.56,
        "hood_length": 1.77,
        "front_bumper_length": 0.29,
        "rear_bumper_length": 0.41,
        "bumper_height": 0.35,
        "overall_length": 4.97,
        "overall_width": 2.21,
        "track_width": 1.87,
        "tyre_width": 0.43,
        "flare_reach": 0.29,
        "flare_top_height": 1.45,
        "hood_scoop_height": 0.07,
        "hood_scoop_length": 0.22,
        "front_bumper_reach": 0.31,
        "step_height": 0.125,
        "step_reach": 0.06,
    }.items()
}
TARGETS["windshield_rake"] = {"degrees": 24, "tolerance": 3}
# Rows start pending; the PR that makes the model meet a row removes it.
# Every 6-10/13 row is complete (ADR 0213).
PENDING: set[str] = set()


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

    Pending rows without a landmark measure as None.
    It deliberately fails if the generator no longer supplies existing landmarks.
    """
    body = cubes_by_bone["body"]
    wheels = [_bounds(cubes_by_bone[name])
              for name in ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr")]
    diameter = sum(hi[1] - lo[1] for lo, hi in wheels) / 4
    ground = min(lo[1] for lo, hi in wheels)
    body_lo, body_hi = _bounds(body)
    lateral_centers = [(lo[0] + hi[0]) / 2 for lo, hi in wheels]
    centers = [(lo[2] + hi[2]) / 2 for lo, hi in wheels]
    front_axle, rear_axle = sum(centers[:2]) / 2, sum(centers[2:]) / 2
    frames = [c for c in body if c.get("rotation", [0, 0, 0])[0] < 0
              and c["rotation"][1:] == [0, 0]]
    frame = max(frames, key=lambda c: c["size"][0])
    epsilon = diameter * 1e-6
    hood_panels = [c for c in body if not any(c.get("rotation", []))
                   and abs(c["origin"][0] + c["size"][0] / 2) <= epsilon
                   and abs(c["origin"][1] + c["size"][1]
                           - frame["pivot"][1]) <= epsilon]
    body_side = max(c["size"][0] for c in hood_panels) / 2
    front_flares = [c for c in body if not any(c.get("rotation", []))
                    and c["origin"][0] >= body_side - epsilon
                    and c["origin"][2] - epsilon <= front_axle
                    <= c["origin"][2] + c["size"][2] + epsilon]
    _, flare_hi = _bounds(front_flares)
    # The target's foot is the outer (front) A-pillar edge extrapolated to the cowl,
    # so follow the frame's tilted front face down to the pivot (hood) height.
    pivot = frame["pivot"]
    matrix = _cube_tilt.cube_matrix(frame["rotation"])
    face = [_cube_tilt._apply(matrix, [0, frame["origin"][1] + h - pivot[1],
                                       frame["origin"][2] - pivot[2]])
            for h in (0, frame["size"][1])]
    foot = pivot[2] + face[0][2] - face[0][1] * (
        (face[1][2] - face[0][2]) / (face[1][1] - face[0][1]))
    eps = diameter * 1e-9
    body_bounds = [(c, *_bounds([c])) for c in body]
    # The windshield leans past its foot; only the scoop slopes wholly ahead of it.
    tops = [c for c, lo, hi in body_bounds
            if c.get("rotation", [0, 0, 0])[0] != 0
            and c["rotation"][1:] == [0, 0]
            and lo[1] >= pivot[1] - eps and hi[2] < foot
            and lo[0] < 0 < hi[0]]
    top_lo, top_hi = _bounds(tops)
    scoop = [c for c, lo, hi in body_bounds
             if lo[1] >= pivot[1] - eps
             and all(lo[i] >= top_lo[i] - eps and hi[i] <= top_hi[i] + eps
                     for i in (0, 2))]
    scoop_lo, scoop_hi = _bounds(scoop)
    scoop_ids = {id(c) for c in scoop}
    center = [(lo + hi) / 2 for lo, hi in zip(scoop_lo, scoop_hi)]
    surface = max(hi[1] for c, lo, hi in body_bounds
                  if id(c) not in scoop_ids
                  and all(lo[i] <= center[i] <= hi[i] for i in (0, 2)))
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
    rails = [c for c in body if c.get("rotation", [0, 0, 0])[:2] == [0, 0]
             and c.get("rotation", [0, 0, 0])[2] != 0
             and c["size"][2] > diameter]
    rail_lo, rail_hi = _bounds(rails)

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
    grille_groups = {}
    for cube in body:
        if any(cube.get("rotation", [])) or _bounds([cube])[1][2] >= front_axle:
            continue
        x, y, z = cube["size"]
        if y > max(x, z):
            size = tuple(float(f"{v / diameter:.6g}") for v in cube["size"])
            grille_groups.setdefault(size, []).append(cube)
    candidates = [group for group in grille_groups.values() if len(group) >= 8]
    if not candidates:
        raise ValueError("SUV grille landmark requires at least 8 identical upright bars ahead of the front axle")
    grille = max(candidates, key=len)
    grille_front = min(_bounds([cube])[0][2] for cube in grille)
    # Bumper tips exclude the spare, exhaust, tow hooks and lamp lenses.
    values = {
        "overall_length": rear_hi[2] - front_lo[2],
        "overall_width": 2 * max(abs(body_lo[0]), abs(body_hi[0])),
        "flare_reach": flare_hi[0] - body_side,
        "flare_top_height": flare_hi[1] - ground,
        "track_width": (abs(lateral_centers[0] - lateral_centers[1])
                        + abs(lateral_centers[2] - lateral_centers[3])) / 2,
        "tyre_width": sum(hi[0] - lo[0] for lo, hi in wheels) / len(wheels),
        "wheelbase": rear_axle - front_axle,
        "front_overhang": front_axle - front_lo[2],
        "rear_overhang": rear_hi[2] - rear_axle,
        "ground_clearance": rail_lo[1] - ground,
        "step_height": rail_hi[1] - rail_lo[1],
        "step_reach": max(abs(rail_lo[0]), abs(rail_hi[0])) - roof["size"][0] / 2,
        "overall_height": body_hi[1] - ground,
        "belt_height": window_lo[1] - ground,
        "side_window_height": window_hi[1] - window_lo[1],
        "hood_height": frame["pivot"][1] - ground,
        "hood_length": foot - front_lo[2],
        "hood_scoop_height": scoop_hi[1] - surface,
        "hood_scoop_length": scoop_hi[2] - scoop_lo[2],
        "front_bumper_length": front_hi[2] - front_lo[2],
        "front_bumper_reach": grille_front - front_lo[2],
        "rear_bumper_length": rear_hi[2] - rear_lo[2],
        "bumper_height": max(front_hi[1] - front_lo[1], rear_hi[1] - rear_lo[1]),
    }
    result = {name: {"pixels": value, "ratio": value / diameter}
              for name, value in values.items()}
    result["windshield_rake"] = {"degrees": abs(frame["rotation"][0])}
    for name in TARGETS:
        if name in PENDING and name not in result:
            result[name] = None
    return result
