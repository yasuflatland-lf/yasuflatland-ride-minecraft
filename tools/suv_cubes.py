"""Pure cube construction, reflection and translation helpers."""

import math
from copy import deepcopy

from tool_loader import load_tool

atlas = load_tool("suv_atlas")
uv = atlas.uv


def box(x0, y0, z0, x1, y1, z1, color):
    return {"origin": [x0, y0, z0], "size": [x1 - x0, y1 - y0, z1 - z0], "uv": uv(color) if isinstance(color, str) else deepcopy(color)}


def region_faces(block: str, name: str, faces: dict[str, tuple[int, int, int, int]]) -> dict:
    allowed = {"north", "south", "east", "west", "up", "down"}
    if not faces.keys() <= allowed:
        raise ValueError("Unknown cube face")
    r = atlas.region(block, name)
    _, spec, _, _ = atlas.region_at(r.x, r.y)
    result = uv(spec.base)
    for face, (u, v, w, h) in faces.items():
        result[face] = atlas.ATLAS.face(r, (u, v), (w, h))
    return result


def transform_uv(faces, axes):
    # Axes follow render_preview.textured_face's corner ordering in the cube's local frame.
    directions = {"north": ("x", "y"), "south": ("x", "y"),
                  "east": ("z", "y"), "west": ("z", "y"),
                  "up": ("z", "x"), "down": ("x", "z")}
    swaps = {}
    for axis, pair in (("x", ("east", "west")), ("z", ("north", "south"))):
        if axis in axes:
            swaps.update(zip(pair, reversed(pair)))
    result = {}
    for name, face in faces.items():
        target = swaps.get(name, name)
        detailed = face["uv"][1] >= atlas.ATLAS.swatch_rows
        opposite = faces.get(target)
        # A mixed pair must move together to avoid duplicating or losing a face.
        # Swatch-only pairs retain their original keys as well as their UV values.
        if not detailed and (opposite is None or opposite["uv"][1] < atlas.ATLAS.swatch_rows):
            target = name
        mapped = deepcopy(face)
        if detailed:
            for i, axis in enumerate(directions[name]):
                if axis in axes:
                    mapped["uv"][i] += mapped["uv_size"][i]
                    mapped["uv_size"][i] *= -1
        result[target] = mapped
    return result


def disc(axis, center, half, a0, a1, angles, color):
    """Squares turned by each angle around the axle; together they read as a polygon of len(angles) * 4 sides."""
    cubes = []
    for angle in angles:
        if axis == "x":
            cube = box(a0, center[1] - half, center[2] - half, a1, center[1] + half, center[2] + half, color)
            cube["rotation"] = [angle, 0, 0]
        else:
            cube = box(center[0] - half, center[1] - half, a0, center[0] + half, center[1] + half, a1, color)
            cube["rotation"] = [0, 0, angle]
        cube["pivot"] = list(center)
        cubes.append(cube)
    return cubes


def turned(cube, pivot, rotation):
    cube["pivot"] = list(pivot)
    cube["rotation"] = list(rotation)
    return cube


def mirrored(cube):
    """The same cube on the other side of the center line (x -> -x)."""
    (x, y, z), (w, h, d) = cube["origin"], cube["size"]
    copy = {**deepcopy(cube), "origin": [-(x + w), y, z],
            "uv": transform_uv(cube["uv"], "x")}
    if "pivot" in cube:
        copy["pivot"] = [-cube["pivot"][0], *cube["pivot"][1:]]
    if "rotation" in cube:
        rx, ry, rz = cube["rotation"]
        copy["rotation"] = [rx, -ry, -rz]
    return copy


def both_sides(cubes):
    """Cubes defined on the +x (right) side, plus their mirror images on the left."""
    return [*cubes, *[mirrored(c) for c in cubes]]


def facing_back(cube):
    """The same cube mirrored front to back (z -> -z). The bumper's corners turn only around y."""
    (x, y, z), (w, h, d) = cube["origin"], cube["size"]
    copy = {**deepcopy(cube), "origin": [x, y, -(z + d)],
            "uv": transform_uv(cube["uv"], "z")}
    if "pivot" in cube:
        px, py, pz = cube["pivot"]
        rx, ry, rz = cube["rotation"]
        copy["pivot"] = [px, py, -pz]
        copy["rotation"] = [rx, -ry, rz]
    return copy


def round_face(center, radius, z0, z1, color, segments=12):
    """A flat round face (facing -z) made of thin blocks reaching out from the center like clock hands.

    Turned squares would leave their corners poking out like a gear; these blocks only overhang the
    circle by a few percent at their outer corners.
    """
    cx, cy, _ = center
    half_chord = radius * math.tan(math.radians(180 / segments))
    cubes = []
    for i in range(segments):
        cube = box(cx - half_chord, cy, z0, cx + half_chord, cy + radius, z1, color)
        cube["pivot"] = list(center)
        cube["rotation"] = [0, 0, round(i * 360 / segments, 3)]
        cubes.append(cube)
    return cubes


def translate(cubes, axis, offset):
    """Move cubes and their pivots by offset along axis (0 = x, 1 = y, 2 = z)."""
    for cube in cubes:
        cube["origin"][axis] += offset
        if "pivot" in cube:
            pivot = list(cube["pivot"])
            pivot[axis] += offset
            cube["pivot"] = pivot
