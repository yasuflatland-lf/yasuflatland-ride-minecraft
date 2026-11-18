"""Panel primitives in the spike frame, using Bedrock cube rotations (ADR 0167)."""

import copy
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

atlas = load_tool("scooter_atlas")
tilt = load_tool("cube_tilt")
EDGE_EPSILON = 1e-3
FRAME_EPSILON = 1e-9
ANGLE_EPSILON = 1e-8
ANGLE_DECIMALS = 10
PANEL_MARGIN = 0.16
TUBE_END_EXTENSION = 0.3


class _Cube(dict):
    def __init__(self, values, assembly=None):
        super().__init__(values)
        self.assembly = assembly


class AreaCubes(dict):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.assemblies = {}

    def merge(self, other):
        for bone, cubes in other.items():
            self.setdefault(bone, []).extend(cubes)
        for name, cubes in other.assemblies.items():
            self.assemblies.setdefault(name, []).extend(cubes)
        return self

    def add(self, bone, cube_or_cubes, assembly=None):
        if cube_or_cubes is None:
            return self
        cubes = [cube_or_cubes] if isinstance(cube_or_cubes, dict) else cube_or_cubes
        for cube in cubes:
            if cube is None:
                continue
            self.setdefault(bone, []).append(cube)
            owner = assembly if assembly is not None else getattr(cube, "assembly", None)
            if owner is not None:
                self.assemblies.setdefault(owner, []).append(cube)
        return self


def _sub(a, b):
    return [x - y for x, y in zip(a, b)]


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _length(v):
    return math.sqrt(_dot(v, v))


def _unit(v):
    length = _length(v)
    return [x / length for x in v]


def _centroid(points):
    return [sum(p[i] for p in points) / len(points) for i in range(3)]


def _rotation(normal):
    # Ry(ry) * Rx(-rx) sends +z to (sin(ry)cos(rx), sin(rx), cos(ry)cos(rx)).
    if abs(normal[0]) < FRAME_EPSILON:
        pitch, yaw = math.degrees(math.atan2(normal[1], normal[2])), 0
    else:
        pitch = math.degrees(math.atan2(normal[1], math.hypot(normal[0], normal[2])))
        yaw = math.degrees(math.atan2(normal[0], normal[2]))
    return [0 if abs(a) < ANGLE_EPSILON else round(a, ANGLE_DECIMALS) for a in (pitch, yaw, 0)]


def box(lo, hi, uv_faces):
    return _Cube({"origin": list(lo), "size": _sub(hi, lo), "uv": copy.deepcopy(uv_faces)})


def _oriented(lo, hi, pivot, rotation, uv_faces, assembly):
    cube = box(lo, hi, uv_faces)
    cube.assembly = assembly
    if any(rotation):
        cube.update(pivot=list(pivot), rotation=rotation)
    if tilt.axis_count(cube) > 1 and assembly is None:
        raise ValueError("Compound scooter rotations require an assembly (ADR 0167)")
    return cube


def quad(a0, a1, b0, b1, thick, uv_faces, inside, assembly=None, tangent_frame=False):
    u = [(a1[i] - a0[i] + b1[i] - b0[i]) / 2 for i in range(3)]
    v = [(b0[i] - a0[i] + b1[i] - a1[i]) / 2 for i in range(3)]
    if _length(u) < EDGE_EPSILON or _length(v) < EDGE_EPSILON:
        return None
    ex = _unit(u)
    orthogonal = [v[i] - ex[i] * _dot(v, ex) for i in range(3)]
    if _length(orthogonal) < EDGE_EPSILON:
        return None
    ey = _unit(orthogonal)
    normal = [ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0]]
    center = _centroid((a0, a1, b0, b1))
    if _dot(normal, _sub(center, inside)) < 0:
        normal = [-n for n in normal]
        ey = [-n for n in ey]
    # Tyre patches need their in-plane turn; a normal alone produces oversized boxes over the whitewall.
    rotation = (tilt._rotation_of([[ex[i], ey[i], normal[i]] for i in range(3)])
                if tangent_frame else _rotation(normal))
    matrix = tilt.cube_matrix(rotation)
    ex, ey = ([matrix[i][j] for i in range(3)] for j in range(2))
    projected = [(_dot(_sub(p, center), ex), _dot(_sub(p, center), ey)) for p in (a0, a1, b0, b1)]
    lo = [min(p[i] for p in projected) for i in range(2)]
    hi = [max(p[i] for p in projected) for i in range(2)]
    rectangle = all(any(abs(p[0]-x) < FRAME_EPSILON and abs(p[1]-y) < FRAME_EPSILON
                        for p in projected) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]))
    # A tyre trapezoid is covered by its bounding rectangle; the usual margin would poke past the tread.
    margin = 0 if rectangle or tangent_frame else PANEL_MARGIN
    return _oriented([center[0]+lo[0]-margin, center[1]+lo[1]-margin, center[2]-thick],
                     [center[0]+hi[0]+margin, center[1]+hi[1]+margin, center[2]],
                     center, rotation, uv_faces, assembly)


def skin(rings, thick, uv_faces, inside=None, closed=False, assembly=None, tangent_frame=False):
    cubes = []
    for k, (a, b) in enumerate(zip(rings, rings[1:])):
        if len(a) != len(b):
            raise ValueError("Skin rings must have matching point counts")
        for j in range(len(a) if closed else len(a)-1):
            next_j = (j+1) % len(a)
            point = inside(k, j) if callable(inside) else inside
            if point is None:
                point = _centroid((_centroid(a), _centroid(b)))
            cube = quad(a[j], a[next_j], b[j], b[next_j], thick, uv_faces, point, assembly, tangent_frame)
            if cube is not None:
                cubes.append(cube)
    return cubes


def tube(points, size, uv_faces, assembly=None, roll=0):
    cubes = []
    for a, b in zip(points, points[1:]):
        direction = _sub(b, a)
        length = _length(direction)
        if length < EDGE_EPSILON:
            continue
        center = _centroid((a, b))
        half = [size/2, size/2, length/2 + TUBE_END_EXTENSION*size]
        rotation = _rotation(_unit(direction))
        if roll:
            rotation = tilt.roll_rotation(rotation, roll)
        cubes.append(_oriented([center[i]-half[i] for i in range(3)],
                               [center[i]+half[i] for i in range(3)], center,
                               rotation, uv_faces, assembly))
    return cubes


def extrude(poly_zy, x0, x1, step, uv_faces):
    if step <= 0:
        raise ValueError("Extrusion step must be positive")
    z0, z1 = min(p[0] for p in poly_zy), max(p[0] for p in poly_zy)
    cubes = []
    for column in range(math.ceil((z1-z0)/step)):
        start = z0 + column*step
        end = min(start+step, z1)
        z = (start+end)/2
        ys = []
        for (za, ya), (zb, yb) in zip(poly_zy, (*poly_zy[1:], poly_zy[0])):
            if za != zb and min(za, zb) <= z <= max(za, zb):
                ys.append(ya + (z-za)*(yb-ya)/(zb-za))
        if len(ys) >= 2 and max(ys)-min(ys) > FRAME_EPSILON:
            cubes.append(box([x0,min(ys),start], [x1,max(ys),end], uv_faces))
    return cubes


def profile_plate(poly_zy, x, thick, region):
    return box([x-thick/2, min(p[1] for p in poly_zy), min(p[0] for p in poly_zy)],
               [x+thick/2, max(p[1] for p in poly_zy), max(p[0] for p in poly_zy)],
               atlas.plate_faces(region))


def _mirror_rotation(rotation):
    rx, ry, rz = rotation
    return [rx, -ry, -rz]


def mirror_to_game(bones):
    for bone in bones:
        bone["pivot"] = [-bone["pivot"][0], *bone["pivot"][1:]]
        if "rotation" in bone:
            bone["rotation"] = _mirror_rotation(bone["rotation"])
        for name, locator in bone.get("locators", {}).items():
            if isinstance(locator, dict):
                offset = locator["offset"]
                locator["offset"] = [-offset[0], *offset[1:]]
                if "rotation" in locator:
                    locator["rotation"] = _mirror_rotation(locator["rotation"])
            else:
                bone["locators"][name] = [-locator[0], *locator[1:]]
        for cube in bone.get("cubes", []):
            cube["origin"] = [-(cube["origin"][0]+cube["size"][0]), *cube["origin"][1:]]
            cube["uv"]["east"], cube["uv"]["west"] = cube["uv"]["west"], cube["uv"]["east"]
            # On the device a north or south face runs U along local x in the other direction than the generators
            # assume (the plate text and the seat masks read mirrored). A negative U width flips the face back.
            for name in ("north", "south"):
                face = cube["uv"][name]
                (u, v), (du, dv) = face["uv"], face["uv_size"]
                face["uv"] = [u + du, v]
                face["uv_size"] = [-du, dv]
            if "pivot" in cube:
                cube["pivot"] = [-cube["pivot"][0], *cube["pivot"][1:]]
            if "rotation" in cube:
                cube["rotation"] = _mirror_rotation(cube["rotation"])
    return bones
