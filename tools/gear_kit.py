"""Pure, deterministic camping gear geometry under ADR 0247's Rotation rule.

UV faces are supplied by the caller; this module neither paints nor writes assets.
"""
import copy
import math

import panels
import cube_tilt

COMPOUND_TILTS = True
ALPHA_CUT_PLATES = True
STEP = 0.5
MIN_SIDES = 8
MAX_SIDES = 32
DEFAULT_EXPONENT = 2.4
DEFAULT_CORNER_SEGMENTS = 2
MAX_PANEL_OVERLAP = 0.16
WIDTH_OVERLAP_FACTOR = 0.4
HEIGHT_OVERLAP_FACTOR = 0.6
STRIP_OVERLAP = 0.01
STEP_VERTICAL_OVERLAP = 0.01
MIN_STRIP_WIDTH = 0.05
TUBE_OVERLAP_FACTOR = 0.6
EPSILON = 1e-9
ROUNDING_MARGIN = 0.0002
# A leaning wall's inward thickness and end overlap can extend its y bounds.
LOFT_Y_OVERLAP = MAX_PANEL_OVERLAP / 2


def _positive(*values):
    if any(not math.isfinite(v) or v <= 0 for v in values):
        raise ValueError("sizes must be finite and positive")


def _points(points, dimensions):
    if any(len(p) != dimensions or not all(math.isfinite(v) for v in p) for p in points):
        raise ValueError("points must have finite coordinates of the required dimension")


def _outline(s):
    _positive(s["a"], s["zb"] - s["zf"])
    if not all(math.isfinite(s.get(key, 0)) for key in ("xc", "zf", "zb")):
        raise ValueError("outline coordinates must be finite")
    if "r" in s:
        _positive(s["r"])
        if s["r"] > min(s["a"], (s["zb"] - s["zf"]) / 2):
            raise ValueError("corner radius exceeds outline")
        k = s.get("k", DEFAULT_CORNER_SEGMENTS)
        if not isinstance(k, int) or k < 1:
            raise ValueError("corner segments must be a positive integer")
    else:
        _positive(s.get("nf", DEFAULT_EXPONENT), s.get("nb", DEFAULT_EXPONENT))


def outline_points(outline, n=16):
    """Sample the spike's counterclockwise ringPts in the x-z plane."""
    s = outline
    _outline(s)
    if not isinstance(n, int) or n < 3:
        raise ValueError("outline needs at least three samples")
    xc = s.get("xc", 0)
    points = []
    if "r" in s:
        r, k = s["r"], s.get("k", DEFAULT_CORNER_SEGMENTS)
        cx = s["a"] - r
        for x, z, start in ((cx, s["zb"]-r, 0), (-cx, s["zb"]-r, 90),
                            (-cx, s["zf"]+r, 180), (cx, s["zf"]+r, 270)):
            for i in range(k+1):
                t = math.radians(start + 90*i/k)
                points.append((panels.r4(xc+x+r*math.cos(t)), panels.r4(z+r*math.sin(t))))
    else:
        zc, hz = (s["zf"]+s["zb"])/2, (s["zb"]-s["zf"])/2
        for i in range(n):
            c, sn = math.cos(math.tau*i/n), math.sin(math.tau*i/n)
            exponent = s.get("nf" if sn < 0 else "nb", DEFAULT_EXPONENT)
            points.append((panels.r4(xc+s["a"]*math.copysign(abs(c)**(2/exponent), c)),
                           panels.r4(zc+hz*math.copysign(abs(sn)**(2/exponent), sn))))
    return points


def width_at(outline, z):
    """Half width at z, measured from the outline's own xc."""
    s = outline
    _outline(s)
    if z < s["zf"] or z > s["zb"]:
        return 0
    if "r" in s:
        dz = max(s["zf"]+s["r"]-z, z-(s["zb"]-s["r"]), 0)
        return panels.r4(s["a"]-s["r"]+math.sqrt(max(0, s["r"]**2-dz**2)))
    t = (z-(s["zf"]+s["zb"])/2)/((s["zb"]-s["zf"])/2)
    exponent = s.get("nf" if t < 0 else "nb", DEFAULT_EXPONENT)
    return panels.r4(s["a"]*max(0, 1-abs(t)**exponent)**(1/exponent))


def assert_rule(cubes):
    """Reject roll and rotations beyond the active ADR 0247 axis limit."""
    for cube in cubes:
        rotation = cube.get("rotation", [0, 0, 0])
        if (len(rotation) != 3 or not all(math.isfinite(v) for v in rotation)
                or rotation[2] != 0 or sum(v != 0 for v in rotation) > (2 if COMPOUND_TILTS else 1)):
            raise ValueError("gear rotation violates ADR 0247")


def _finish(cubes, assembly=None, assemblies=None):
    assert_rule(cubes)
    if cube_tilt.compound_cubes(cubes) and (assemblies is None or assembly not in assemblies):
        raise ValueError("compound gear cubes require a registered assembly (ADR 0247, 0167)")
    return cubes


def _box(center, size, face, rotation=None, depth_offset=0):
    origin = [center[i]-size[i]/2 for i in range(3)]
    origin[2] += depth_offset
    cube = panels.panel(*origin, *[origin[i]+size[i] for i in range(3)], face,
                        center, rotation)
    for key in ("origin", "size", "pivot", "rotation"):
        if key in cube:
            cube[key] = [panels.r4(v) for v in cube[key]]
    cube["uv"] = {side: copy.deepcopy(face) for side in panels.CUBE_SIDES}
    return cube


def ring(sides, apothem, y0, y1, face, thickness=0.5, center=(0, 0)):
    _positive(apothem, thickness, y1-y0)
    _points([center], 2)
    if not isinstance(sides, int) or not MIN_SIDES <= sides <= MAX_SIDES or apothem <= thickness:
        raise ValueError("ring needs 8..32 sides and apothem > thickness")
    cubes = copy.deepcopy(panels.panel_ring(apothem, y0, y1, face, sides, thickness, center))
    for cube in cubes:
        cube["uv"] = {side: copy.deepcopy(face) for side in panels.CUBE_SIDES}
        for key in ("origin", "size", "pivot", "rotation"):
            cube[key] = [panels.r4(v) for v in cube[key]]
    return _finish(cubes)


def _sub(a, b):
    return [x-y for x, y in zip(a, b)]


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _length(v):
    return math.sqrt(_dot(v, v))


def _wall(a0, a1, b0, b1, face, thickness, center, inward, hidden=()):
    u = [(a1[i]-a0[i]+b1[i]-b0[i])/2 for i in range(3)]
    v = [(b0[i]-a0[i]+b1[i]-a1[i])/2 for i in range(3)]
    c = [(a0[i]+a1[i]+b0[i]+b1[i])/4 for i in range(3)]
    width = _length(u)
    if width < EPSILON:
        raise ValueError("loft has a degenerate edge")
    ex = [x/width for x in u]
    vp = [v[i]-ex[i]*_dot(v, ex) for i in range(3)]
    height = _length(vp)
    ey = [x/height for x in vp]
    ez = [ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0]]
    out = [c[0]-center[0], 0, c[2]-center[1]]
    if (_dot(ez, out) < 0) != inward:
        ey = [-x for x in ey]
        ez = [-x for x in ez]
    # A box is unchanged by reversing both in-plane axes; keep vertical walls yaw-only.
    if ey[1] < 0:
        ex = [-x for x in ex]
        ey = [-x for x in ey]
    yaw = math.degrees(math.atan2(-ex[2], ex[0]))
    lean = math.degrees(math.atan2(ez[1], ey[1]))
    # The spike sizes a panel by its average edge, which leaves the wide end's corners of a tapered
    # band uncovered (an 8-sided loft from radius 2 to 3 opens a gap at each top corner). Spanning
    # every corner of the band closes it at the cost of a slight overlap at the narrow end.
    corners = [_sub(p, c) for p in (a0, a1, b0, b1)]
    span = [2*max(abs(_dot(p, axis)) for p in corners) for axis in (ex, ey)]
    # A stepped wall also spans, along its edge, the step end it does not show.
    span[0] = max([span[0]] + [2*abs(_dot(_sub(p, c), ex)) for p in hidden])
    size = [span[0]+min(MAX_PANEL_OVERLAP, thickness*WIDTH_OVERLAP_FACTOR),
            span[1]+min(MAX_PANEL_OVERLAP, thickness*HEIGHT_OVERLAP_FACTOR), thickness]
    return _box(c, size, face, [lean, yaw, 0], -thickness/2)


def _step_outline(a, b, t0, t1, inward):
    """One vertical step's outline: each vertex taken from the step end on the visible side.

    Sampling the middle of the step would leave a changing outline's ring vertices outside the
    step's panels (a radius 2 to 3 loft would reach only x 2.92), so an outward wall uses the outer
    end and an inward wall the inner end; the wall thickness covers the other end while each step
    changes the outline by less than the thickness. Returns the shown and the hidden outline."""
    ends = [[[p[i]*(1-t)+q[i]*t for i in range(2)] for p, q in zip(a, b)] for t in (t0, t1)]
    middle = [[(u[i]+v[i])/2 for i in range(2)] for u, v in zip(*ends)]
    center = [sum(p[i] for p in middle)/len(middle) for i in range(2)]
    reach = [[_length(_sub(p, center)) for p in end] for end in ends]
    picks = [1 if (reach[1][j] > reach[0][j]) != inward else 0 for j in range(len(middle))]
    return ([ends[k][j] for j, k in enumerate(picks)], [ends[1-k][j] for j, k in enumerate(picks)])


def loft(rings, face, sides=16, thickness=0.4, inward=False, *, assembly=None, assemblies=None):
    """Loft y bounds may extend by thickness + LOFT_Y_OVERLAP at either end."""
    _positive(thickness)
    if len(rings) < 2 or any(b[0] <= a[0] for a, b in zip(rings, rings[1:])):
        raise ValueError("loft needs at least two strictly increasing rings")
    sampled = [(y, outline_points(s, sides)) for y, s in rings]
    count = len(sampled[0][1])
    if any(len(p) != count for _, p in sampled):
        raise ValueError("loft rings must have matching sample counts")
    cubes = []
    for (y0, a), (y1, b) in zip(sampled, sampled[1:]):
        steps = 1 if COMPOUND_TILTS else math.ceil((y1-y0)/STEP)
        for step in range(steps):
            lo, hi = y0+(y1-y0)*step/steps, y0+(y1-y0)*(step+1)/steps
            if COMPOUND_TILTS:
                aa, bb, hidden = a, b, None
            else:
                aa, hidden = _step_outline(a, b, step/steps, (step+1)/steps, inward)
                bb = aa
            center = [sum(p[i] for p in aa)/count for i in range(2)]
            for j in range(count):
                nxt = (j+1) % count
                points = [[p[0], y, p[1]] for p, y in ((aa[j], lo), (aa[nxt], lo), (bb[j], hi), (bb[nxt], hi))]
                if _length(_sub(points[1], points[0])) < EPSILON and _length(_sub(points[3], points[2])) < EPSILON:
                    continue
                extra = () if hidden is None else [[p[0], lo, p[1]] for p in (hidden[j], hidden[nxt])]
                cube = _wall(*points, face, thickness, center, inward, extra)
                if not COMPOUND_TILTS:
                    # Clamp the overlap at the ends of the loft.
                    bottom = max(rings[0][0], lo-STEP_VERTICAL_OVERLAP/2)
                    top = min(rings[-1][0], hi+STEP_VERTICAL_OVERLAP/2)
                    cube["origin"][1] = panels.r4(bottom)
                    cube["size"][1] = panels.r4(top-bottom)
                cubes.append(cube)
    return _finish(cubes, assembly, assemblies)


def _union(intervals):
    merged = []
    for lo, hi in sorted(intervals):
        if merged and lo <= merged[-1][1]+EPSILON:
            merged[-1][1] = max(hi, merged[-1][1])
        else:
            merged.append([lo, hi])
    return merged


def extrude(polygon, depth, face, z=0.0, step=STEP):
    """Conservative horizontal slabs; vertex cuts retain concave openings."""
    _positive(depth, step)
    _points(polygon, 2)
    if len(polygon) < 3 or abs(sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(polygon, polygon[1:]+polygon[:1]))) < EPSILON:
        raise ValueError("extrusion needs a nondegenerate polygon")
    levels = sorted(set(p[1] for p in polygon))
    cuts = [levels[0]]
    for lo, hi in zip(levels, levels[1:]):
        count = math.ceil((hi-lo)/step)
        cuts.extend(lo+(hi-lo)*i/count for i in range(1, count+1))
    cubes = []
    for lo, hi in zip(cuts, cuts[1:]):
        # Evaluate vertex limits from inside the band so a shared vertex is not counted twice.
        mid = (lo+hi)/2
        active = [(a, b) for a, b in zip(polygon, polygon[1:]+polygon[:1]) if min(a[1], b[1]) < mid < max(a[1], b[1])]
        samples = []
        for y in (lo, mid, hi):
            hits = sorted(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]) for a, b in active)
            samples.append(list(zip(hits[::2], hits[1::2])))
        # Within a vertex-free band each boundary is linear. Its swept interval
        # must include the space between samples, even for a narrow diagonal.
        intervals = [(min(p[0] for p in group), max(p[1] for p in group))
                     for group in zip(*samples)]
        for left, right in _union(intervals):
            if right > left:
                cubes.append(_box([(left+right)/2, mid, z], [right-left, hi-lo, depth], face))
    return _finish(cubes)


def plate(outline, y0, y1, face, hole=None, strips=12):
    _outline(outline)
    _positive(y1-y0)
    if hole is not None:
        _outline(hole)
    if not isinstance(strips, int) or strips < 1:
        raise ValueError("strips must be a positive integer")
    s = outline
    xc, zc, hz = s.get("xc", 0), (s["zf"]+s["zb"])/2, (s["zb"]-s["zf"])/2
    if ALPHA_CUT_PLATES:
        return _finish([_box([xc, (y0+y1)/2, zc], [2*s["a"], y1-y0, 2*hz], face)])
    cubes = []
    cuts = [zc-hz*math.cos(math.pi*i/strips) for i in range(strips+1)]
    for start, end in zip(cuts, cuts[1:]):
        lo, hi = max(s["zf"], start-STRIP_OVERLAP), min(s["zb"], end+STRIP_OVERLAP)
        lo, hi = panels.r4(lo), panels.r4(hi)
        # No rim inset: only guard the final coordinate rounding.
        width = min(width_at(s, t) for t in (lo, (lo+hi)/2, hi))-ROUNDING_MARGIN
        intervals = [(xc-width, xc+width)]
        if hole is not None and hi >= hole["zf"] and lo <= hole["zb"]:
            h0, h1 = max(lo, hole["zf"]), min(hi, hole["zb"])
            samples = [h0, h1, (h0+h1)/2, max(h0, min(h1, (hole["zf"]+hole["zb"])/2))]
            hw = max(width_at(hole, t) for t in samples)+ROUNDING_MARGIN
            hx = hole.get("xc", 0)
            intervals = [(xc-width, min(xc+width, hx-hw)), (max(xc-width, hx+hw), xc+width)]
        for left, right in intervals:
            if right-left >= MIN_STRIP_WIDTH:
                cubes.append(_box([(left+right)/2, (y0+y1)/2, (lo+hi)/2], [right-left, y1-y0, hi-lo], face))
    return _finish(cubes)


def tube(points, size, face, *, assembly=None, assemblies=None):
    _positive(size)
    _points(points, 3)
    if len(points) < 2:
        raise ValueError("tube needs at least two points")
    cubes = []
    for a, b in zip(points, points[1:]):
        d = _sub(b, a)
        length = _length(d)
        if length < EPSILON:
            raise ValueError("tube has a zero-length segment")
        c = [(x+y)/2 for x, y in zip(a, b)]
        horizontal = math.hypot(d[0], d[2])
        overlap = size*TUBE_OVERLAP_FACTOR
        if horizontal < EPSILON:
            cubes.append(_box(c, [size, length+overlap, size], face))
        elif abs(d[1]) < EPSILON and abs(d[2]) < EPSILON:
            cubes.append(_box(c, [length+overlap, size, size], face))
        elif abs(d[1]) < EPSILON and abs(d[0]) < EPSILON:
            cubes.append(_box(c, [size, size, length+overlap], face))
        elif COMPOUND_TILTS or abs(d[1]) < EPSILON:
            pitch = math.degrees(math.atan2(d[1], horizontal))
            yaw = math.degrees(math.atan2(d[0], d[2]))
            cubes.append(_box(c, [size, size, length+overlap], face, [pitch, yaw, 0]))
        else:
            steps = math.ceil(abs(d[1])/STEP)
            yaw = math.degrees(math.atan2(d[0], d[2]))
            for k in range(steps):
                midpoint = [a[i]+d[i]*(k+0.5)/steps for i in range(3)]
                cubes.append(_box(midpoint, [size, size+abs(d[1])/steps, horizontal/steps+overlap], face, [0, yaw, 0]))
    return _finish(cubes, assembly, assemblies)
