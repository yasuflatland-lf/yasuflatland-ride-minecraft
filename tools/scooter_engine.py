"""Compact casting and pressed exhaust in the frozen scooter spike frame."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

kit = load_tool("scooter_kit")
atlas = load_tool("scooter_atlas")
tilt = load_tool("cube_tilt")

AREA = "engine"
BONE = "body"
CAST_OFFSET_X = 0.8
PANEL_THICKNESS = 0.04
CAST_COLOR = (179, 187, 183)
FIN_COLOR = (38, 42, 42)
STEEL_COLOR = (57, 60, 62)
SEAM_COLOR = (67, 71, 73)
SURFACE_COLORS = {"engine_cast": CAST_COLOR, "engine_fin": FIN_COLOR,
                  "engine_steel": STEEL_COLOR, "engine_seam": SEAM_COLOR,
                  "chrome": CAST_COLOR}
TEXELS = 32
OUTLINE_DENSITY = 16
MASK_COLUMNS = 8
MASK_GUTTER = 2
SHADE_BASE = 0.75
SHADE_RANGE = 0.25
FAN_CENTER = (10.65, 5.25)
FAN_RINGS = ((0.75, 1.32), (1.55, 1.35), (1.86, 1.4))
FAN_SEGMENTS = 16
FAN_BACK_X = 0.77
FAN_FACE_X = 1.89
FAN_RADIUS = 1.4
FAN_TEXELS = 128
FAN_SLOTS = 20
FAN_SLOT_INNER = 0.42
FAN_SLOT_OUTER = 0.85
FAN_SLOT_WIDTH = 0.055
FAN_HUB_RADIUS = 0.24
CIRCLE_SEGMENTS = 24
CYLINDER_POSITION = (1.35 + CAST_OFFSET_X, 5.72, 9.02)
CYLINDER_TILT = math.degrees(0.52)
CYLINDER_CORE = ((-0.4, -0.4, -0.48), (0.4, 0.95, 0.48))
CYLINDER_HEAD = ((-0.43, 0.96, -0.48), (0.43, 1.09, 0.48))
FIN_COUNT = 7
FIN_HALF_X = 0.56
FIN_HALF_Z = 0.62
FIN_START_Y = -0.3
FIN_STEP = 0.19
FIN_THICKNESS = 0.07
FLANGE = ((1.84, 5.88, 8.4), (2.62, 6.24, 8.75))
FLANGE_STUD_X = (1.92, 2.53)
FLANGE_STUD_HALF = 0.07
FLANGE_STUD_YZ = ((5.98, 8.32), (6.14, 8.46))
KICK_POINTS = ((2.65, 3.65, 10.0), (2.95, 3.7, 8.85), (3.22, 3.98, 7.7),
               (3.46, 4.55, 6.55), (3.6, 5.02, 5.9), (3.85, 5.03, 5.7))
KICK_STEPS = 18
KICK_SIZE = 0.18
KICK_PAD = ((3.35, 4.84, 5.35), (4.35, 5.26, 6.03))
KICK_ENDS = (((3.28, 4.82, 5.32), (3.39, 5.28, 6.06)),
             ((4.31, 4.82, 5.32), (4.42, 5.28, 6.06)))
# The right-hand pan stays outside the road tyre and above the horizontal folded wheel.
KIDNEY = ((3.12, 4.95), (3.5, 4.9), (3.92, 5.9), (4.02, 7.0),
          (3.94, 9.3), (3.65, 10.25), (3.15, 10.5), (2.72, 10.1),
          (2.4, 9.1), (2.4, 6.5), (2.72, 5.4))
KIDNEY = tuple((x, 7.7+(z-7.7)*0.94) for x, z in KIDNEY)
PAN_CENTER = (3.2, 4.4, 7.7)
PAN_SEGMENTS = 18
PAN_RINGS = ((3.8, 0.72), (3.88, 0.86), (4.04, 0.96), (4.55, 1),
             (4.8, 1), (4.96, 0.94), (5.04, 0.78))
PAN_SEAM_Y = (4.52, 4.58)
PAN_SEAM_SCALE = 1.0
PAN_SEAM_SIDE_SCALE = 1.02
HEADER_POINTS = ((2.23, 6.02, 8.55), (3.45, 5.45, 8.15),
                 (3.85, 5.4, 6.6), (3.75, 5.38, 5.95),
                 (3.55, 5.16, 5.55), (3.35, 4.72, 5.38))
HEADER_STEPS = 10
PIPE_SIDES = 6
PIPE_RADIUS = 0.24
JOINT_OFFSETS = (0.11, 0.33)
JOINT_RADIUS = 0.29
OUTLET_CENTER = (3.05, 4.55)
OUTLET_Z = (9.95, 10.5)
OUTLET_RADIUS = 0.14
OUTLET_CAP_Z = 10.48
MOUNTS = ((5.9, 6.05), (7.7, 6.2), (9.4, 6.35))
MOUNT_X = (3.1, 3.24)
MOUNT_HALF_Z = 0.12
MOUNT_BOTTOM = 4.9
MOUNT_FOOT_X = (2.9, 3.6)
MOUNT_FOOT_Y = (4.9, 5.04)
MOUNT_BOLT_LO = (3.25, 5.4)
MOUNT_BOLT_HI = (3.4, 5.58)
MOUNT_BOLT_HALF_Z = 0.09
# Short nested cores preserve solid thickness inside the tapered pressed skin.
MUFFLER_SOLIDS = tuple(((3.2-half_width, low, front), (3.2+half_width, high, rear))
                      for half_width, low, high, front, rear in (
                          (0.61, 4.05, 4.78, 6.1, 9.55),
                          (0.48, 3.87, 4.96, 6.5, 9.25),
                          (0.34, 3.77, 5.05, 6.9, 8.95),
                          (0.3, 4.1, 4.65, 5.3, 10.0)))
FAN_RIB_COUNT = 16
FAN_RIB_X = FAN_FACE_X+CAST_OFFSET_X+0.045


def catmull_rom(points, steps, closed=False):
    """Sample a uniform Catmull-Rom spline, duplicating open endpoints."""
    count = len(points)
    segments = count if closed else count - 1
    def point(index):
        return points[index % count if closed else max(0, min(index, count - 1))]
    result = []
    for sample in range(steps + (not closed)):
        position = sample * segments / steps
        index = min(int(position), segments - 1)
        t = position - index
        a, b, c, d = (point(index + offset) for offset in (-1, 0, 1, 2))
        result.append(tuple((2*b[j] + (-a[j]+c[j])*t
                             + (2*a[j]-5*b[j]+4*c[j]-d[j])*t*t
                             + (-a[j]+3*b[j]-3*c[j]+d[j])*t*t*t)/2
                            for j in range(len(b))))
    return result


def _circle(center, radius, segments=CIRCLE_SEGMENTS):
    return [(center[0]+radius*math.cos(math.tau*j/segments),
             center[1]+radius*math.sin(math.tau*j/segments)) for j in range(segments)]


def _pan_ring(y, scale):
    return [(PAN_CENTER[0]+(x-PAN_CENTER[0])*scale, y,
             PAN_CENTER[2]+(z-PAN_CENTER[2])*scale)
            for x, z in catmull_rom(KIDNEY, PAN_SEGMENTS, closed=True)]


def _shade(color):
    return lambda u, v: tuple(round(c*(SHADE_BASE+SHADE_RANGE*(1-v/TEXELS)))
                              for c in color) + (255,)


def _steel_pixel(u, v):
    heat = math.exp(-((u/TEXELS-0.72)/0.16)**2)
    seam = 0.1 if v < 1 or v >= TEXELS-1 else 0
    shade = 1-0.17*heat-seam
    return tuple(round(c*shade) for c in STEEL_COLOR) + (255,)


def _fan_pixel(u, v):
    x, y = (2*(n+0.5)/FAN_TEXELS-1 for n in (u, v))
    radius = math.hypot(x, y)
    angle = math.atan2(y, x)
    slot = abs(math.sin(angle*FAN_SLOTS/2))
    if radius > 1 or (FAN_SLOT_INNER < radius < FAN_SLOT_OUTER
                      and slot < FAN_SLOT_WIDTH*FAN_SLOTS/2):
        return atlas.CLEAR
    return (*CAST_COLOR, 255) if radius < FAN_HUB_RADIUS else _shade(CAST_COLOR)(u*TEXELS/FAN_TEXELS, v*TEXELS/FAN_TEXELS)


def register_regions(registry):
    def register(name, width, height, material, pixel):
        if name not in registry._regions:
            registry.register(atlas.Region(name, width, height, material, pixel))
    for name, color in (("engine_cast", CAST_COLOR), ("engine_fin", FIN_COLOR),
                        ("engine_steel", STEEL_COLOR), ("engine_seam", SEAM_COLOR)):
        register(name, TEXELS, TEXELS,
                 atlas.Material.CHROME if name == "engine_cast" else atlas.Material.RUBBER,
                 _steel_pixel if name == "engine_steel" else _shade(color))
    outlines = [("engine_boss", _circle((0, 0), 1), CAST_COLOR),
                ("engine_dark_boss", _circle((0, 0), 1), STEEL_COLOR),
                ("engine_fan_back", _circle(FAN_CENTER, FAN_RINGS[0][1]), FIN_COLOR),
                ("engine_outlet", _circle(OUTLET_CENTER, OUTLET_RADIUS), FIN_COLOR)]
    for index in (0, -1):
        ring = _pan_ring(*PAN_RINGS[index])
        outlines.append((f"engine_pan_{index}", [(p[2], -p[0]) for p in ring], STEEL_COLOR))
    for name, polygon, color in outlines:
        width, height, pixel = atlas.outline_pixel(polygon, OUTLINE_DENSITY,
                                                 lambda u, v, c=color: (*c, 255))
        register(name, width, height, atlas.Material.CUTOUT, pixel)
    register("engine_fan", FAN_TEXELS, FAN_TEXELS, atlas.Material.CUTOUT, _fan_pixel)
    for name, rings, material, assembly in _surfaces():
        width, height, pixel, _ = _surface_sheet(rings, material, assembly)
        register(name, width, height, atlas.Material.CUTOUT, pixel)


def _pipe_rings(points, radius):
    rings = []
    for i, point in enumerate(points):
        a, b = points[max(0, i-1)], points[min(len(points)-1, i+1)]
        direction = kit._unit(kit._sub(b, a))
        u = kit._unit((direction[2], 0, -direction[0]))
        v = (direction[1]*u[2], direction[2]*u[0]-direction[0]*u[2], -direction[1]*u[0])
        r = radius(i) if callable(radius) else radius
        rings.append([tuple(point[k]+r*(u[k]*math.cos(math.tau*j/PIPE_SIDES)
                                         +v[k]*math.sin(math.tau*j/PIPE_SIDES))
                            for k in range(3)) for j in range(PIPE_SIDES)])
    return rings


def _surfaces():
    casting = [[(x, y, z) for z, y in _circle(FAN_CENTER, radius, 16)]
               for x, radius in ((1.55, 1.15), (1.75, 1.36), (2.08, 1.36),
                                 (2.08, 1.55), (2.4, 1.55))]
    fan = [[(x+CAST_OFFSET_X, y, z) for z, y in _circle(FAN_CENTER, r, FAN_SEGMENTS)]
           for x, r in FAN_RINGS]
    pan = [_pan_ring(y, scale) for y, scale in PAN_RINGS]
    # Offset only the sides to avoid coplanar flicker without lengthening the pan.
    seam = [[(PAN_CENTER[0]+(x-PAN_CENTER[0])*PAN_SEAM_SIDE_SCALE, y, z)
             for x, y, z in _pan_ring(y, PAN_SEAM_SCALE)] for y in PAN_SEAM_Y]
    path = catmull_rom(HEADER_POINTS, HEADER_STEPS)
    axis = kit._unit(kit._sub(path[1], path[0]))
    joint = _pipe_rings([tuple(p+t*d for p, d in zip(path[0], axis))
                         for t in JOINT_OFFSETS], JOINT_RADIUS)
    outlet = _pipe_rings([(*OUTLET_CENTER, z) for z in OUTLET_Z], OUTLET_RADIUS)
    return (("engine_cast_patch", casting, "engine_cast", "engine_casting"),
            ("engine_fan_patch", fan, "engine_fin", "engine_fan"),
            ("engine_pan_patch", pan, "engine_steel", "engine_muffler"),
            ("engine_seam_patch", seam, "engine_seam", "engine_muffler"),
            ("engine_joint_patch", joint, "engine_fin", "engine_exhaust_pipe"),
            ("engine_outlet_patch", outlet, "engine_steel", "engine_muffler"))


def _patches(rings, assembly):
    for a, b in zip(rings, rings[1:]):
        inside = kit._centroid((*a, *b))
        for j in range(len(a)):
            following = (j+1) % len(a)
            cube = kit.quad(a[j], a[following], b[j], b[following], PANEL_THICKNESS,
                            atlas.faces("clear"), inside, assembly=assembly)
            if cube is None:
                continue
            matrix = tilt.cube_matrix(cube.get("rotation", (0, 0, 0)))
            pivot = cube.get("pivot", (0, 0, 0))
            polygon = []
            for point in (a[j], a[following], b[following], b[j]):
                offset = kit._sub(point, pivot)
                polygon.append(tuple(pivot[k]+sum(matrix[i][k]*offset[i] for i in range(3))
                                     for k in range(2)))
            yield cube, polygon


def _patch_pixel(cube, polygon, color):
    # Tangent panels need cutouts: their axis-aligned local bounds overhang the curved skin.
    x0, y0 = cube["origin"][:2]
    dx, dy = cube["size"][:2]
    width, height = (max(1, math.ceil(length*OUTLINE_DENSITY)) for length in (dx, dy))
    def pixel(u, v):
        x, y = x0+(u+0.5)*dx/width, y0+dy-(v+0.5)*dy/height
        inside = False
        for (ax, ay), (bx, by) in zip(polygon, (*polygon[1:], polygon[0])):
            if (ay > y) != (by > y) and x < ax+(y-ay)*(bx-ax)/(by-ay):
                inside = not inside
        if not inside:
            return atlas.CLEAR
        if color == STEEL_COLOR:
            return _steel_pixel(u*TEXELS/width, v*TEXELS/height)
        return (*color, 255)
    return width, height, pixel


def _surface_sheet(rings, material, assembly):
    patches = list(_patches(rings, assembly))
    masks = [_patch_pixel(cube, polygon, SURFACE_COLORS[material]) for cube, polygon in patches]
    cell_width = max(w for w, _, _ in masks)+2*MASK_GUTTER
    cell_height = max(h for _, h, _ in masks)+2*MASK_GUTTER
    rows = math.ceil(len(masks)/MASK_COLUMNS)
    def pixel(u, v):
        index = (v//cell_height)*MASK_COLUMNS+u//cell_width
        x, y = u % cell_width-MASK_GUTTER, v % cell_height-MASK_GUTTER
        if index >= len(masks):
            return atlas.CLEAR
        width, height, sample = masks[index]
        return sample(x, y) if 0 <= x < width and 0 <= y < height else atlas.CLEAR
    placed = [(cube, (i % MASK_COLUMNS)*cell_width+MASK_GUTTER,
               (i//MASK_COLUMNS)*cell_height+MASK_GUTTER, masks[i][0], masks[i][1])
              for i, (cube, _) in enumerate(patches)]
    return cell_width*MASK_COLUMNS, cell_height*rows, pixel, placed


def _surface_cubes(result, assemblies):
    for name, rings, material, assembly in _surfaces():
        if assembly not in assemblies:
            continue
        _, _, _, patches = _surface_sheet(rings, material, assembly)
        for cube, u, v, width, height in patches:
            cube["uv"] = {face: (atlas.face(name, u, v, width, height)
                                  if face in ("north", "south") else atlas.face("clear"))
                          for face in atlas.FACE_NAMES}
            result.add(BONE, cube)


def _part(assembly):
    result = kit.AreaCubes()
    def add(cubes):
        result.add(BONE, cubes, assembly=assembly)
    def box(bounds, material):
        add(kit.box(*bounds, atlas.faces(material)))
    return result, add, box


def _casing():
    result, add, box = _part("engine_casing_detail")
    _surface_cubes(result, ("engine_casting",))
    box(((1.65, 3.8, 11.05), (2.6, 4.55, 12.35)), "engine_steel")
    for center, radius, x in (((11.8, 4.3), 0.46, 2.62),
                              ((11.8, 4.3), 0.2, 2.82)):
        add(kit.profile_plate(_circle(center, radius, 16), x, 0.14, "engine_dark_boss"))
    # The cooling cowl rises ahead of the fan, where the short pan leaves it exposed.
    for roll in (0, 45):
        add(kit.tube(((1.8, 6.15, 9.55), (2.15, 6.6, 9.0)), 0.85,
                     atlas.faces("engine_steel"), assembly="engine_casing_detail", roll=roll))
    return result


def _fan():
    result, add, _ = _part("engine_fan_detail")
    _surface_cubes(result, ("engine_fan",))
    add(kit.profile_plate(_circle(FAN_CENTER, FAN_RINGS[0][1]), FAN_BACK_X+CAST_OFFSET_X,
                          PANEL_THICKNESS, "engine_fan_back"))
    add(kit.profile_plate(_circle(FAN_CENTER, FAN_RADIUS), FAN_FACE_X+CAST_OFFSET_X,
                          PANEL_THICKNESS, "engine_fan"))
    add(kit.profile_plate(_circle(FAN_CENTER, FAN_RADIUS), FAN_FACE_X+CAST_OFFSET_X-0.035,
                          PANEL_THICKNESS, "engine_boss"))
    for i in range(FAN_RIB_COUNT):
        angle = math.tau*i/FAN_RIB_COUNT
        points = [(FAN_RIB_X, FAN_CENTER[1]+r*math.sin(angle),
                   FAN_CENTER[0]+r*math.cos(angle)) for r in (0.48, 1.3)]
        add(kit.tube(points, 0.065, atlas.faces("engine_cast")))
    for x in (2.32, 2.46, 2.6):
        points = [(x, FAN_CENTER[1]+1.5*math.sin(math.tau*i/16),
                   FAN_CENTER[0]+1.5*math.cos(math.tau*i/16)) for i in range(17)]
        add(kit.tube(points, 0.08, atlas.faces("engine_fin")))
    return result


def _cylinder_fins():
    result, add, box = _part("engine_cylinder_fins")
    cylinder = [kit.box(*CYLINDER_CORE, atlas.faces("engine_fin")),
                kit.box(*CYLINDER_HEAD, atlas.faces("engine_cast"))]
    for i in range(FIN_COUNT):
        y = FIN_START_Y+i*FIN_STEP
        cylinder.append(kit.box((-FIN_HALF_X, y, -FIN_HALF_Z),
                                (FIN_HALF_X, y+FIN_THICKNESS, FIN_HALF_Z), atlas.faces("engine_cast")))
    cylinder = tilt.tilt_assembly(cylinder, (0, 0, 0), "x", CYLINDER_TILT)
    for cube in cylinder:
        for key in ("origin", "pivot"):
            cube[key] = [a+b for a, b in zip(cube[key], CYLINDER_POSITION)]
    add(cylinder)
    box(FLANGE, "engine_fin")
    for x in FLANGE_STUD_X:
        box(((x-FLANGE_STUD_HALF, *FLANGE_STUD_YZ[0]),
             (x+FLANGE_STUD_HALF, *FLANGE_STUD_YZ[1])), "engine_cast")
    return result


def _kick():
    result, add, box = _part("engine_kick")
    add(kit.tube(catmull_rom(KICK_POINTS, KICK_STEPS), KICK_SIZE,
                 atlas.faces("engine_steel"), assembly="engine_kick"))
    box(KICK_PAD, "rubber")
    for bounds in KICK_ENDS:
        box(bounds, "engine_steel")
    return result


def _muffler():
    result, add, box = _part("engine_muffler")
    _surface_cubes(result, ("engine_muffler",))
    for roll in (0, 45):
        add(kit.tube([(*OUTLET_CENTER, z) for z in OUTLET_Z], 0.25,
                     atlas.faces("engine_steel"), roll=roll))
    for bounds in MUFFLER_SOLIDS:
        box(bounds, "engine_steel")
    pan_rings = [_pan_ring(y, scale) for y, scale in PAN_RINGS]
    # Rotate alpha-cut side plates into horizontal pressed faces; no tiled fill.
    for index in (0, -1):
        ring = pan_rings[index]
        cap = kit.profile_plate([(p[2], -p[0]) for p in ring], ring[0][1],
                                PANEL_THICKNESS, f"engine_pan_{index}")
        cap.update(pivot=[0, 0, 0], rotation=[0, 0, -90])
        add(cap)
    cap = kit.profile_plate(_circle(OUTLET_CENTER, OUTLET_RADIUS), 0,
                            PANEL_THICKNESS, "engine_outlet")
    cap["origin"][2] += OUTLET_CAP_Z
    cap.update(pivot=[0, 0, OUTLET_CAP_Z], rotation=[0, 90, 0])
    add(cap)
    for z, top in MOUNTS:
        box(((MOUNT_X[0], MOUNT_BOTTOM, z-MOUNT_HALF_Z),
             (MOUNT_X[1], top, z+MOUNT_HALF_Z)), "engine_fin")
        box(((MOUNT_FOOT_X[0], MOUNT_FOOT_Y[0], z-MOUNT_HALF_Z),
             (MOUNT_FOOT_X[1], MOUNT_FOOT_Y[1], z+MOUNT_HALF_Z)), "engine_steel")
        box(((*MOUNT_BOLT_LO, z-MOUNT_BOLT_HALF_Z),
             (*MOUNT_BOLT_HI, z+MOUNT_BOLT_HALF_Z)), "engine_steel")
    # A separate outer shield and lower rib break up the pressed shell.
    box(((3.94, 4.6, 6.4), (4.06, 4.86, 9.2)), "engine_seam")
    box(((3.55, 3.74, 6.8), (3.7, 3.94, 9.05)), "engine_fin")
    return result


def _exhaust_pipe():
    result, add, _ = _part("engine_exhaust_pipe")
    _surface_cubes(result, ("engine_exhaust_pipe",))
    # Overlapping squares approximate a round solid pipe without overhanging tangent masks.
    for roll in (0, 30, 60):
        add(kit.tube(catmull_rom(HEADER_POINTS, 18), PIPE_RADIUS*1.4,
                     atlas.faces("engine_fin"), assembly="engine_exhaust_pipe", roll=roll))
    return result


def _swing_arm():
    result, add, box = _part("engine_swing_arm")
    box(((1.55, 3.9, 10.2), (2.48, 4.85, 12.2)), "engine_fin")
    box(((1.7, 4.65, 9.65), (2.32, 5.12, 11.5)), "engine_steel")
    for radius, x in ((0.48, 2.5), (0.22, 2.7)):
        add(kit.profile_plate(_circle((11.8, 4.3), radius, 16), x, 0.15,
                              "engine_dark_boss"))
    for roll in (0, 45):
        add(kit.tube(((2.0, 4.8, 11.4), (1.8, 6.5, 10.1)), 0.16,
                     atlas.faces("engine_fin"), assembly="engine_swing_arm", roll=roll))
    return result


def build() -> kit.AreaCubes:
    register_regions(atlas.REGISTRY)
    result = kit.AreaCubes()
    for builder in (_casing, _fan, _cylinder_fins, _kick, _muffler,
                    _exhaust_pipe, _swing_arm):
        result.merge(builder())
    return result
