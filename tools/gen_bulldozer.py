"""Generate the bulldozer geometry, 16 yellow-part paint textures, the item icons of the bulldozer and the blade switch,
and the cab monitor geometry, atlas, and render controller (ADR 0139).

Shaped after the owner's three-view drawing and cab photos of a mid-size crawler dozer, with no
maker name, model name, or logo. The photos show the wide-track (LGP) machine, so the shapes are
traced from them and stretched to the dry-ground spec: 5.0 m long, 2.49 m wide, 3.085 m tall,
a 3.272 m by 1.261 m blade, 600 mm shoes on a 1.89 m gauge. A creeper (1.7 blocks) stands for
1.8 m, so 1 m is 0.944 blocks or 15.1 px.
Units are pixels (16 per block) with the front at -z. Build with +x on the right; mirror_x turns
it into Bedrock's frame just before writing.
Run: python3 -I tools/gen_bulldozer.py packs/yasu_ride_rp [--check]
--check writes nothing and exits 1 listing every stale output.
"""

import json
import math
import struct
import sys
import zlib
from pathlib import Path

CHECK = "--check" in sys.argv[2:]
STALE = []


def emit(path, data):
    if CHECK:
        try:
            matches = (json.loads(path.read_text()) == json.loads(data)
                       if path.suffix == ".json" else path.read_bytes() == data)
        except (OSError, ValueError):
            matches = False
        if not matches:
            STALE.append(str(path))
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, bytes):
            path.write_bytes(data)
        else:
            path.write_text(data)


RP = Path(sys.argv[1])
MODELS = RP / "models/entity/yasu_ride"
ENTITY_TEXTURES = RP / "textures/entity/yasu_ride"
ITEM_TEXTURES = RP / "textures/items/yasu_ride"

PALETTE = {
    "yellow": (236, 178, 22, 255),
    "yellow_dark": (204, 150, 14, 255),
    "louver": (168, 120, 10, 255),
    "yellow_light": (246, 204, 70, 255),
    "black": (24, 24, 26, 255),
    "frame": (38, 38, 40, 255),
    "under": (30, 28, 24, 255),
    "shoe": (66, 62, 54, 255),
    "grouser": (92, 88, 78, 255),
    "link": (120, 116, 104, 255),
    "steel": (158, 158, 152, 255),
    "bolt": (60, 60, 58, 255),
    "chrome": (214, 216, 218, 255),
    "rubber": (20, 20, 20, 255),
    # Lamp lenses: alpha 0, so the emissive material lights them fully while the headlights are on
    # and the plain entity material, which ignores alpha, shows them unlit (ADR 0020).
    "lens": (236, 236, 218, 0),
    "red": (196, 28, 28, 255),
    "amber": (240, 140, 30, 0),
    "orange": (238, 150, 34, 255),
    "hole": (78, 52, 12, 255),
    "seat": (44, 46, 50, 255),
    "seat_fabric": (78, 82, 90, 255),
    "interior": (92, 94, 98, 255),
    "interior_dark": (58, 60, 64, 255),
    "liner": (156, 156, 152, 255),
    "headliner": (170, 164, 150, 255),  # the warm gray felt of the owner's cab photos
    "screen": (52, 92, 112, 255),
    "screen_bright": (120, 176, 196, 255),
    "button": (230, 190, 40, 255),
    "belt": (236, 96, 32, 255),
    "bronze": (184, 128, 62, 255),
    "cord": (214, 200, 150, 255),
    "glass": (120, 164, 174, 96),
}
SLOTS = list(PALETTE)

# Overall extents (spec, converted at 15.1 px per meter)
LENGTH_HALF = 37.8  # 5000 mm with the blade
TRACK_IN, TRACK_OUT = 9.8, 18.8  # 1890 mm gauge, 600 mm shoes, 2490 mm overall
BLADE_HALF = 37.05  # 1.5 times the spec's 3272 mm, at the owner's request
BLADE_TOP = 19.3  # 1261 mm, plus the spill guard in the middle
CAB_HALF = 12.6
CAB_FLOOR, CAB_SILL, CAB_ROOF, CAB_TOP = 25.0, 23.9, 45.3, 46.6  # roof top 3085 mm
CAB_FRONT, CAB_REAR = 7.4, 32.3
POST = 0.9
CENTER_GAP = 2.86  # half the gap between the two center posts of the windshield
CONSOLE_TOP, CONSOLE_BOTTOM = 34.2, CAB_FLOOR + 0.2  # glass above, down to the lower display


def face(color):
    return {"uv": [SLOTS.index(color), 0], "uv_size": [1, 1]}


def box(x0, y0, z0, x1, y1, z1, color, rotation=None, pivot=None):
    c = {
        "origin": [round(min(x0, x1), 3), round(min(y0, y1), 3), round(min(z0, z1), 3)],
        "size": [round(abs(x1 - x0), 3), round(abs(y1 - y0), 3), round(abs(z1 - z0), 3)],
        "uv": {f: face(color) for f in ("north", "south", "east", "west", "up", "down")},
    }
    if rotation:
        c["rotation"] = rotation
        c["pivot"] = pivot
    return c


def mirrored(cube):
    """The cube reflected through x = 0, in the build frame."""
    c = json.loads(json.dumps(cube))
    c["origin"][0] = -(cube["origin"][0] + cube["size"][0])
    if "pivot" in c:
        c["pivot"][0] = -c["pivot"][0]
        rx, ry, rz = c["rotation"]
        c["rotation"] = [rx, -ry, -rz]
    return c


def both(cubes):
    """The cubes on the right side plus their mirror images on the left."""
    return [*cubes, *[mirrored(c) for c in cubes]]


def bar(p, q, x0, x1, thick, color, offset=0.0, trim=0.0):
    """A bar of the given thickness from p to q, both (z, y), spanning x0..x1. offset moves it
    along the left-hand normal of p->q; trim shortens it at both ends."""
    dz, dy = q[0] - p[0], q[1] - p[1]
    length = math.hypot(dz, dy)
    nz, ny = -dy / length, dz / length
    cz, cy = (p[0] + q[0]) / 2 + nz * offset, (p[1] + q[1]) / 2 + ny * offset
    half = length / 2 - trim
    angle = math.degrees(math.atan2(dy, dz))
    return box(x0, cy - thick / 2, cz - half, x1, cy + thick / 2, cz + half, color,
               [round(angle, 3), 0, 0], [round((x0 + x1) / 2, 3), round(cy, 3), round(cz, 3)])


STEPS_16 = tuple(i * 22.5 for i in range(8))
STEPS_8 = tuple(i * 45.0 for i in range(4))


def disc(axis, cx, cy, cz, r, depth, color, steps=STEPS_16):
    """A disc of 2 * len(steps) sides made of bars turned about its normal ('x', 'y', or 'z')."""
    n = 2 * len(steps)
    long, short = 2 * r, 2 * r * math.tan(math.pi / n)
    out = []
    for a in steps:
        if axis == "x":
            out.append(box(cx, cy - short / 2, cz - long / 2, cx + depth, cy + short / 2, cz + long / 2, color, [a, 0, 0], [cx, cy, cz]))
        elif axis == "y":
            out.append(box(cx - long / 2, cy, cz - short / 2, cx + long / 2, cy + depth, cz + short / 2, color, [0, a, 0], [cx, cy, cz]))
        else:
            out.append(box(cx - long / 2, cy - short / 2, cz, cx + long / 2, cy + short / 2, cz + depth, color, [0, 0, a], [cx, cy, cz]))
    return out


def corner_bar(x0, z0, x1, z1, y0, y1, thick, color, offset=0.0):
    """A vertical panel from (x0, z0) to (x1, z1) in plan, turned about y."""
    dx, dz = x1 - x0, z1 - z0
    length = math.hypot(dx, dz)
    nx, nz = dz / length, -dx / length
    cx, cz = (x0 + x1) / 2 + nx * offset, (z0 + z1) / 2 + nz * offset
    # mirror_x negates y turns along with x, so a turn written here carries +z toward +x in this
    # build frame.
    angle = math.degrees(math.atan2(dx, dz))
    return box(cx - thick / 2, y0, cz - length / 2, cx + thick / 2, y1, cz + length / 2, color,
               [0, round(angle, 3), 0], [round(cx, 3), round((y0 + y1) / 2, 3), round(cz, 3)])


body, blade, glass, lamps, seat = [], [], [], [], []

# --- Undercarriage -----------------------------------------------------------
# Wheel centers (z, y) and the track's outer radius around each, traced from the side view.
FRONT_IDLER = (-13.5, 5.6, 3.2, 5.6)
SPROCKET = (21.5, 15.8, 4.3, 6.7)
REAR_IDLER = (30.4, 5.6, 3.2, 5.6)


def hull(points):
    pts = sorted(set(points))

    def turn(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and turn(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and turn(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]  # counterclockwise in (z, y)


loop_points = []
for cz, cy, _, r in (FRONT_IDLER, SPROCKET, REAR_IDLER):
    for i in range(96):
        a = 2 * math.pi * i / 96
        loop_points.append((round(cz + r * math.cos(a), 4), round(cy + r * math.sin(a), 4)))
LOOP = hull(loop_points)


def resample(poly, pitch, start=0.0):
    """Points every pitch along the closed polygon, the first one start along it."""
    edges = list(zip(poly, poly[1:] + poly[:1]))
    total = sum(math.dist(a, b) for a, b in edges)
    n = round(total / pitch)
    step = total / n
    out, t, k = [], start, 0
    walked = 0.0
    for a, b in edges:
        seg = math.dist(a, b)
        while k < n and t <= walked + seg:
            f = (t - walked) / seg
            out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
            k += 1
            t = start + k * step
        walked += seg
    return out


track = []
PITCH, TRACK_PHASES = 1.5, 3
LINKS = resample(LOOP, PITCH)
for p, q in zip(LINKS, LINKS[1:] + LINKS[:1]):
    # The loop runs counterclockwise, so the left-hand normal points inward.
    track.append(bar(p, q, TRACK_IN, TRACK_OUT, 0.9, "shoe", offset=0.45, trim=0.04))
    for x0, x1 in ((TRACK_IN + 2.4, TRACK_IN + 3.6), (TRACK_OUT - 3.6, TRACK_OUT - 2.4)):
        track.append(bar(p, q, x0, x1, 1.2, "link", offset=1.5, trim=0.1))
# The grousers come in phases a third of a link apart; showing them in turn makes the belt run.
# Counterclockwise in (z, y) carries the bottom run rearward, as when driving forward.
grousers = []
for k in range(TRACK_PHASES):
    pts = resample(LOOP, PITCH, start=k * PITCH / TRACK_PHASES)
    grousers.append([bar(p, q, TRACK_IN + 0.2, TRACK_OUT - 0.2, 0.45, "grouser", offset=-0.2, trim=0.5)
                     for p, q in zip(pts, pts[1:] + pts[:1])])
wheels = {"idler_front": [], "idler_rear": [], "sprocket": []}

# Dark fill inside the loop, so the gaps between wheels read as shadow, not sky.
inner_x0, inner_x1 = TRACK_IN + 0.6, TRACK_IN + 1.4


def loop_top(z):
    best = None
    for (az, ay), (bz, by) in zip(LOOP, LOOP[1:] + LOOP[:1]):
        if min(az, bz) <= z <= max(az, bz) and az != bz:
            y = ay + (by - ay) * (z - az) / (bz - az)
            best = y if best is None else max(best, y)
    return best


z = -13.5
while z < 30.4:
    top = loop_top(z + 0.5)
    track.append(box(inner_x0, 2.2, z, inner_x1, top - 2.0, z + 1.0, "under"))
    z += 1.0

wheel_x = TRACK_OUT - 1.6
for name, (cz, cy, r, _) in (("idler_front", FRONT_IDLER), ("idler_rear", REAR_IDLER)):
    w = wheels[name]
    w += disc("x", TRACK_IN + 1.4, cy, cz, r, wheel_x - TRACK_IN - 1.4, "yellow_dark")
    w += disc("x", wheel_x, cy, cz, r * 0.9, 0.3, "yellow")
    w += disc("x", wheel_x + 0.3, cy, cz, r * 0.4, 0.3, "yellow_dark", STEPS_8)
    for i in range(4):  # spokes, so a turning idler shows
        a = math.pi * i / 2
        by, bz = cy + r * 0.62 * math.sin(a), cz + r * 0.62 * math.cos(a)
        w.append(box(wheel_x + 0.3, by - 0.3, bz - 0.3, wheel_x + 0.5, by + 0.3, bz + 0.3, "yellow_dark"))
cz, cy, r, _ = SPROCKET
w = wheels["sprocket"]
w += disc("x", TRACK_IN + 1.4, cy, cz, r + 0.6, wheel_x - TRACK_IN - 1.4, "frame")
w += disc("x", wheel_x, cy, cz, r, 0.3, "yellow")
w += disc("x", wheel_x + 0.3, cy, cz, r * 0.55, 0.3, "yellow_light")
w += disc("x", wheel_x + 0.6, cy, cz, r * 0.22, 0.3, "yellow_dark", STEPS_8)
for i in range(5):
    a = 2 * math.pi * i / 5 + math.pi / 2
    by, bz = cy + r * 0.38 * math.sin(a), cz + r * 0.38 * math.cos(a)
    w.append(box(wheel_x + 0.6, by - 0.3, bz - 0.3, wheel_x + 0.8, by + 0.3, bz + 0.3, "bolt"))
for i in range(12):
    a = 2 * math.pi * i / 12
    by, bz = cy + (r + 0.35) * math.sin(a), cz + (r + 0.35) * math.cos(a)
    w.append(box(wheel_x - 0.2, by - 0.35, bz - 0.35, wheel_x + 0.2, by + 0.35, bz + 0.35, "link"))
WHEEL_CENTERS = {"idler_front": FRONT_IDLER, "idler_rear": REAR_IDLER, "sprocket": SPROCKET}

# Roller frame: a long beam with tapered ends, track rollers under it, a carrier on top.
track.append(box(TRACK_IN + 1.4, 5.0, -10.5, wheel_x + 0.4, 9.2, 27.5, "yellow"))
track.append(bar((-10.5, 9.2), (-14.2, 6.6), TRACK_IN + 1.4, wheel_x + 0.4, 2.6, "yellow", offset=1.3))
track.append(bar((27.5, 9.2), (31.0, 6.6), TRACK_IN + 1.4, wheel_x + 0.4, 2.6, "yellow", offset=-1.3))
track.append(box(wheel_x + 0.4, 6.2, -9.0, wheel_x + 0.6, 8.2, 26.0, "yellow_dark"))
for zr in (-8.0, -3.4, 1.2, 5.8, 10.4, 15.0, 19.6, 24.2):
    track += disc("x", TRACK_IN + 1.8, 3.6, zr, 1.4, wheel_x - TRACK_IN - 1.4, "yellow_dark", STEPS_8)
    track.append(box(TRACK_IN + 2.4, 3.0, zr - 0.25, wheel_x - 0.2, 3.2, zr + 0.25, "under"))
for zb, label in ((-6.0, 0), (7.0, 1), (22.5, 2)):
    track.append(box(wheel_x + 0.5, 7.4, zb - 0.4, wheel_x + 0.75, 8.0, zb + 0.4, "black"))
track += disc("x", wheel_x + 0.4, 8.8, 9.0, 1.2, 0.4, "yellow_dark", STEPS_8)  # equalizer pin
track += disc("x", wheel_x + 0.8, 8.8, 9.0, 0.5, 0.2, "bolt", STEPS_8)
# Final drive housing behind the sprocket, inside the tracks
track += disc("x", TRACK_IN - 0.6, SPROCKET[1], SPROCKET[0], 3.0, 2.0, "yellow_dark")

body += both(track)

# --- Main frame, fenders, rear housing --------------------------------------
body.append(box(-7.2, 5.4, -14.0, 7.2, 15.0, 34.4, "yellow_dark"))  # 358 mm ground clearance
# Behind the sprocket the frame narrows, so from the side the space under the rear housing reads as
# deep shadow rather than a wall.
REAR_FRAME_Z, REAR_FRAME_HALF = 28.0, 6.0
body.append(box(-TRACK_IN, 5.4, 8.0, TRACK_IN, 15.0, REAR_FRAME_Z, "yellow_dark"))
# Seen from behind, the frame between the final drives is dark and set in under the rear housing.
body.append(box(-REAR_FRAME_HALF, 5.4, 34.4, REAR_FRAME_HALF, 18.4, 34.8, "under"))
body.append(box(-TRACK_IN + 0.2, 15.0, 7.4, TRACK_IN - 0.2, 18.4, REAR_FRAME_Z, "yellow"))
body.append(box(-REAR_FRAME_HALF, 15.0, REAR_FRAME_Z, REAR_FRAME_HALF, 18.4, 34.4, "yellow"))
body.append(box(-TRACK_IN + 0.2, 18.4, 7.4, TRACK_IN - 0.2, CAB_SILL, REAR_FRAME_Z, "yellow"))
body.append(box(-REAR_FRAME_HALF, 18.4, REAR_FRAME_Z, REAR_FRAME_HALF, CAB_SILL, 33.0, "yellow"))
# Side bodies over the tracks. Their lower edge follows the track's slope up to the sprocket and
# arches over it with a little clearance, and the body is cut back into a dark recess under that
# edge. In front of the door they stop at the deck; behind the door they rise to the window line,
# with a front edge that leans back from the door's lower rear corner.
DECK, BELT_LINE = 24.5, 32.5
SIDE_IN, SIDE_OUT = TRACK_IN, TRACK_OUT - 1.2
DOOR_REAR, DOOR_DIAGONAL = 16.2, ((13.2, DECK), (16.2, BELT_LINE))  # (z, y) from the side view
# The side bodies start at the cab front: the owner had the step ahead of it cut away, so the lift
# cylinders reach back to the cab front.
SIDE_FRONT, SIDE_REAR = CAB_FRONT, 37.1
BEVEL = 3.0  # the rear side panels' top outer edge is beveled in toward the cab, as seen from behind


def side_top(z):
    (z0, y0), (z1, y1) = DOOR_DIAGONAL
    if z <= z0:
        return DECK
    if z >= z1:
        return BELT_LINE
    return y0 + (y1 - y0) * (z - z0) / (z1 - z0)


TAIL_RADIUS = 5.0  # the rear housing's lower back corner is rounded, seen from the side


def side_bottom(z):
    # The rear housing hangs no lower than 18.5 px behind the sprocket.
    bottom = max(loop_top(min(max(z, -13.0), 35.0)) + 1.6, 18.5)
    cz, cy = SIDE_REAR - TAIL_RADIUS, 18.5 + TAIL_RADIUS
    if z > cz:
        bottom = max(bottom, cy - math.sqrt(max(TAIL_RADIUS ** 2 - (z - cz) ** 2, 0.0)))
    return bottom


side = []
z = SIDE_FRONT
while z < SIDE_REAR - 1e-6:
    z1 = min(z + 0.5, SIDE_REAR)
    zm = (z + z1) / 2
    top, bottom = side_top(zm), side_bottom(zm)
    side.append(box(SIDE_IN, bottom + 2.0, z, SIDE_OUT, min(top, CAB_SILL), z1, "yellow"))
    side.append(box(SIDE_IN, bottom + 1.0, z, SIDE_OUT - 1.0, bottom + 2.0, z1, "yellow_dark"))
    if top > CAB_SILL:  # beside the cab the body stays outside its wall
        side.append(box(CAB_HALF, CAB_SILL, z, SIDE_OUT, min(top, BELT_LINE - BEVEL), z1, "yellow"))
    side.append(box(SIDE_IN, bottom, z, SIDE_OUT - 2.0, bottom + 1.0, z1, "yellow_dark"))  # undercut lip
    if zm < REAR_FRAME_Z:  # recess; behind the sprocket the space stays open and deep
        side.append(box(SIDE_IN, loop_top(min(zm, 35.0)) - 0.2, z, SIDE_IN + 1.2, bottom, z1, "under"))
    z = z1
# The bevel along the top of the rear side panels, in rows narrowing toward the cab wall; in front
# of the door's upright edge the side top is lower than the bevel, so the rows start there.
for i in range(6):
    y0 = BELT_LINE - BEVEL + i * BEVEL / 6
    x1 = SIDE_OUT - (i + 1) * (SIDE_OUT - CAB_HALF - 1.0) / 6
    z0 = DOOR_DIAGONAL[0][0] + (y0 + BEVEL / 12 - DECK) / (BELT_LINE - DECK) * (DOOR_DIAGONAL[1][0] - DOOR_DIAGONAL[0][0])
    side.append(box(CAB_HALF, y0, z0, x1, y0 + BEVEL / 6, SIDE_REAR, "yellow"))
# Panel seams and bolt heads on the rear side panel, and the deck's top plate with its perforated
# orange plates beside the cab front.
side += [box(SIDE_OUT, 24.4, 23.6, SIDE_OUT + 0.1, BELT_LINE - BEVEL, 23.9, "yellow_dark"),
         box(SIDE_OUT, 27.0, 16.8, SIDE_OUT + 0.1, 27.3, 36.6, "yellow_dark"),
         box(SIDE_IN, DECK - 0.4, SIDE_FRONT - 0.6, SIDE_OUT + 0.3, DECK, CAB_FRONT, "yellow_dark")]
for bz, by in ((18.0, 28.8), (22.6, 28.8), (25.0, 28.8), (35.6, 28.8), (25.0, 25.6), (35.6, 25.6), (30.0, 22.4)):
    side.append(box(SIDE_OUT, by - 0.25, bz - 0.25, SIDE_OUT + 0.15, by + 0.25, bz + 0.25, "bolt"))
side.append(box(CAB_HALF + 0.2, DECK, SIDE_FRONT, SIDE_OUT - 0.3, DECK + 0.1, 11.6, "orange"))
for gx in range(4):
    for gz in range(int((11.6 - SIDE_FRONT - 1.2) / 1.15) + 1):
        x, zz = CAB_HALF + 0.8 + gx * 1.05, SIDE_FRONT + 0.6 + gz * 1.15
        side.append(box(x, DECK + 0.1, zz, x + 0.45, DECK + 0.12, zz + 0.45, "hole"))
side.append(box(CAB_HALF, BELT_LINE, 17.2, CAB_HALF + 0.8, BELT_LINE + 0.3, 36.4, "yellow_dark"))  # ledge
body += both(side)
# Rear housing under the back of the cab
body.append(box(-CAB_HALF, CAB_SILL, CAB_REAR, CAB_HALF, BELT_LINE, 37.1, "yellow"))
body.append(box(-CAB_HALF + 0.6, 26.0, 37.1, CAB_HALF - 0.6, 31.8, 37.4, "yellow_dark"))
body += both([box(8.6, 28.2, 37.1, 11.0, 30.8, 37.7, "red"),
              box(8.6, 26.8, 37.1, 11.0, 28.0, 37.6, "amber")])
# A vertical grab rail at the right rear corner, and at the left a stepped handhold: a rail with
# rungs that step out from the panel, for climbing to the cab from behind.
body += [box(11.6, 24.6, 37.9, 12.2, 36.6, 38.5, "black"),
         box(11.6, 36.0, 36.2, 12.2, 36.6, 38.5, "black"),
         box(11.6, 25.0, 36.2, 12.2, 25.6, 38.5, "black")]
for x in (-15.6, -12.2):
    body.append(box(x - 0.3, 22.4, 38.1, x + 0.3, 35.0, 38.6, "yellow_dark"))
    for ys in (23.2, 35.0):
        body.append(box(x - 0.3, ys - 0.5, 37.1, x + 0.3, ys, 38.6, "yellow_dark"))
for i, ys in enumerate((24.6, 27.2, 29.8, 32.4)):
    body.append(box(-15.6, ys, 37.6 + 0.2 * i, -12.2, ys + 0.5, 38.6 + 0.2 * i, "yellow_dark"))
# A pipe across the middle of the rear panel on three clamps
body.append(box(-7.4, 30.2, 37.5, 7.4, 31.0, 38.3, "steel"))
for x in (-6.4, 0.0, 6.4):
    body.append(box(x - 0.4, 29.8, 37.1, x + 0.4, 31.4, 38.5, "yellow_dark"))
# Between the tracks at the back: the big round bolted cover of the steering and final drive case,
# and under it a cross member carrying the drawbar.
COVER = (0.0, 12.4, 34.8, 4.6)  # x, y, z of its face, radius
body += disc("z", 0.0, COVER[1], COVER[2], COVER[3], 0.6, "yellow_dark")
body += disc("z", 0.0, COVER[1], COVER[2] + 0.6, COVER[3] * 0.62, 0.4, "yellow")
body += disc("z", 0.0, COVER[1], COVER[2] + 1.0, COVER[3] * 0.25, 0.4, "yellow_dark", STEPS_8)
for i in range(12):
    a = 2 * math.pi * i / 12
    bx, by = COVER[3] * 0.82 * math.cos(a), COVER[1] + COVER[3] * 0.82 * math.sin(a)
    body.append(box(bx - 0.25, by - 0.25, COVER[2] + 0.6, bx + 0.25, by + 0.25, COVER[2] + 0.85, "bolt"))
body.append(box(-REAR_FRAME_HALF, 5.4, 34.4, REAR_FRAME_HALF, 7.6, 36.4, "yellow_dark"))
body.append(box(-2.6, 5.0, 36.4, 2.6, 7.4, 38.0, "yellow_dark"))  # drawbar
body.append(box(-1.2, 5.6, 38.0, 1.2, 6.8, 38.6, "frame"))
# Under water a bronze four-blade propeller comes out of the cover and turns (the owner's
# request); in flight blue particles stream from the cover's thruster locator instead.
PROP_PIVOT = [0.0, COVER[1], COVER[2] + 1.6]
propeller = [*disc("z", 0.0, COVER[1], COVER[2] + 1.0, 1.2, 1.4, "bronze", STEPS_8)]
for k in range(4):
    propeller.append(box(-0.5, COVER[1], COVER[2] + 1.4, 0.5, COVER[1] + 4.0, COVER[2] + 1.8, "bronze",
                         [0, 18, 45 + 90 * k], PROP_PIVOT))
THRUSTER = [0.0, COVER[1], COVER[2] + 1.4]

# --- Hood --------------------------------------------------------------------
HOOD_FRONT, HOOD_REAR, HOOD_BOTTOM = -13.3, CAB_FRONT, 15.0
# The engine compartment is narrow, leaving room for the push arms between it and the tracks.
HOOD_HALF, HOOD_LEAN = 7.2, 0.07  # half width at y 22, and the inward lean per px of height
HOOD_HALF_TOP = 6.4
# The hood top falls gently toward the radiator, about 12 degrees, as measured on the three-view.
HOOD_TOP_FRONT, HOOD_TOP_REAR = 30.6, 35.2


def hood_top(z):
    return HOOD_TOP_FRONT + (HOOD_TOP_REAR - HOOD_TOP_FRONT) * (z - HOOD_FRONT) / (HOOD_REAR - HOOD_FRONT)


def hood_shoulder(z):
    return hood_top(z) - 1.9


def hood_half(y, z):
    # A tall box whose sides lean in evenly by a few degrees.
    return HOOD_HALF if y <= 22.0 else max(HOOD_HALF - (y - 22.0) * HOOD_LEAN, HOOD_HALF_TOP)


# The side panel's access door, from the owner's side photo: a recessed panel whose front edge
# leans back, crossed corner to corner by a raised brace from its upper front to its lower rear.
INSET_BOTTOM, INSET_TOP = 22.9, 29.1
INSET_FRONT_BOTTOM, INSET_FRONT_TOP, INSET_REAR = -7.0, -5.3, 2.6
BRACE = 0.9  # the brace's width along z


def hood_color(y, z):
    if not INSET_BOTTOM <= y <= min(INSET_TOP, hood_shoulder(z) - 0.9):
        return "yellow"
    t = (y - INSET_BOTTOM) / (INSET_TOP - INSET_BOTTOM)
    if not INSET_FRONT_BOTTOM + (INSET_FRONT_TOP - INSET_FRONT_BOTTOM) * t <= z <= INSET_REAR:
        return "yellow"
    brace_z = INSET_REAR + (INSET_FRONT_TOP - INSET_REAR) * t
    return "yellow" if abs(z - brace_z) <= BRACE / 2 else "yellow_dark"


HOOD_SEGMENTS = [HOOD_FRONT + i * (HOOD_REAR - HOOD_FRONT) / 48 for i in range(49)]
y = 22.0
while y < hood_top(HOOD_REAR) - 1e-6:
    y1 = y + 0.5
    run = None  # merge neighbouring segments with the same width and color
    for z0, z1 in zip(HOOD_SEGMENTS, HOOD_SEGMENTS[1:]):
        zm = (z0 + z1) / 2
        if y1 > hood_top(z0) - 0.3:  # stay under the smooth top skin
            continue
        key = (round(hood_half(y + 0.25, zm), 1), hood_color(y + 0.25, zm))
        if run and run[0] == key and abs(run[2] - z0) < 1e-6:
            run[2] = z1
        else:
            if run:
                body.append(box(-run[0][0], y, run[1], run[0][0], y1, run[2], run[0][1]))
            run = [key, z0, z1]
    if run:
        body.append(box(-run[0][0], y, run[1], run[0][0], y1, run[2], run[0][1]))
    y = y1
body.append(box(-HOOD_HALF, HOOD_BOTTOM, HOOD_FRONT, HOOD_HALF, 22.0, HOOD_REAR, "yellow"))
# A smooth top skin over the stepped slices, then the dark top covers with their seams.
TOP_FRONT, TOP_REAR = (HOOD_FRONT, hood_top(HOOD_FRONT)), (HOOD_REAR, hood_top(HOOD_REAR))
body.append(bar(TOP_FRONT, TOP_REAR, -HOOD_HALF_TOP, HOOD_HALF_TOP, 1.4, "yellow", offset=-0.6))
body.append(bar((-9.0, hood_top(-9.0)), (6.4, hood_top(6.4)), -5.4, 5.4, 0.15, "frame", offset=0.18))
for zl in (-6.0, -2.0, 2.0):
    body.append(bar((zl, hood_top(zl)), (zl + 0.3, hood_top(zl + 0.3)), -5.4, 5.4, 0.1, "black", offset=0.3))
# Thin side skins along the top edge hide the steps the slices leave on the sides.
for sx in (1, -1):
    skin_x = hood_half(hood_top(HOOD_FRONT) - 1.0, 0.0)
    body.append(bar(TOP_FRONT, TOP_REAR, min(sx * skin_x, sx * (skin_x - 0.3)), max(sx * skin_x, sx * (skin_x - 0.3)),
                    2.0, "yellow", offset=-1.0))
FRONT_TOP = hood_top(HOOD_FRONT)
# The access door's outline on each hood side, from the owner's photo: a seam down its front edge
# with two hinge plates of two bolts each, a seam along its bottom and up its rear edge by the cab,
# and a recessed latch handle near the rear edge.
ACCESS_FRONT, ACCESS_REAR, ACCESS_BOTTOM = -8.0, CAB_FRONT - 0.5, 22.6


def on_hood_side(y0, y1, z0, z1, color, rise=0.06):
    """A thin plate on the right hood side from y0 to y1, following its lean, in 0.5 px rows."""
    out, y = [], y0
    while y < y1 - 1e-6:
        y2 = min(y + 0.5, y1)
        x = hood_half((y + y2) / 2, 0.0)
        out.append(box(x - 0.05, y, z0, x + rise, y2, z1, color))
        y = y2
    return out


access = []
for z in (ACCESS_FRONT, ACCESS_REAR):
    access += on_hood_side(ACCESS_BOTTOM, hood_shoulder(z) - 0.4, z - 0.08, z + 0.08, "yellow_dark")
access.append(box(HOOD_HALF - 0.05, ACCESS_BOTTOM, ACCESS_FRONT, HOOD_HALF + 0.06, ACCESS_BOTTOM + 0.16,
                  ACCESS_REAR, "yellow_dark"))
for hy in (23.4, 27.2):  # hinge plates
    access += on_hood_side(hy, hy + 1.6, ACCESS_FRONT - 0.35, ACCESS_FRONT + 0.25, "yellow_dark", 0.12)
    for by in (hy + 0.35, hy + 1.05):
        x = hood_half(by, 0.0)
        access.append(box(x, by, ACCESS_FRONT - 0.25, x + 0.2, by + 0.3, ACCESS_FRONT + 0.05, "bolt"))
LATCH_Z, LATCH_Y = 3.4, 25.6  # the latch recess's front lower corner
access += on_hood_side(LATCH_Y, LATCH_Y + 1.6, LATCH_Z, LATCH_Z + 1.6, "yellow_dark")
access += on_hood_side(LATCH_Y + 0.2, LATCH_Y + 1.4, LATCH_Z + 0.2, LATCH_Z + 0.55, "black", 0.2)
x = hood_half(LATCH_Y + 0.7, 0.0)
access.append(box(x, LATCH_Y + 0.6, LATCH_Z + 1.0, x + 0.12, LATCH_Y + 0.9, LATCH_Z + 1.3, "bolt"))  # lock
body += both(access)

# Radiator guard: a black grille with bars, two square work lamps, side grab handles.
body.append(box(-6.6, HOOD_BOTTOM, HOOD_FRONT - 1.1, 6.6, FRONT_TOP - 0.6, HOOD_FRONT, "black"))
gy = 16.0
while gy + 0.5 < FRONT_TOP - 2.8:
    body.append(box(-5.8, gy, HOOD_FRONT - 1.3, 5.8, gy + 0.5, HOOD_FRONT - 1.1, "frame"))
    gy += 1.5
body += both([box(5.8, 15.6, HOOD_FRONT - 1.4, 6.6, FRONT_TOP - 0.8, HOOD_FRONT - 1.1, "frame")])
LAMP_Y = FRONT_TOP - 2.6
lamps += both([box(2.4, LAMP_Y, HOOD_FRONT - 1.5, 4.2, LAMP_Y + 1.6, HOOD_FRONT - 1.1, "lens")])
body += both([box(2.1, LAMP_Y - 0.3, HOOD_FRONT - 1.4, 4.5, LAMP_Y + 1.9, HOOD_FRONT - 1.2, "frame"),
              # grab handle loops at the radiator corners
              box(7.0, 22.0, HOOD_FRONT - 3.1, 7.6, FRONT_TOP - 0.6, HOOD_FRONT - 2.5, "black"),
              box(7.0, FRONT_TOP - 1.2, HOOD_FRONT - 3.1, 7.6, FRONT_TOP - 0.6, HOOD_FRONT, "black"),
              box(7.0, 22.0, HOOD_FRONT - 3.1, 7.6, 22.6, HOOD_FRONT, "black")])

# On the hood, front to rear as in the owner's side photo: a sensor box on a post near the front,
# the air intake (a capped can on a stalk) at mid hood, and the tall exhaust stack, with a handrail
# beside them. Each stands on the driver's line of sight past a windshield center post as far as
# the narrow hood allows, so from the seat it hides behind the post or close to it (the owner's
# earlier request). The eye is at z 21.6 px; the posts are centered at x +-(CENTER_GAP + POST / 2), z 7.9.
DRIVER_EYE_Z, POST_Z = 21.6, CAB_FRONT + 0.5


def behind_post(z, half_width):
    sight = (CENTER_GAP + POST / 2) * (DRIVER_EYE_Z - z) / (DRIVER_EYE_Z - POST_Z)
    return min(sight, HOOD_HALF_TOP - half_width - 0.3)


CAN_Z, CAN_R = -5.5, 1.5
CAN_X = behind_post(CAN_Z, CAN_R)
CAN = hood_top(CAN_Z) - 0.3
body += disc("y", CAN_X, CAN, CAN_Z, 0.8, 2.8, "frame", STEPS_8)
body += disc("y", CAN_X, CAN + 2.8, CAN_Z, CAN_R, 3.0, "black", STEPS_8)
body += disc("y", CAN_X, CAN + 5.8, CAN_Z, CAN_R * 0.75, 0.5, "black", STEPS_8)
SENSOR_Z = -11.1
SENSOR_X = -behind_post(SENSOR_Z, 1.6)
SENSOR = hood_top(SENSOR_Z) - 0.3
body.append(box(SENSOR_X - 0.5, SENSOR, SENSOR_Z - 0.5, SENSOR_X + 0.5, SENSOR + 2.2, SENSOR_Z + 0.5, "frame"))
body.append(box(SENSOR_X - 1.6, SENSOR + 2.2, SENSOR_Z - 1.4, SENSOR_X + 1.6, SENSOR + 5.0, SENSOR_Z + 1.4, "black"))
STACK_Z = -0.7
STACK_X = -behind_post(STACK_Z, 1.05)
STACK = hood_top(STACK_Z) - 0.3
body += disc("y", STACK_X, STACK, STACK_Z, 0.85, 45.4 - STACK, "black", STEPS_8)
body += disc("y", STACK_X, 45.4, STACK_Z, 0.95, 0.3, "frame", STEPS_8)
RAIL = 1.4  # handrail height over the hood top; the rails run from the intake back past the stack
RAIL_REAR = 2.0
body += both([box(5.4, hood_top(-8.1) - 0.3, -8.1, 5.9, hood_top(-8.1) + RAIL, -7.6, "black"),
              box(5.4, hood_top(RAIL_REAR) - 0.3, RAIL_REAR - 0.5, 5.9, hood_top(RAIL_REAR) + RAIL, RAIL_REAR, "black"),
              bar((-8.1, hood_top(-8.1) + RAIL - 0.25), (RAIL_REAR, hood_top(RAIL_REAR) + RAIL - 0.25), 5.4, 5.9, 0.5, "black")])

# --- Blade and push frame ----------------------------------------------------
BLADE_FRONT = -LENGTH_HALF


def moldboard_front(y):
    # Concave face: 4.6 px deep at mid-height, the top lip curling forward.
    t = (y - 8.5) / 10.5
    return BLADE_FRONT + 0.5 + 4.6 * (1 - t * t) if y < 19.0 else BLADE_FRONT + 0.4


GUARD = BLADE_HALF * 0.445  # the spill guard's half width


def blade_top(x):
    # A spill guard rises in the middle third with sloped shoulders.
    ax = abs(x)
    if ax <= GUARD:
        return BLADE_TOP + 1.9
    if ax <= GUARD + 3.8:
        return BLADE_TOP + 1.9 * (GUARD + 3.8 - ax) / 3.8
    return BLADE_TOP


y = 3.0
while y < BLADE_TOP + 1.9 - 1e-6:
    y1 = min(y + 0.75, BLADE_TOP + 1.9)
    zf = moldboard_front((y + y1) / 2)
    if y1 <= BLADE_TOP + 1e-6:
        blade.append(box(-BLADE_HALF, y, zf, BLADE_HALF, y1, zf + 1.0, "yellow"))
    else:
        # Spill guard rows over the middle and the sloped shoulders
        x_half = GUARD + (BLADE_TOP + 1.9 - y1) / 1.9 * 3.8
        blade.append(box(-x_half, y, zf, x_half, y1, zf + 1.0, "yellow"))
    y = y1
# Cutting edge in five bolted segments, end bits at the corners, painted like the moldboard
EDGE_CUTS = [f * BLADE_HALF for f in (-1.0, -0.794, -0.393, 0.393, 0.794, 1.0)]
for i, (x0, x1) in enumerate(zip(EDGE_CUTS, EDGE_CUTS[1:])):
    x0, x1 = x0 + (0.1 if i else 0.0), x1 - (0.1 if i < 4 else 0.0)
    blade.append(box(x0, 0.0, BLADE_FRONT, x1, 3.0, BLADE_FRONT + 1.4, "yellow"))
    blade.append(box(x0, 0.6, BLADE_FRONT + 1.4, x1, 3.0, BLADE_FRONT + 4.6, "yellow_dark"))
    n = max(2, round((x1 - x0) / 2.2))
    for k in range(n):
        bx = x0 + (k + 0.5) * (x1 - x0) / n
        blade.append(box(bx - 0.25, 1.3, BLADE_FRONT - 0.1, bx + 0.25, 1.8, BLADE_FRONT, "bolt"))
blade.append(box(-BLADE_HALF, 3.0, BLADE_FRONT + 0.6, BLADE_HALF, 3.6, BLADE_FRONT + 2.2, "yellow_dark"))
# Side plates, leaning forward at the top like the drawing
for sx in (1, -1):
    x0, x1 = (BLADE_HALF - 0.8, BLADE_HALF) if sx > 0 else (-BLADE_HALF, -BLADE_HALF + 0.8)
    blade.append(box(x0, 0.0, BLADE_FRONT + 0.3, x1, 3.0, BLADE_FRONT + 6.0, "yellow"))
    y = 3.0
    while y < BLADE_TOP - 1e-6:
        y1 = min(y + 0.75, BLADE_TOP)
        zf = moldboard_front((y + y1) / 2)
        # The end plates follow the curve of the moldboard, a little ahead of it.
        blade.append(box(x0, y, zf - 1.0, x1, y1, zf + 2.6 + 3.0 * (y1 / BLADE_TOP), "yellow"))
        y = y1
# Back of the moldboard: vertical ribs and two horizontal box beams
BACK = BLADE_FRONT + 6.6
blade.append(box(-BLADE_HALF + 0.8, 4.0, BACK - 1.6, BLADE_HALF - 0.8, 7.0, BACK + 1.2, "yellow"))
blade.append(box(-BLADE_HALF + 0.8, 13.0, BACK - 1.0, BLADE_HALF - 0.8, 16.0, BACK + 0.8, "yellow"))
for rx in [-2.4 - 5.8 * k for k in range(6)] + [2.4 + 5.8 * k for k in range(6)]:
    blade.append(box(rx - 0.4, 3.6, BACK - 0.6, rx + 0.4, 18.6, BACK + 1.4, "yellow_dark"))
# Center pivot bracket where the C-frame meets the blade
blade.append(box(-3.0, 4.0, BACK, 3.0, 13.0, BACK + 2.4, "yellow"))
blade += disc("y", 0.0, 13.0, BACK + 1.2, 1.4, 1.0, "yellow_dark", STEPS_8)

# Push arms: long beams from trunnions on the main frame beside the cab front, running forward
# between the hood and the tracks and sloping down to the C-frame, a ring in front of the hood
# that carries the blade's center pivot. Angle cylinders ride on the arms' front halves. Each lift
# cylinder lies along the hood side from the cab front, pinned at its rear end, and its chrome rod
# reaches forward to the top of a triangular gusset that rises from the arm, as in the owner's
# reference photos.
# The rest of the push frame is blade_rig, and each lift cylinder and rod is its own bone, so the
# drive animation can raise the blade (ADR 0138).
ARM_IN, ARM_OUT = 7.5, 9.5
C_CENTER, C_OUTER, C_INNER = HOOD_FRONT - 9.6, 9.5, 6.9
ARM_FRONT, ARM_REAR = (C_CENTER, 8.0), (2.0, 12.0)  # (z, y) centerline, low behind the track
# The raised pose, drawn by the drive animation from yasu_ride:blade (ADR 0138): blade_rig moves
# BLADE_RAISE px up and ROD_RETRACT px rearward. Each lift cylinder swings up about its rear pin by
# LIFT_SWING degrees and its rod shortens by ROD_SHORTEN px, so the rod's end follows the gusset top.
# The owner chose this visible retraction over strict kinematics.
# The generator writes none of these values: bulldozer.anim.json and tests/packs/bulldozer.test.ts
# repeat them by hand, and bulldozerModel.test.ts fails when they differ from the animation's Molang.
BLADE_RAISE = 3.0
ROD_RETRACT = 3.0
LIFT_X, LIFT_Y = (ARM_IN + ARM_OUT) / 2, 21.4  # the cylinder's axis
LIFT_PIN, LIFT_MOUTH, LIFT_ROD_END = SIDE_FRONT - 0.6, -6.0, -13.0  # z of the rear pin, the barrel mouth, and the rod's end
ROD_LENGTH = LIFT_MOUTH - LIFT_ROD_END
_raised_end = (LIFT_ROD_END + ROD_RETRACT - LIFT_PIN, BLADE_RAISE)  # the rod's end seen from the pin, raised
LIFT_SWING = round(math.degrees(math.atan2(_raised_end[1], -_raised_end[0])), 2)
ROD_SHORTEN = round(ROD_LENGTH - (math.hypot(*_raised_end) - (LIFT_PIN - LIFT_MOUTH)), 2)
assert BLADE_RAISE > 0 and 0 < ROD_SHORTEN < ROD_LENGTH
GUSSET_FRONT, GUSSET_REAR, GUSSET_TOP = (-19.5, -13.9), (-10.0, -12.1), 22.2  # (bottom z, top z) of each edge
arms = [bar(ARM_FRONT, ARM_REAR, ARM_IN, ARM_OUT, 4.2, "yellow"),
        bar(ARM_FRONT, ARM_REAR, ARM_IN - 0.2, ARM_OUT + 0.2, 0.6, "yellow_dark", offset=1.6),
        *disc("x", ARM_OUT, ARM_REAR[1], ARM_REAR[0], 2.0, 0.5, "yellow_dark", STEPS_8),
        *disc("x", ARM_OUT + 0.5, ARM_REAR[1], ARM_REAR[0], 0.8, 0.3, "bolt", STEPS_8),
        box(ARM_IN - 0.2, 12.6, -25.4, ARM_OUT + 0.2, 15.0, -15.6, "black"),  # angle cylinder
        box(ARM_IN + 0.4, 13.2, -30.2, ARM_OUT - 0.4, 14.4, -25.4, "chrome")]
# The gusset under the rod's end, in rows whose front edge leans back up to the top
y = 9.5
while y < GUSSET_TOP - 1e-6:
    y1 = min(y + 0.5, GUSSET_TOP)
    t = ((y + y1) / 2 - 9.5) / (GUSSET_TOP - 9.5)
    zf = GUSSET_FRONT[0] + (GUSSET_FRONT[1] - GUSSET_FRONT[0]) * t
    zr = GUSSET_REAR[0] + (GUSSET_REAR[1] - GUSSET_REAR[0]) * t
    arms.append(box(ARM_IN, y, zf, ARM_OUT, y1, zr, "yellow"))
    y = y1
arms += disc("x", ARM_OUT, LIFT_Y, LIFT_ROD_END, 1.1, 0.4, "steel", STEPS_8)  # the rod's end flange
for zb in (-17.0, -6.0, 3.6):  # yellow clamp brackets along the arms
    yb = ARM_FRONT[1] + (ARM_REAR[1] - ARM_FRONT[1]) * (zb - ARM_FRONT[0]) / (ARM_REAR[0] - ARM_FRONT[0])
    arms.append(box(ARM_IN - 0.4, yb + 1.6, zb - 0.6, ARM_OUT + 0.4, yb + 2.6, zb + 0.6, "yellow_dark"))
arms += [box(ARM_IN + 0.4, 10.4, -27.6, ARM_IN + 0.6, 12.2, -26.2, "steel"),  # lifting eye
         box(ARM_OUT - 0.6, 10.4, -27.6, ARM_OUT - 0.4, 12.2, -26.2, "steel"),
         box(ARM_IN + 0.4, 12.0, -27.6, ARM_OUT - 0.4, 12.2, -26.2, "steel")]
lift_cylinder = [box(LIFT_X - 1.2, LIFT_Y - 1.5, LIFT_MOUTH, LIFT_X + 1.2, LIFT_Y + 1.5, SIDE_FRONT, "black"),  # barrel
                 box(LIFT_X - 1.3, LIFT_Y - 1.6, LIFT_MOUTH - 0.4, LIFT_X + 1.3, LIFT_Y + 1.6, LIFT_MOUTH, "frame"),
                 *disc("x", LIFT_X + 1.2, LIFT_Y, LIFT_PIN, 0.7, 0.3, "steel", STEPS_8)]  # rear pin
lift_rod = box(LIFT_X - 0.5, LIFT_Y - 0.6, LIFT_ROD_END, LIFT_X + 0.5, LIFT_Y + 0.6, LIFT_MOUTH, "chrome")
# The mount over the rear pin, on the cab front at deck height
body += both([box(LIFT_X - 1.1, LIFT_Y + 1.5, LIFT_PIN - 1.0, LIFT_X + 1.1, DECK, SIDE_FRONT, "black")])
blade_rig = both(arms)
# The C-frame's front half circle, closed at the back by the arms
ring = 16
for i in range(ring):
    a0, a1 = math.pi * i / ring, math.pi * (i + 1) / ring
    r = (C_OUTER + C_INNER) / 2
    p = (r * math.cos(a0), C_CENTER - r * math.sin(a0))
    q = (r * math.cos(a1), C_CENTER - r * math.sin(a1))
    dx, dz = q[0] - p[0], q[1] - p[1]
    length = math.hypot(dx, dz) + 0.3
    cx, cz = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
    angle = math.degrees(math.atan2(dx, dz))
    blade_rig.append(box(cx - (C_OUTER - C_INNER) / 2, 5.8, cz - length / 2, cx + (C_OUTER - C_INNER) / 2, 10.2,
                         cz + length / 2, "yellow", [0, round(angle, 3), 0], [round(cx, 3), 8.0, round(cz, 3)]))
blade_rig.append(box(-3.4, 5.4, BACK - 0.4, 3.4, 11.0, C_CENTER - C_INNER + 0.6, "yellow"))  # pivot block
blade_rig += disc("y", 0.0, 11.0, C_CENTER - C_INNER - 1.2, 1.6, 0.6, "yellow_dark", STEPS_8)
# Tilt cylinder on the right, from the C-frame to the top of the blade
blade_rig.append(bar((C_CENTER - C_OUTER + 1.0, 10.2), (BACK + 0.4, 15.6), 3.0, 4.6, 1.8, "black"))

# --- Cab ---------------------------------------------------------------------
WIN_FRONT_BOTTOM, WIN_SIDE_BOTTOM, WIN_TOP = 27.6, 25.8, 44.7
# Seen from above the cab is a trapezoid: one pane on each side runs from the center post back to
# the door's front pillar, with no corner post between (the owner's request).
# The cut runs back to the door's rear post at about 45 degrees, so the whole door is the angled pane
# (the owner's top-view drawing).
CHAMFER_X, CHAMFER_Z = CENTER_GAP + POST, DOOR_REAR - POST


def trapezoid(front_half, side_half, z0, z1, z_end, y0, y1, color, step=0.5):
    """A slab that widens from front_half at z0 to side_half at z1 in rows, then runs on to z_end."""
    out, z = [], z0
    while z < z1 - 1e-6:
        z2 = min(z + step, z1)
        w = front_half + (side_half - front_half) * ((z + z2) / 2 - z0) / (z1 - z0)
        out.append(box(-w, y0, z, w, y1, z2, color))
        z = z2
    out.append(box(-side_half, y0, z1, side_half, y1, z_end, color))
    return out


DOOR_FRONT = CHAMFER_Z  # the door wraps round the corner: the angled pane is part of it
B_PILLAR = (DOOR_REAR, DOOR_REAR + 0.5)
REAR_WIN_Z = (B_PILLAR[1], 29.4)


def door_rear(y):
    """The door's rear edge: upright down to the belt line, then leaning forward along the side
    body's front edge to the door's foot."""
    (z0, y0), (z1, y1) = DOOR_DIAGONAL
    if y >= y1:
        return z1
    return z0 + (z1 - z0) * (max(y, y0) - y0) / (y1 - y0)


cab = []
# Floor pan and ribbed mat, both cut at the chamfered front corners
cab += trapezoid(CHAMFER_X + 0.5, CAB_HALF, CAB_FRONT, CHAMFER_Z, CAB_REAR, CAB_SILL, CAB_FLOOR, "black")
cab += trapezoid(CHAMFER_X, CAB_HALF - 0.6, CAB_FRONT + 1.0, CHAMFER_Z + 0.6, CAB_REAR - 1.0, CAB_FLOOR, CAB_FLOOR + 0.2, "interior_dark")
# The mat's ribs run in arcs round the console's foot, as in the owner's floor photo. Each arc is
# cut into short straight strips, kept inside the trapezoid floor.
RIB_CENTER = (0.0, CAB_FRONT + 2.4)  # (x, z)


def floor_half(z):
    if z >= CHAMFER_Z:
        return CAB_HALF - 1.0
    return CHAMFER_X + (CAB_HALF - 1.0 - CHAMFER_X) * (z - CAB_FRONT) / (CHAMFER_Z - CAB_FRONT)


for k in range(10):
    rr = 3.4 + k * 1.15
    n = 14
    for i in range(n):
        a0, a1 = math.pi * i / n, math.pi * (i + 1) / n
        x0, z0 = RIB_CENTER[0] + rr * math.cos(a0), RIB_CENTER[1] + rr * math.sin(a0)
        x1, z1 = RIB_CENTER[0] + rr * math.cos(a1), RIB_CENTER[1] + rr * math.sin(a1)
        xm, zm = (x0 + x1) / 2, (z0 + z1) / 2
        if zm > 18.6 or abs(xm) > floor_half(zm) - 0.5 or (abs(xm) < 2.6 and zm < CAB_FRONT + 4.8):
            continue
        length = math.hypot(x1 - x0, z1 - z0)
        angle = math.degrees(math.atan2(x1 - x0, z1 - z0))
        cab.append(box(xm - 0.2, CAB_FLOOR + 0.2, zm - length / 2, xm + 0.2, CAB_FLOOR + 0.26, zm + length / 2,
                       "interior", [0, round(angle, 3), 0], [round(xm, 3), CAB_FLOOR + 0.2, round(zm, 3)]))
# Roof: a dark slab with the same chamfered front, overhanging all round
ROOF_Z0, ROOF_Z1, ROOF_OVER = CAB_FRONT - 1.8, CAB_REAR + 0.4, 0.4
ROOF_CORNER = CHAMFER_Z - (CAB_FRONT - ROOF_Z0) + ROOF_OVER
# Roof, after the owner's roof drawing: a clean slab on the cab's trapezoid with a beveled top edge
# and a few shallow grooves running across it at a slant; at the back a raised housing for the air
# conditioner with two round fan grilles and a round pod at each end.
BEVEL_TOP = 0.6
cab += trapezoid(CHAMFER_X + ROOF_OVER + 0.6, CAB_HALF + ROOF_OVER, ROOF_Z0, ROOF_CORNER, ROOF_Z1,
                 CAB_ROOF, CAB_TOP - BEVEL_TOP, "black")
cab += trapezoid(CHAMFER_X + ROOF_OVER, CAB_HALF + ROOF_OVER - BEVEL_TOP, ROOF_Z0 + BEVEL_TOP, ROOF_CORNER,
                 ROOF_Z1 - BEVEL_TOP, CAB_TOP - BEVEL_TOP, CAB_TOP, "black")
for k in range(5):
    gz = ROOF_CORNER + 1.5 + k * 2.6
    cab.append(box(-6.0, CAB_TOP, gz - 0.12, 6.0, CAB_TOP + 0.05, gz + 0.12, "frame", [0, 15, 0], [0.0, CAB_TOP, gz]))
AC_Z0, AC_TOP = 29.6, CAB_TOP + 0.9
cab.append(box(-CAB_HALF, 42.4, CAB_REAR, CAB_HALF, CAB_TOP, 37.4, "black"))
cab.append(box(-CAB_HALF + 0.4, CAB_TOP, AC_Z0, CAB_HALF - 0.4, AC_TOP, 37.0, "black"))
for fx in (-2.8, 2.8):  # fan grilles: a dark ring of mesh round a hub
    cab += disc("y", fx, AC_TOP, 33.4, 2.2, 0.05, "interior_dark")
    for k, rr in enumerate((1.9, 1.4, 0.9)):
        cab += disc("y", fx, AC_TOP + 0.05, 33.4, rr, 0.03, "steel" if k % 2 == 0 else "frame")
    cab += disc("y", fx, AC_TOP + 0.08, 33.4, 0.4, 0.05, "black", STEPS_8)
for px in (-9.9, 9.9):  # round pods at the ends
    cab += disc("y", px, AC_TOP, 33.6, 1.5, 0.9, "black")
    cab += disc("y", px, AC_TOP + 0.9, 33.6, 1.1, 0.05, "frame")
# Seen from behind, small white work lamps shine at the roof box's top corners with an amber
# beacon between them on the same face, as in the owner's night photo.
lamps += both([box(10.0, 45.0, 37.4, 11.6, 46.1, 37.7, "lens"),
               box(CAB_HALF, 42.0, 34.0, CAB_HALF + 0.3, 43.6, 36.4, "lens")])  # rear and side-facing
cab += both([box(9.7, 44.7, 37.3, 11.9, 46.4, 37.5, "frame"),
             box(CAB_HALF - 0.1, 41.7, 33.7, CAB_HALF + 0.2, 43.9, 36.7, "frame"),
             # rear camera pod hanging under the roof box
             box(9.6, 41.4, 34.8, 11.2, 42.4, 36.4, "frame"),
             box(10.0, 40.9, 35.2, 10.8, 41.4, 36.0, "lens"),
             ])
# Four work lamps in a row under the roof's front edge, over the windshield, and an amber beacon
# between the middle two.
def roof_edge_z(x):
    """The z of the roof's front edge at x: flat in the middle, then back along the angled sides."""
    flat = CHAMFER_X + ROOF_OVER + 0.6
    if abs(x) <= flat:
        return ROOF_Z0
    return ROOF_Z0 + (abs(x) - flat) / (CAB_HALF + ROOF_OVER - flat) * (ROOF_CORNER - ROOF_Z0)


for lx in (-6.4, 0.0, 6.4):  # work lamps at both front corners of the roof and in the middle
    lz = roof_edge_z(lx)
    cab.append(box(lx - 1.2, CAB_ROOF - 0.1, lz - 0.4, lx + 1.2, CAB_TOP - 0.2, lz + 0.4, "frame"))
    lamps.append(box(lx - 0.9, CAB_ROOF + 0.1, lz - 0.6, lx + 0.9, CAB_TOP - 0.4, lz - 0.4, "lens"))
cab.append(box(-1.3, 44.9, 37.3, 1.3, 46.4, 37.5, "frame"))  # rear beacon
beacon = [box(-1.0, 45.1, 37.4, 1.0, 46.2, 37.7, "amber")]
cab.append(box(10.1, CAB_TOP, 27.0, 10.5, 51.0, 27.4, "black"))  # antenna on the right

# Pillars and frames
side_frame = [
    box(CENTER_GAP, CAB_FLOOR, CAB_FRONT, CENTER_GAP + POST, CAB_ROOF, CAB_FRONT + 1.0, "black"),  # center posts
    box(CAB_HALF - 1.0, CAB_FLOOR, CHAMFER_Z - 0.2, CAB_HALF, CAB_ROOF, B_PILLAR[1], "black"),
    box(CAB_HALF - 1.0, CAB_FLOOR, REAR_WIN_Z[1], CAB_HALF, CAB_ROOF, CAB_REAR, "black"),  # rear pillar
    box(CAB_HALF - 1.0, BELT_LINE, 23.6, CAB_HALF, CAB_ROOF, 24.2, "black"),  # sliding window divider
    box(CAB_HALF - 1.0, WIN_TOP, CHAMFER_Z, CAB_HALF, CAB_ROOF, REAR_WIN_Z[1], "black"),  # top rail
    box(CAB_HALF - 1.0, BELT_LINE - 0.1, REAR_WIN_Z[0], CAB_HALF, BELT_LINE + 0.5, REAR_WIN_Z[1], "black"),
    # rear wall frame beside the window
    box(CAB_HALF - 1.2, CAB_FLOOR, CAB_REAR - 1.0, CAB_HALF, CAB_ROOF, CAB_REAR, "black"),
    # chamfer corner panel frames
    corner_bar(CHAMFER_X, CAB_FRONT + 0.5, CAB_HALF - 0.5, CHAMFER_Z, WIN_TOP, CAB_ROOF, 1.0, "black"),
]
cab += both(side_frame)
# The doors. The right one stays shut; the left one, the driver's way in, swings out on a hinge at
# its rear edge (the owner's request), so it lives in its own bones.
# The door, after the owner's photos: a matte black frame with a narrow border round a tall pane
# that reaches down near the floor. Halfway up, the border by the front edge bulges round an upright
# grab handle, so the pane's front edge steps back there. It is built in rows along the angled side,
# u measured from the center post.
DOOR_A, DOOR_B = (CHAMFER_X, CAB_FRONT + 0.5), (CAB_HALF - 0.5, CHAMFER_Z)
DOOR_LEN = math.dist(DOOR_A, DOOR_B)
DOOR_BORDER = 0.9
HANDLE_Y, HANDLE_BULGE = (29.6, 34.4), 1.1  # the handle's height, and how far the border bulges there
HANDLE_EASE = 0.8  # the height over which the bulge eases in and out


def along(u0, u1, y0, y1, depth, color, lift=0.0):
    """A panel on the door's line from u0 to u1, raised lift outward (negative: into the cab)."""
    (ax, az), (bx, bz) = DOOR_A, DOOR_B
    x0, z0 = ax + (bx - ax) * u0 / DOOR_LEN, az + (bz - az) * u0 / DOOR_LEN
    x1, z1 = ax + (bx - ax) * u1 / DOOR_LEN, az + (bz - az) * u1 / DOOR_LEN
    return corner_bar(x0, z0, x1, z1, y0, y1, depth, color, offset=lift)


def pane_span(y):
    """The pane's (u0, u1) at height y, or None in the border."""
    if y < CAB_FLOOR + 1.0 or y > WIN_TOP - DOOR_BORDER:
        return None
    h0, h1 = HANDLE_Y
    bulge = min(max(min(y - (h0 - HANDLE_EASE), (h1 + HANDLE_EASE) - y) / HANDLE_EASE, 0.0), 1.0)
    return DOOR_BORDER + HANDLE_BULGE * bulge, DOOR_LEN - DOOR_BORDER


door, door_glass = [], []
# Rows with the same span are merged, so the pane shows no seams where see-through rows would overlap.
rows, y = [], CAB_FLOOR
while y < WIN_TOP - 1e-6:
    y1 = min(y + 0.4, WIN_TOP)
    span = pane_span((y + y1) / 2)
    span = span and (round(span[0], 2), round(span[1], 2))
    if rows and rows[-1][2] == span:
        rows[-1][1] = y1
    else:
        rows.append([y, y1, span])
    y = y1
for y0, y1, span in rows:
    if span is None:
        door.append(along(0.0, DOOR_LEN, y0, y1, 1.0, "black"))
    else:
        g0, g1 = span
        door.append(along(0.0, g0, y0, y1, 1.0, "black"))
        door.append(along(g1, DOOR_LEN, y0, y1, 1.0, "black"))
        door_glass.append(along(g0, g1, y0, y1, 0.2, "glass"))
door += [
    # The upright grab handle in the bulge by the front edge, with its lock at the top; hinges on
    # the rear edge
    along(0.6, 1.3, HANDLE_Y[0] + 0.4, HANDLE_Y[1] - 0.4, 0.4, "black", 0.6),
    along(0.75, 1.15, HANDLE_Y[1] - 1.0, HANDLE_Y[1] - 0.7, 0.1, "steel", 0.85),
    along(DOOR_LEN - 0.6, DOOR_LEN - 0.2, 29.0, 30.2, 0.3, "frame", 0.6),
    along(DOOR_LEN - 0.6, DOOR_LEN - 0.2, 40.0, 41.2, 0.3, "frame", 0.6),
]
cab += door
door_left = [mirrored(c) for c in door]
DOOR_HINGE = [-DOOR_B[0], 0.0, DOOR_B[1]]  # the door's rear edge
cab.append(box(-CHAMFER_X, CAB_FLOOR, CAB_FRONT, CHAMFER_X, WIN_FRONT_BOTTOM, CAB_FRONT + 1.0, "black"))
cab.append(box(-CHAMFER_X, WIN_TOP, CAB_FRONT, CHAMFER_X, CAB_ROOF, CAB_FRONT + 1.0, "black"))
cab.append(box(-CAB_HALF + 1.2, CAB_FLOOR, CAB_REAR - 1.0, CAB_HALF - 1.2, BELT_LINE, CAB_REAR, "black"))
cab.append(box(-CAB_HALF + 1.2, WIN_TOP, CAB_REAR - 1.0, CAB_HALF - 1.2, CAB_ROOF, CAB_REAR, "black"))
cab.append(box(-0.4, BELT_LINE, CAB_REAR - 1.0, 0.4, WIN_TOP, CAB_REAR - 0.2, "black"))  # rear window mullion
# Outside mirrors on arms from the doors' bend
mirror_arm = [box(CAB_HALF, 37.4, CHAMFER_Z, CAB_HALF + 1.8, 37.8, CHAMFER_Z + 0.4, "black"),
              box(CAB_HALF + 1.6, 34.0, CHAMFER_Z - 0.2, CAB_HALF + 2.0, 39.4, CHAMFER_Z + 1.0, "black"),
              box(CAB_HALF + 1.55, 34.4, CHAMFER_Z + 1.0, CAB_HALF + 1.95, 39.0, CHAMFER_Z + 1.05, "steel")]
cab += mirror_arm
door_left += [mirrored(c) for c in mirror_arm]

# Glass, in its own bone so only it is alpha-blended. The door glass is cut in rows so its rear
# edge follows the door's leaning lower edge.
glass.append(box(-CENTER_GAP, CONSOLE_TOP, CAB_FRONT + 0.3, CENTER_GAP, WIN_TOP, CAB_FRONT + 0.5, "glass"))
glass += door_glass
door_left_glass = [mirrored(c) for c in door_glass]
glass += both([box(CAB_HALF - 0.6, BELT_LINE, REAR_WIN_Z[0], CAB_HALF - 0.4, WIN_TOP, REAR_WIN_Z[1], "glass")])
glass.append(box(-CAB_HALF + 1.2, BELT_LINE, CAB_REAR - 0.6, CAB_HALF - 1.2, WIN_TOP, CAB_REAR - 0.4, "glass"))
body += cab

# --- Cab interior --------------------------------------------------------------
inside = []
IN_X = CAB_HALF - 1.0
HEADLINER = WIN_TOP - 0.3
inside += trapezoid(CHAMFER_X, IN_X, CAB_FRONT + 1.0, CHAMFER_Z + 0.6, CAB_REAR - 1.0, HEADLINER, CAB_ROOF, "headliner")
inside.append(box(-3.0, HEADLINER - 0.4, 20.0, 3.0, HEADLINER, 26.0, "headliner"))  # center console bulge
# The molded headliner steps down into a header over the windshield and soffits along both sides,
# after the owner's cab photo.
# The header over the windshield follows the trapezoid, so it stays inside the angled panes.
for z0, z1, depth in ((CAB_FRONT + 1.0, CAB_FRONT + 1.6, 1.0), (CAB_FRONT + 1.6, CAB_FRONT + 2.2, 1.0),
                      (CAB_FRONT + 2.2, CAB_FRONT + 3.0, 0.5)):
    w = floor_half(z0) - 0.4
    inside.append(box(-w, HEADLINER - depth, z0, w, HEADLINER, z1, "headliner"))
# Thick side soffits stepping down to the side windows, lowest at the front corners, with a dark
# seam where they meet the raised center panel
inside += both([box(IN_X - 1.8, HEADLINER - 1.5, CHAMFER_Z, IN_X, HEADLINER, CAB_REAR - 1.0, "headliner"),
                box(IN_X - 2.8, HEADLINER - 0.9, CHAMFER_Z, IN_X - 1.8, HEADLINER, CAB_REAR - 1.0, "headliner"),
                box(IN_X - 3.6, HEADLINER - 0.4, CHAMFER_Z, IN_X - 2.8, HEADLINER, CAB_REAR - 1.0, "headliner"),
                box(IN_X - 3.65, HEADLINER - 0.45, CHAMFER_Z + 1.0, IN_X - 3.55, HEADLINER - 0.35, CAB_REAR - 3.0, "interior_dark"),
                box(IN_X - 2.4, HEADLINER - 2.2, CHAMFER_Z, IN_X, HEADLINER - 1.5, CHAMFER_Z + 4.0, "headliner"),
                box(IN_X - 1.6, HEADLINER - 2.7, CHAMFER_Z, IN_X, HEADLINER - 2.2, CHAMFER_Z + 2.6, "headliner")])
# The back of the cab, after the owner's photo looking back from the seat: the headliner drops into
# a thick molded header over the rear window with an air vent at its left end; a tall gray cover
# over the electrical panel hangs in the right rear corner, with a latch knob and a coat hook
# beside it; a bolted black bracket and a cable run on the left rear pillar.
REAR_IN = CAB_REAR - 1.0
inside.append(box(-IN_X, HEADLINER - 1.2, REAR_IN - 2.4, IN_X, HEADLINER, REAR_IN, "headliner"))
inside.append(box(-IN_X, HEADLINER - 1.9, REAR_IN - 1.2, IN_X, HEADLINER - 1.2, REAR_IN, "headliner"))
inside.append(box(-IN_X + 0.4, HEADLINER - 1.8, REAR_IN - 1.25, -IN_X + 3.4, HEADLINER - 1.4, REAR_IN - 1.2, "black"))
PANEL = (IN_X - 4.4, IN_X - 0.3, 33.6, HEADLINER - 1.9, REAR_IN - 2.4, REAR_IN - 0.2)
px0, px1, py0, py1, pz0, pz1 = PANEL
inside.append(box(px0, py0, pz0 + 0.4, px1, py1, pz1, "interior"))
inside.append(box(px0 + 0.3, py0 + 0.4, pz0, px1 - 0.3, py1 - 0.5, pz0 + 0.4, "interior"))
inside.append(box(px0 + 0.6, py0 + 0.8, pz0 - 0.05, px1 - 0.6, py1 - 1.8, pz0, "interior_dark"))  # door seam
inside.append(box(px0 + 0.7, py0 + 0.9, pz0 - 0.06, px1 - 0.7, py1 - 1.9, pz0 - 0.04, "interior"))
inside += disc("z", px1 - 1.4, py1 - 1.0, pz0 - 0.2, 0.45, 0.2, "black", STEPS_8)  # latch knob
inside.append(box(px1 - 2.2, py0 + 4.6, pz0 - 0.07, px1 - 1.6, py0 + 5.2, pz0 - 0.05, "liner"))  # label
inside += [box(px0 - 0.9, 40.6, pz0 + 0.6, px0 - 0.6, 42.0, pz0 + 1.0, "black"),  # coat hook
           box(px0 - 0.9, 40.6, pz0 + 0.0, px0 - 0.6, 40.9, pz0 + 1.0, "black"),
           box(px0 - 0.9, 40.6, pz0 + 0.0, px0 - 0.6, 41.2, pz0 + 0.3, "black")]
inside.append(box(IN_X - 0.5, 26.0, REAR_IN - 0.9, IN_X - 0.2, py0, REAR_IN - 0.5, "black"))  # cable run
inside.append(box(-IN_X, 28.6, REAR_IN - 0.4, -IN_X + 1.2, 40.0, REAR_IN, "black"))  # bracket
for by in (29.4, 32.6, 36.0, 39.2):
    inside.append(box(-IN_X + 0.4, by, REAR_IN - 0.5, -IN_X + 0.8, by + 0.4, REAR_IN - 0.4, "steel"))
for k in range(3):
    cx = -IN_X + 0.3 + k * 0.3
    inside.append(box(cx, 25.4, REAR_IN - 0.7, cx + 0.2, 28.6, REAR_IN - 0.5, "black"))
# Lower trim panels under the rear side windows and the rear window
inside += both([box(IN_X - 0.4, CAB_FLOOR, 18.4, IN_X, BELT_LINE - 0.6, REAR_WIN_Z[1], "interior")])
inside.append(box(-IN_X, CAB_FLOOR, CAB_REAR - 1.4, IN_X, BELT_LINE, CAB_REAR - 1.0, "interior"))
# Seat: air-suspension base, cushion, tall backrest with headrest
SEAT_FRONT, SEAT_BACK = 19.0, 25.2
# Air suspension under the seat: a stack of black bellows rings, and a red fire extinguisher
# strapped ahead of it
for k in range(4):
    inset = 0.0 if k % 2 == 0 else 0.4
    inside.append(box(-2.6 + inset, CAB_FLOOR + 0.2 + k * 0.85, SEAT_FRONT + 1.0 + inset, 2.6 - inset,
                      CAB_FLOOR + 1.05 + k * 0.85, SEAT_BACK - inset, "black" if k % 2 == 0 else "frame"))
inside += disc("x", -1.6, 26.4, SEAT_FRONT + 0.2, 0.7, 3.0, "red", STEPS_8)
inside.append(box(-0.4, 26.9, SEAT_FRONT - 0.2, 0.4, 27.6, SEAT_FRONT + 0.6, "black"))
inside.append(box(-3.2, 27.6, SEAT_FRONT + 0.6, 3.2, 28.6, SEAT_BACK + 0.2, "black"))
# Seat, after the owner's photos: a fabric cushion with a black front roll and raised sides, a black
# backrest shell with a fabric insert and shoulder bolsters, a separate padded headrest on two
# posts, and a yellow fore-and-aft adjuster loop with its latch plate under the cushion front.
seat.append(box(-4.4, 28.6, SEAT_FRONT, 4.4, 29.8, SEAT_BACK, "seat"))
seat.append(box(-3.6, 29.8, SEAT_FRONT + 0.9, 3.6, 30.6, SEAT_BACK - 0.2, "seat_fabric"))
seat.append(box(-3.6, 29.8, SEAT_FRONT, 3.6, 30.4, SEAT_FRONT + 0.9, "seat"))  # front roll
seat += both([box(3.6, 29.8, SEAT_FRONT, 4.4, 31.0, SEAT_BACK, "seat_fabric")])  # raised sides
seat.append(box(-3.6, 30.6, SEAT_FRONT + 3.2, 3.6, 30.65, SEAT_FRONT + 3.4, "seat"))  # stitch line
back_pivot = [0, 30.4, SEAT_BACK]
RECLINE = [-8, 0, 0]
seat.append(box(-4.4, 30.4, SEAT_BACK, 4.4, 39.6, SEAT_BACK + 1.6, "seat", RECLINE, back_pivot))  # shell
seat.append(box(-3.2, 31.0, SEAT_BACK - 0.4, 3.2, 39.0, SEAT_BACK, "seat_fabric", RECLINE, back_pivot))
seat.append(box(-3.2, 35.0, SEAT_BACK - 0.45, 3.2, 35.15, SEAT_BACK - 0.4, "seat", RECLINE, back_pivot))
seat += both([box(3.2, 31.0, SEAT_BACK - 0.9, 4.4, 37.6, SEAT_BACK, "seat", RECLINE, back_pivot),  # side bolsters
              box(3.6, 37.6, SEAT_BACK - 0.5, 4.4, 39.6, SEAT_BACK, "seat", RECLINE, back_pivot),
              box(1.4, 39.6, SEAT_BACK + 0.5, 1.8, 40.4, SEAT_BACK + 0.9, "steel", RECLINE, back_pivot)])  # posts
seat.append(box(-2.8, 40.4, SEAT_BACK - 0.1, 2.8, 42.6, SEAT_BACK + 1.3, "seat_fabric", RECLINE, back_pivot))  # headrest
seat.append(box(-2.4, 42.6, SEAT_BACK + 0.1, 2.4, 42.9, SEAT_BACK + 1.1, "seat_fabric", RECLINE, back_pivot))
seat += both([box(2.8, 40.6, SEAT_BACK + 0.1, 3.0, 42.4, SEAT_BACK + 1.3, "seat", RECLINE, back_pivot)])
# Orange seat belt halves coming out at the foot of the backrest, the buckle with its red release on
# the right, after the owner's close-up of the seat
seat += both([box(4.0, 30.6, SEAT_BACK - 1.4, 4.5, 33.4, SEAT_BACK - 0.9, "belt")])
seat.append(box(4.5, 30.4, SEAT_BACK - 2.0, 5.3, 32.0, SEAT_BACK - 0.8, "black"))
seat.append(box(4.6, 31.4, SEAT_BACK - 2.1, 5.2, 31.9, SEAT_BACK - 1.9, "red"))
# Adjuster loop: two arms out of the base and a cross bar ahead of the cushion, with a latch plate
seat += both([box(2.2, 27.4, SEAT_FRONT - 1.0, 2.6, 27.8, SEAT_FRONT + 1.6, "button")])
seat.append(box(-2.6, 27.4, SEAT_FRONT - 1.4, 2.6, 27.8, SEAT_FRONT - 1.0, "button"))
seat.append(box(-0.9, 27.6, SEAT_FRONT - 0.2, 0.9, 28.6, SEAT_FRONT + 0.1, "button"))
seat.append(box(-0.5, 27.9, SEAT_FRONT - 0.25, 0.5, 28.3, SEAT_FRONT - 0.2, "black"))
# Armrests with a joystick at the front of each: steering on the left, blade on the right
# The two controllers, after the owner's photos: a gray console pod on each armrest, the console's own color, a stepped
# rubber boot, a black grip leaning forward, and a red lever on the inner side. The left (steering)
# grip has a yellow thumb wheel; the right (blade) grip a yellow button cap.


def controller(cx, left):
    inward = 1 if cx < 0 else -1
    cz = SEAT_FRONT + 0.6
    # The gray pod carries the stick; behind it a black padded armrest with rounded edges sits a
    # little higher, level with the seat's side bolsters, as in the owner's photos.
    pad_front = SEAT_FRONT + 2.0
    out = [box(cx - 1.4, 33.0, SEAT_FRONT - 1.4, cx + 1.4, 34.4, pad_front, "interior"),
           box(cx - 1.2, 34.4, SEAT_FRONT - 1.2, cx + 1.2, 34.6, pad_front, "interior"),
           box(cx - 1.2, 33.0, pad_front, cx + 1.2, 34.2, SEAT_BACK - 0.6, "interior"),
           box(cx - 1.3, 34.2, pad_front, cx + 1.3, 35.2, SEAT_BACK, "seat"),
           box(cx - 1.1, 35.2, pad_front + 0.2, cx + 1.1, 35.5, SEAT_BACK - 0.2, "seat"),
           box(cx - 1.3, 34.2, pad_front - 0.2, cx + 1.3, 35.0, pad_front, "seat"),
           box(cx - 1.0, 35.5, pad_front + 0.4, cx + 1.0, 35.52, SEAT_BACK - 0.4, "seat_fabric")]
    for i, half in enumerate((1.0, 0.85, 0.7, 0.55)):
        out.append(box(cx - half, 34.6 + i * 0.35, cz - half, cx + half, 34.95 + i * 0.35, cz + half,
                       "black" if i % 2 == 0 else "frame"))
    pivot = [cx, 36.0, cz]
    # The grip leans 30 degrees back and 30 degrees in toward the driver, slim and short (the owner's request).
    # A positive z turn written here tips the top toward -x in this frame, so each side turns its
    # grip toward the seat.
    turn = [30, 0, 30 if cx > 0 else -30]
    out.append(box(cx - 0.22, 36.0, cz - 0.25, cx + 0.22, 37.0, cz + 0.25, "black", turn, pivot))
    out.append(box(cx - 0.28, 37.0, cz - 0.35, cx + 0.28, 37.3, cz + 0.3, "black", turn, pivot))
    if left:
        out.append(box(cx - 0.05, 37.2, cz - 0.5, cx + 0.05, 37.45, cz - 0.2, "button", turn, pivot))
    else:
        out.append(box(cx - 0.25, 37.3, cz - 0.35, cx + 0.25, 37.42, cz + 0.2, "button", turn, pivot))
        out.append(box(cx - 0.1, 37.42, cz - 0.2, cx + 0.1, 37.47, cz - 0.05, "black", turn, pivot))
        out.append(box(cx - 1.0, 34.6, cz + 1.0, cx - 0.4, 34.65, cz + 1.6, "steel"))  # label
    return out


inside += controller(-5.4, True) + controller(5.4, False)
# A small ball-knob lever on the outer edge of the left console, and grooves on the right armrest
inside += [box(-7.25, 33.0, SEAT_FRONT + 0.4, -6.95, 35.0, SEAT_FRONT + 0.7, "frame"),
           box(-7.45, 35.0, SEAT_FRONT + 0.25, -6.75, 35.7, SEAT_FRONT + 0.85, "black")]
for k in range(2):
    inside.append(box(6.7, 34.5, SEAT_FRONT + 3.0 + k * 1.6, 6.75, 34.9, SEAT_FRONT + 4.2 + k * 1.6, "interior_dark"))
inside.append(box(4.4, CAB_FLOOR + 0.2, SEAT_FRONT - 0.4, 7.4, 33.0, SEAT_BACK - 0.6, "interior"))  # right console
inside.append(box(5.2, 32.6, SEAT_FRONT + 2.0, 7.2, 33.0, SEAT_BACK - 2.0, "interior_dark"))
inside.append(box(-7.4, CAB_FLOOR + 0.2, SEAT_FRONT - 0.4, -4.4, 33.0, SEAT_BACK - 0.6, "interior"))  # left console
# Right wall switch panel, drink holder at the right rear, storage box at the left rear
inside.append(box(IN_X - 0.6, 29.4, 19.4, IN_X - 0.4, 33.0, 25.0, "interior_dark"))
for i in range(6):
    inside.append(box(IN_X - 0.7, 31.6 - (i % 2) * 1.4, 20.0 + (i // 2) * 1.6, IN_X - 0.6,
                      32.2 - (i % 2) * 1.4, 20.8 + (i // 2) * 1.6, "button" if i == 0 else "frame"))
inside.append(box(7.4, CAB_FLOOR + 0.2, 26.0, IN_X - 0.4, 32.0, CAB_REAR - 1.4, "interior"))
inside += disc("y", 9.2, 31.8, 28.0, 0.9, 0.3, "black", STEPS_8)
inside.append(box(8.4, 31.9, 29.6, IN_X - 0.9, 32.1, 30.6, "black"))  # phone pocket
# A deep tray in the right console's top, a coiled cord lying in it
inside.append(box(7.8, 31.0, 26.4, IN_X - 0.8, 32.05, 27.5, "interior_dark"))
for k in range(5):
    inside.append(box(8.2 + k * 0.45, 32.05, 26.7, 8.45 + k * 0.45, 32.3, 27.2, "cord"))
inside.append(box(-IN_X + 0.4, CAB_FLOOR + 0.2, 26.0, -7.0, 31.0, CAB_REAR - 1.4, "interior"))
inside.append(box(-IN_X + 0.6, 31.0, 26.3, -7.2, 31.2, CAB_REAR - 1.7, "interior_dark"))
# Floor, after the owner's photo: a low hump at the console's foot, a ribbed foot pedal on each
# side of it, and the long decelerator pedal on the right, angled out.
inside.append(box(-2.4, CAB_FLOOR + 0.2, CAB_FRONT + 2.4, 2.4, CAB_FLOOR + 1.0, CAB_FRONT + 5.0, "black"))
inside.append(box(-2.0, CAB_FLOOR + 1.0, CAB_FRONT + 2.4, 2.0, CAB_FLOOR + 1.3, CAB_FRONT + 4.6, "black"))
for sx in (-1, 1):
    px = sx * 3.6
    pivot = [px, CAB_FLOOR + 0.2, CAB_FRONT + 6.6]
    inside.append(box(px - 1.0, CAB_FLOOR + 0.2, CAB_FRONT + 5.8, px + 1.0, CAB_FLOOR + 0.9, CAB_FRONT + 7.4, "black", [-20, 0, 0], pivot))
    for k in range(3):
        inside.append(box(px - 0.8, CAB_FLOOR + 0.9, CAB_FRONT + 6.0 + k * 0.5, px + 0.8, CAB_FLOOR + 0.98, CAB_FRONT + 6.2 + k * 0.5,
                          "frame", [-20, 0, 0], pivot))
dec_pivot = [5.6, CAB_FLOOR + 0.2, CAB_FRONT + 4.6]
inside.append(box(5.0, CAB_FLOOR + 0.6, CAB_FRONT + 3.2, 6.2, CAB_FLOOR + 0.9, CAB_FRONT + 6.6, "black", [-15, -25, 0], dec_pivot))
inside.append(box(5.2, CAB_FLOOR + 0.9, CAB_FRONT + 3.4, 6.0, CAB_FLOOR + 0.95, CAB_FRONT + 6.4, "frame", [-15, -25, 0], dec_pivot))
inside.append(box(5.4, CAB_FLOOR + 0.2, CAB_FRONT + 5.8, 5.8, CAB_FLOOR + 0.8, CAB_FRONT + 6.2, "frame"))
# Display console between the center posts, after the owner's photo: below the center window it
# widens toward the floor and leans out toward the driver, so it reads as a trapezoid from the seat.
# The small upper display and the larger lower one sit on its slanted face; the lower part is a
# perforated panel with a key row.
# Seen from the side the console is a ">": the upper face carrying the displays slopes out from the
# glass toward the driver, it stands out furthest at the black band, and the lower part falls back
# toward the floor (the owner's side photo).
CONSOLE_NOSE, CONSOLE_FACE = 31.0, (CAB_FRONT + 1.0, CAB_FRONT + 4.6, CAB_FRONT + 2.4)  # z at top, nose, floor


def console_face(y):
    top, nose, floor = CONSOLE_FACE
    if y >= CONSOLE_NOSE:
        return nose + (top - nose) * (y - CONSOLE_NOSE) / (CONSOLE_TOP - CONSOLE_NOSE)
    return nose + (floor - nose) * (CONSOLE_NOSE - y) / (CONSOLE_NOSE - CONSOLE_BOTTOM)


def console_half(y):
    t = (CONSOLE_TOP - y) / (CONSOLE_TOP - CONSOLE_BOTTOM)
    return CENTER_GAP + 0.2 + 0.9 * t  # kept inside the angled panes at the floor


y = CONSOLE_BOTTOM
row = 0
while y < CONSOLE_TOP - 1e-6:
    y1 = min(y + 0.5, CONSOLE_TOP)
    zf, half = console_face((y + y1) / 2), console_half((y + y1) / 2)
    inside.append(box(-half, y, CAB_FRONT + 0.8, half, y1, zf, "black"))
    if CONSOLE_NOSE - 0.6 <= y < CONSOLE_NOSE:  # the band at the nose
        inside.append(box(-half - 0.05, y, zf - 0.6, half + 0.05, y1, zf + 0.05, "frame"))
    if y1 <= 28.6 and row % 2 == 0:  # perforations on the lower panel
        x = -half + 0.5 + (row // 2 % 2) * 0.4
        while x < half - 0.4:
            inside.append(box(x, y + 0.15, zf, x + 0.25, y + 0.4, zf + 0.05, "interior"))
            x += 0.8
    y, row = y1, row + 1


def on_face(y0, y1, half, thick, color, lift):
    """A plate lying on the console's slanted face from y0 to y1, raised lift off it."""
    p, q = (console_face(y0), y0), (console_face(y1), y1)
    return bar(p, q, -half, half, thick, color, offset=-(lift + thick / 2))


inside.append(on_face(31.3, 33.9, 2.6, 0.5, "frame", 0.0))  # lower, larger display
SCREEN_SPAN = (31.6, 33.6, 2.2)  # bottom y, top y, half-width; the cab monitor covers it too
inside.append(on_face(*SCREEN_SPAN, 0.08, "screen", 0.5))
for k in range(5):  # key row on the lower part
    kx = -1.6 + k * 0.8
    inside.append(bar((console_face(29.2), 29.2), (console_face(29.8), 29.8), kx, kx + 0.5, 0.15,
                      "button" if k == 2 else "interior", offset=-0.08))
# Center window frame: rounded corners and a grab bar along its bottom edge, over the console
for zx in (-1, 1):
    inside.append(box(zx * CENTER_GAP - (0.6 if zx > 0 else 0.0), WIN_TOP - 0.6, CAB_FRONT + 0.5,
                      zx * CENTER_GAP + (0.6 if zx < 0 else 0.0), WIN_TOP, CAB_FRONT + 1.0, "black"))
    inside.append(box(zx * CENTER_GAP - (0.6 if zx > 0 else 0.0), CONSOLE_TOP, CAB_FRONT + 0.5,
                      zx * CENTER_GAP + (0.6 if zx < 0 else 0.0), CONSOLE_TOP + 0.6, CAB_FRONT + 1.0, "black"))
inside.append(box(-CENTER_GAP, CONSOLE_TOP + 0.3, CAB_FRONT + 1.6, CENTER_GAP, CONSOLE_TOP + 0.8, CAB_FRONT + 2.1, "frame"))
inside += both([box(CENTER_GAP - 0.4, CONSOLE_TOP + 0.3, CAB_FRONT + 0.8, CENTER_GAP, CONSOLE_TOP + 0.8, CAB_FRONT + 2.1, "frame")])
# Grab handles on the driver's side of the center posts
inside += both([box(CENTER_GAP + 0.2, 33.6, CAB_FRONT + 1.9, CENTER_GAP + 0.6, 37.4, CAB_FRONT + 2.3, "black"),
                box(CENTER_GAP + 0.2, 33.6, CAB_FRONT + 1.0, CENTER_GAP + 0.6, 34.0, CAB_FRONT + 2.3, "black"),
                box(CENTER_GAP + 0.2, 37.0, CAB_FRONT + 1.0, CENTER_GAP + 0.6, 37.4, CAB_FRONT + 2.3, "black")])
inside.append(box(-4.0, 41.0, CAB_FRONT + 1.2, -3.4, 41.6, CAB_FRONT + 1.8, "frame"))  # microphone
inside.append(box(-3.85, 41.6, CAB_FRONT + 1.35, -3.55, HEADLINER, CAB_FRONT + 1.65, "frame"))
# Grab loops on both front pillars beside the driver, each with a curved hook above it, and an
# instruction plate on the right pillar
LOOP_X, LOOP_Z = IN_X - 2.0, DOOR_FRONT + 2.8
inside += both([box(LOOP_X - 0.2, 30.6, LOOP_Z, LOOP_X + 0.2, 36.6, LOOP_Z + 0.4, "black"),
                box(LOOP_X - 0.2, 30.6, LOOP_Z, IN_X, 31.0, LOOP_Z + 0.4, "black"),
                box(LOOP_X - 0.2, 36.2, LOOP_Z, IN_X, 36.6, LOOP_Z + 0.4, "black"),
                box(IN_X - 0.6, 38.4, LOOP_Z, IN_X, 38.8, LOOP_Z + 1.0, "black"),
                box(IN_X - 1.0, 38.4, LOOP_Z + 0.6, IN_X - 0.6, 40.2, LOOP_Z + 1.0, "black")])

# Gray covers over the pillars between the doors and the rear side windows, after the owner's
# photos from the seat. The left one carries four climate knobs in a black inset, a round vent, a
# switch block, a red button and the key switch; the right one a round vent, a speaker grille, the
# keypad, the parking brake and key switch, and a cup holder. Positions are along the cover (u,
# measured from its front edge).


def pillar_cover(side):
    # On the pillar between the door and the rear side window, flat on the side wall; the front
    # corner pillars stay plain black frames (the owner's request).
    a = (side * IN_X, DOOR_REAR - 0.6)
    b = (side * IN_X, B_PILLAR[1] + 1.6)
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    inward = side * -1  # offset sign that moves off the cover into the cab

    def at(u):
        return (a[0] + (b[0] - a[0]) * u / length, a[1] + (b[1] - a[1]) * u / length)

    def part(u0, u1, y0, y1, depth, color, lift=0.0):
        # u was laid out on a 2.55 px cover; stretch it to the cover's length
        u0, u1 = u0 * length / 2.55, u1 * length / 2.55
        (x0, z0), (x1, z1) = at(u0), at(u1)
        return corner_bar(x0, z0, x1, z1, y0, y1, depth, color, offset=inward * (lift + depth / 2))

    out = [part(0.0, 2.55, 30.0, HEADLINER - 0.8, 0.4, "liner"),
           part(0.3, 2.25, CAB_FLOOR + 2.0, 30.0, 0.4, "liner")]
    if side < 0:
        out.append(part(0.4, 1.7, 36.4, 42.2, 0.1, "black", 0.4))
        for k in range(4):
            out.append(part(0.75, 1.35, 36.9 + k * 1.35, 37.5 + k * 1.35, 0.35, "frame", 0.5))
        out.append(part(1.9, 2.4, 41.0, 41.6, 0.25, "black", 0.4))  # vent
        for k in range(4):
            out.append(part(0.6, 1.0, 32.6 + k * 0.7, 33.0 + k * 0.7, 0.15, "frame", 0.4))
            out.append(part(1.2, 1.6, 32.6 + k * 0.7, 33.0 + k * 0.7, 0.15, "button" if k == 3 else "frame", 0.4))
        out.append(part(0.7, 1.1, 31.4, 31.9, 0.2, "red", 0.4))
        out.append(part(1.3, 1.8, 30.6, 31.2, 0.3, "black", 0.4))  # key switch
    else:
        # Right: vent and speaker at the top, then the owner's close-up of the switch panel: a black
        # keypad of eight round buttons in two columns (lamps, idle, gear), a red parking brake
        # rocker beside a black one, and the round key switch with its orange segment.
        out.append(part(0.3, 0.8, 41.8, 42.4, 0.25, "black", 0.4))  # vent
        out.append(part(1.0, 2.3, 40.6, 42.4, 0.1, "black", 0.4))  # speaker grille
        out.append(part(0.6, 2.1, 34.6, 40.0, 0.12, "black", 0.4))  # keypad
        for row in range(4):
            for col in range(2):
                u0, y0 = 0.75 + col * 0.72, 39.0 - row * 1.25
                out.append(part(u0, u0 + 0.55, y0, y0 + 0.75, 0.12, "frame", 0.52))
                if (row, col) not in ((1, 0), (1, 1), (2, 1)):  # the blank caps carry no icon
                    out.append(part(u0 + 0.18, u0 + 0.37, y0 + 0.25, y0 + 0.5, 0.03, "liner", 0.64))
        out.append(part(0.75, 1.25, 32.9, 34.0, 0.3, "red", 0.4))  # parking brake
        out.append(part(1.45, 1.95, 32.9, 34.0, 0.3, "black", 0.4))
        out.append(part(0.8, 1.9, 31.0, 32.5, 0.1, "black", 0.4))  # key switch ring
        out.append(part(0.8, 1.15, 31.9, 32.5, 0.05, "orange", 0.5))
        out.append(part(1.15, 1.55, 31.4, 32.0, 0.35, "frame", 0.5))
        out.append(part(1.28, 1.42, 31.5, 31.9, 0.1, "steel", 0.85))
        out.append(part(0.9, 2.1, 28.2, 30.0, 0.9, "liner", 0.4))  # cup holder
        out.append(part(1.1, 1.9, 29.8, 30.05, 0.6, "black", 0.5))
    return out


inside += pillar_cover(1) + pillar_cover(-1)
# Overhead console behind the mirror: a black radio panel with three knobs and a display
inside.append(box(-3.2, HEADLINER - 1.3, CAB_FRONT + 2.2, 3.2, HEADLINER - 0.5, CAB_FRONT + 3.4, "black"))
for kx in (-2.5, -1.7, -0.9):
    inside += disc("z", kx, HEADLINER - 0.9, CAB_FRONT + 3.4, 0.3, 0.15, "steel", STEPS_8)
inside.append(box(-0.3, HEADLINER - 1.15, CAB_FRONT + 3.4, 2.8, HEADLINER - 0.65, CAB_FRONT + 3.45, "screen"))
body += inside


def mirror_x(bones):
    """Mirror the build frame (+x right) into the game's frame (+x left)."""
    for bone in bones:
        bone["pivot"] = [-bone["pivot"][0], *bone["pivot"][1:]]
        for c in bone.get("cubes", []):
            c["origin"] = [-(c["origin"][0] + c["size"][0]), *c["origin"][1:]]
            if "pivot" in c:
                c["pivot"] = [-c["pivot"][0], *c["pivot"][1:]]
                rx, ry, rz = c["rotation"]
                # The game turns z the other way from the right-handed math the cubes are built
                # with, so z stays as written (ADR 0058).
                c["rotation"] = [rx, -ry, rz]
    return bones


def rounded(value):
    if isinstance(value, float):
        return round(value, 3) + 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


bones = mirror_x([
    {"name": "root", "pivot": [0, 0, 0]},
    {"name": "body", "parent": "root", "pivot": [0, 0, 0], "cubes": body, "locators": {"thruster": THRUSTER}},
    {"name": "blade_rig", "parent": "body", "pivot": [0, ARM_REAR[1], ARM_REAR[0]], "cubes": blade_rig},
    {"name": "blade", "parent": "blade_rig", "pivot": [0, 0, BLADE_FRONT], "cubes": blade},
    {"name": "lift_cylinder_r", "parent": "body", "pivot": [LIFT_X, LIFT_Y, LIFT_PIN], "cubes": lift_cylinder},
    {"name": "lift_cylinder_l", "parent": "body", "pivot": [-LIFT_X, LIFT_Y, LIFT_PIN],
     "cubes": [mirrored(c) for c in lift_cylinder]},
    {"name": "lift_rod_r", "parent": "lift_cylinder_r", "pivot": [LIFT_X, LIFT_Y, LIFT_MOUTH], "cubes": [lift_rod]},
    {"name": "lift_rod_l", "parent": "lift_cylinder_l", "pivot": [-LIFT_X, LIFT_Y, LIFT_MOUTH],
     "cubes": [mirrored(lift_rod)]},
    {"name": "headlights", "parent": "body", "pivot": [0, 0, 0], "cubes": lamps},
    {"name": "beacon", "parent": "body", "pivot": [0, 0, 0], "cubes": beacon},
    {"name": "seat_0", "parent": "body", "pivot": [0, 28.6, 22.0], "cubes": seat},
    *[{"name": f"track_{side}_{k}", "parent": "body", "pivot": [0, 0, 0],
       "cubes": cubes if side == "r" else [mirrored(c) for c in cubes]}
      for side in ("r", "l") for k, cubes in enumerate(grousers)],
    *[{"name": f"{name}_{side}", "parent": "body",
       "pivot": [(wheel_x if side == "r" else -wheel_x), WHEEL_CENTERS[name][1], WHEEL_CENTERS[name][0]],
       "cubes": cubes if side == "r" else [mirrored(c) for c in cubes]}
      for side in ("r", "l") for name, cubes in wheels.items()],
    {"name": "propeller", "parent": "body", "pivot": PROP_PIVOT, "cubes": propeller},
    {"name": "door_l", "parent": "body", "pivot": DOOR_HINGE, "cubes": door_left},
    {"name": "glass", "parent": "body", "pivot": [0, 0, 0], "cubes": glass},
    {"name": "door_glass", "parent": "door_l", "pivot": DOOR_HINGE, "cubes": door_left_glass},
])
geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [{
        "description": {
            "identifier": "geometry.yasu_ride.bulldozer",
            "texture_width": len(SLOTS), "texture_height": 1,
            "visible_bounds_width": 7, "visible_bounds_height": 5,
            "visible_bounds_offset": [0, 1.5, 0],
        },
        "bones": bones,
    }],
}
emit(MODELS / "bulldozer.geo.json", json.dumps(rounded(geo), separators=(",", ":")))


def png(path, width, height, pixel):
    raw = b"".join(b"\x00" + b"".join(bytes(pixel(x, y)) for x in range(width)) for y in range(height))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    emit(path, b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


# Variant 0, khaki on the SUV, is yellow here, so a new bulldozer is yellow (ADR 0076); khaki writes bulldozer.png, the others bulldozer_<paint>.png.
BODY_PAINTS: dict[str, tuple[int, int, int]] = {
    "khaki": PALETTE["yellow"][:3],
    "green": (62, 96, 56),
    "red": (128, 22, 26),
    "white": (222, 222, 216),
    "light_gray": (156, 156, 152),
    "gray": (92, 94, 98),
    "black": (34, 34, 36),
    "orange": (190, 92, 28),
    "yellow": PALETTE["yellow"][:3],
    "lime": (112, 160, 42),
    "cyan": (30, 118, 124),
    "light_blue": (92, 150, 204),
    "blue": (40, 58, 128),
    "purple": (94, 46, 128),
    "magenta": (160, 52, 140),
    "pink": (214, 132, 162),
}


def scale(color, factor):
    return tuple(max(0, min(255, math.floor(c * factor + 0.5))) for c in color)


def lighten(color, t):
    return tuple(math.floor(c + (255 - c) * t + 0.5) for c in color)


for paint, base in BODY_PAINTS.items():
    colors = dict(PALETTE)
    if base != PALETTE["yellow"][:3]:
        colors.update(
            yellow=(*base, 255),
            yellow_dark=(*scale(base, 0.86), 255),
            louver=(*scale(base, 0.71), 255),
            yellow_light=(*lighten(base, 0.25), 255),
        )
    name = "bulldozer" if paint == "khaki" else f"bulldozer_{paint}"
    png(ENTITY_TEXTURES / f"{name}.png", len(SLOTS), 1, lambda x, y: colors[SLOTS[x]])

ICON = [
    "................",
    "................",
    ".......YYYYYY...",
    ".......YGGGGY...",
    ".......YGGGGY...",
    ".......YGGGGY...",
    ".......YYYYYY...",
    "....YYYYYYYYY...",
    ".D..YYYYYYYYYY..",
    ".D..YYYYYYYYYY..",
    ".DYYYYDDDDDDDD..",
    ".D..KKKKKKKKKK..",
    ".D.KTTTTTTTTTTK.",
    "...KTTTTTTTTTTK.",
    "....KKKKKKKKKK..",
    "................",
]
ICON_COLORS = {
    "Y": PALETTE["yellow"],
    "D": PALETTE["yellow_dark"],
    "K": PALETTE["black"],
    "T": PALETTE["shoe"],
    "G": PALETTE["glass"][:3] + (255,),
    ".": (0, 0, 0, 0),
}
png(ITEM_TEXTURES / "bulldozer_item.png", 16, 16, lambda x, y: ICON_COLORS[ICON[y][x]])

# Blade Up/Down switch icon: the yellow blade between an up and a down arrow (ADR 0138).
BLADE_SWITCH_ICON = [
    "................",
    ".......KK.......",
    "......KKKK......",
    ".....KKKKKK.....",
    ".......KK.......",
    "..DYYYYYYYYYYD..",
    "..DYYYYYYYYYYD..",
    "..DYYYYYYYYYYD..",
    "..DDDDDDDDDDDD..",
    "................",
    ".......KK.......",
    ".....KKKKKK.....",
    "......KKKK......",
    ".......KK.......",
    "................",
    "................",
]
png(
    ITEM_TEXTURES / "blade_switch.png",
    16,
    16,
    lambda x, y: ICON_COLORS[BLADE_SWITCH_ICON[y][x]],
)

print("cubes:", sum(len(b.get("cubes", [])) for b in bones))

MONITOR_CELL = (48, 32)
MONITOR_LIFT = 0.66
MONITOR_THICK = 0.02
MONITOR_FACE = "down"
# Seen in game from seat 0: the down face needs both u and v reversed, or the
# label reads mirrored with the icon on the right (ADR 0139).
MONITOR_UV_FLIP = (True, True)
MONITOR_BG = PALETTE["screen"]
# Alpha 0 texels glow under lamp_lit, which is entity_emissive (ADR 0020).
MONITOR_FG = (200, 236, 248, 0)
MONITOR_ICON_AT = (2, 8)
MONITOR_LABEL_X, MONITOR_LABEL_Y, MONITOR_LABEL_WIDTH = 21, 12, 25
GLYPH_ADVANCE = 6  # a 5 px glyph and 1 px of letter spacing
FONT_5X7 = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    " ": ["00000"] * 7,
}
MONITOR_ICONS = {"blade_switch": BLADE_SWITCH_ICON}


def monitor_icon_color(code):
    if code == ".":
        return MONITOR_BG
    if code == "K":  # black arrows would vanish on the dark screen
        return MONITOR_FG
    return ICON_COLORS[code][:3] + (0,)


def monitor_cell(screen):
    """One screen of the atlas: the tool's icon on the left and its label centered on the right."""
    label, item = screen["label"], screen["item"]
    label_width = len(label) * GLYPH_ADVANCE - 1
    if label_width > MONITOR_LABEL_WIDTH:
        raise ValueError(f"Monitor label exceeds {MONITOR_LABEL_WIDTH} px: {label}")
    if any(char not in FONT_5X7 for char in label):
        raise ValueError(f"Missing monitor glyph: {label}")
    if item not in MONITOR_ICONS:
        raise ValueError(f"Missing monitor icon: {item}")
    cell = [[MONITOR_BG for _ in range(MONITOR_CELL[0])] for _ in range(MONITOR_CELL[1])]
    icon_x, icon_y = MONITOR_ICON_AT
    for y, row in enumerate(MONITOR_ICONS[item]):
        for x, code in enumerate(row):
            cell[icon_y + y][icon_x + x] = monitor_icon_color(code)
    label_x = MONITOR_LABEL_X + (MONITOR_LABEL_WIDTH - label_width) // 2
    for letter, char in enumerate(label):
        for y, row in enumerate(FONT_5X7[char]):
            for x, pixel in enumerate(row):
                if pixel == "1":
                    cell[MONITOR_LABEL_Y + y][label_x + letter * GLYPH_ADVANCE + x] = MONITOR_FG
    return cell


def monitor_plate():
    return on_face(*SCREEN_SPAN, MONITOR_THICK, "screen", MONITOR_LIFT)


def monitor_uv(k):
    """The UV of cell k on MONITOR_FACE only, so the other faces are not drawn."""
    uv = [0, MONITOR_CELL[1] * k]
    uv_size = list(MONITOR_CELL)
    for axis, flip in enumerate(MONITOR_UV_FLIP):
        if flip:
            uv[axis] += uv_size[axis]
            uv_size[axis] *= -1
    return {MONITOR_FACE: {"uv": uv, "uv_size": uv_size}}


def check_monitor_faces_seat():
    # bar maps +y to the console's inward normal under Bedrock's x rotation sign (ADR 0051).
    bottom, top, _ = SCREEN_SPAN
    dy, dz = top - bottom, console_face(top) - console_face(bottom)
    length = math.hypot(dy, dz)
    inward = (0, dz / length, -dy / length)
    face_sign = {"up": 1, "down": -1}[MONITOR_FACE]
    outward = tuple(face_sign * v for v in inward)
    seat_pivot = next(b["pivot"] for b in bones if b["name"] == "seat_0")
    plate_pivot = monitor_plate()["pivot"]
    if sum(n * (s - p) for n, s, p in zip(outward, seat_pivot, plate_pivot)) <= 0:
        raise ValueError("Monitor face must point toward seat_0")


check_monitor_faces_seat()
screens = json.loads(Path(__file__).with_name("monitor_screens.json").read_text())["bulldozer"]
cells = [monitor_cell(screen) for screen in screens]
monitor_bones = [
    {"name": f"screen_{screen['item']}_{screen['state']}", "pivot": [0, 0, 0],
     "cubes": [{**monitor_plate(), "uv": monitor_uv(k)}]}
    for k, screen in enumerate(screens)
]

monitor_geo = {
    "format_version": geo["format_version"],
    "minecraft:geometry": [{
        "description": {**geo["minecraft:geometry"][0]["description"],
                        "identifier": "geometry.yasu_ride.bulldozer_monitor",
                        "texture_width": MONITOR_CELL[0], "texture_height": MONITOR_CELL[1] * len(screens)},
        "bones": mirror_x(monitor_bones),
    }],
}
emit(MODELS / "bulldozer_monitor.geo.json", json.dumps(rounded(monitor_geo), separators=(",", ":")))
png(ENTITY_TEXTURES / "bulldozer_monitor.png", MONITOR_CELL[0], MONITOR_CELL[1] * len(screens),
    lambda x, y: cells[y // MONITOR_CELL[1]][y % MONITOR_CELL[1]][x])
emit(RP / "render_controllers/yasu_ride/bulldozer_monitor.rc.json", json.dumps({
    "format_version": "1.8.0",
    "render_controllers": {"controller.render.yasu_ride.bulldozer.monitor": {
        "geometry": "Geometry.monitor", "materials": [{"*": "Material.lamp_lit"}],
        "textures": ["Texture.monitor"],
        "part_visibility": [{"*": False}, *[
            {bone["name"]: f"query.property('yasu_ride:monitor') == {k + 1}"}
            for k, bone in enumerate(monitor_bones)
        ]],
    }},
}, separators=(",", ":")))
if STALE:
    sys.exit("Stale bulldozer outputs:\n" + "\n".join(STALE))
