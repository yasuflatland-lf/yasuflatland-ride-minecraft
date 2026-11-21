"""Cull model faces buried inside an opaque cube of the same bone."""

from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from fnmatch import fnmatchcase
from itertools import product
from math import ceil, floor, ulp
from pathlib import Path

from cube_tilt import apply_matrix, cube_matrix
from geometry_passes import keep_faces

_CELL_SIZE = 4
_LATERAL_TOLERANCE = 1e-6
_IDENTITY = cube_matrix((0, 0, 0))
_SIDES = {
    "west": (0, 0), "east": (0, 1),
    "down": (1, 0), "up": (1, 1),
    "north": (2, 0), "south": (2, 1),
}


@dataclass(frozen=True)
class CullPolicy:
    excluded_bones: tuple[str, ...]
    occluder_opaque: Callable[[str, dict], bool]
    epsilon: float = 1e-3


@dataclass(frozen=True)
class CullResult:
    geometry: dict
    removed_faces: int
    removed_cubes: int
    index_map: dict[tuple[str, int], int | None]


class _Box:
    def __init__(self, cube):
        self.lo = cube["origin"]
        self.hi = [lo + size for lo, size in zip(self.lo, cube["size"])]
        self.pivot = cube.get("pivot", self.lo)
        rotation = cube.get("rotation", (0, 0, 0))
        self.rotation = cube_matrix(rotation) if any(rotation) else _IDENTITY
        self.inverse = tuple(zip(*self.rotation))
        self.coordinate_scale = max(abs(value) for value in (*self.lo, *self.hi, *self.pivot))
        self.local_corners = [
            [self.hi[axis] if corner & (1 << axis) else self.lo[axis] for axis in range(3)]
            for corner in range(8)
        ]
        self.corners = [self.to_world(point) for point in self.local_corners]

    def _transform(self, matrix, point):
        if self.rotation is _IDENTITY:
            return point
        offset = [value - pivot for value, pivot in zip(point, self.pivot)]
        return [pivot + value for pivot, value in zip(self.pivot, apply_matrix(matrix, offset))]

    def to_world(self, point):
        return self._transform(self.rotation, point)

    def shifted_face(self, side, epsilon):
        axis, end = _SIDES[side]
        points = []
        for corner, local_point in enumerate(self.local_corners):
            if ((corner >> axis) & 1) == end:
                point = local_point.copy()
                point[axis] += epsilon if end else -epsilon
                points.append(point)
        return axis, points

    def contains(self, source, axis, points, world_points):
        if self.rotation == source.rotation and (self.pivot == source.pivot or self.rotation is _IDENTITY):
            # A round trip through world space can turn exact contact into an interior point.
            local_points = points
            normal_axis = axis
            roundoff = 0
        else:
            local_points = [self._transform(self.inverse, point) for point in world_points]
            local_normal = apply_matrix(self.inverse, [row[axis] for row in source.rotation])
            # For oblique faces, the largest component gives the normal axis in this box.
            normal_axis = max(range(3), key=lambda i: abs(local_normal[i]))
            # Keep the face when the normal coordinate is within roundoff of contact.
            roundoff = 8 * ulp(max(self.coordinate_scale, source.coordinate_scale))
        for point in local_points:
            for i, (value, lo, hi) in enumerate(zip(point, self.lo, self.hi)):
                if i == normal_axis:
                    if not lo + roundoff < value < hi - roundoff:
                        return False
                elif not lo - _LATERAL_TOLERANCE <= value <= hi + _LATERAL_TOLERANCE:
                    return False
        return True


def _grid_cell(point):
    return tuple(floor(value / _CELL_SIZE) for value in point)


def _occluder_grid(boxes, indices):
    grid = defaultdict(set)
    # Allow for the lateral tolerance even when rotated onto several world axes.
    padding = 2 * _LATERAL_TOLERANCE
    for index in indices:
        axes = tuple(zip(*boxes[index].corners))
        low = _grid_cell(min(values) - padding for values in axes)
        high = _grid_cell(max(values) + padding for values in axes)
        for cell in product(*(range(lo, hi + 1) for lo, hi in zip(low, high))):
            grid[cell].add(index)
    return grid


def _cull_bone(bone_name, cubes, faces, policy):
    boxes = {index: _Box(cubes[index]) for index in faces}
    solid = [index for index in faces if all(size > 0 for size in cubes[index]["size"])]
    active = {index: cubes[index] for index in faces}

    # Culling a face can change the result of an opacity check on the remaining UVs.
    while active:
        opaque = [
            index for index in solid
            if index in active and policy.occluder_opaque(bone_name, active[index])
        ]
        if not opaque:
            break
        grid = _occluder_grid(boxes, opaque)
        removals = []
        for index, cube in active.items():
            box = boxes[index]
            for side in cube["uv"]:
                axis, points = box.shifted_face(side, policy.epsilon)
                world_points = [box.to_world(point) for point in points]
                cells = [grid.get(_grid_cell(point), set()) for point in world_points]
                candidates = cells[0].intersection(*cells[1:])
                if any(boxes[other].contains(box, axis, points, world_points)
                       for other in sorted(candidates - {index})):
                    removals.append((index, side))
        if not removals:
            break
        changed = set()
        for index, side in removals:
            faces[index].remove(side)
            changed.add(index)
        for index in sorted(changed):
            if faces[index]:
                original = cubes[index]
                uv = {side: face for side, face in original["uv"].items() if side in faces[index]}
                active[index] = {**original, "uv": uv}
            else:
                del active[index]


def cull_buried_faces(geometry: dict, policy: CullPolicy) -> CullResult:
    """Copy one geometry entry and report removed faces and original cube indices."""
    kept = {}
    index_map = {}
    removed_faces = removed_cubes = 0
    for bone_index, bone in enumerate(geometry["bones"]):
        name = bone["name"]
        cubes = bone.get("cubes", [])
        faces = {}
        for index, cube in enumerate(cubes):
            uv = cube.get("uv", {})
            if not isinstance(uv, dict):
                raise ValueError(f"bone {name!r} cube {index}: per-face uv is required")
            if uv:
                faces[index] = set(uv)
        if not any(fnmatchcase(name, pattern) for pattern in policy.excluded_bones):
            _cull_bone(name, cubes, faces, policy)
        new_index = 0
        for index, cube in enumerate(cubes):
            names = faces.get(index, ())
            removed_faces += len(cube.get("uv", {})) - len(names)
            if names:
                kept[bone_index, index] = names
                index_map[name, index] = new_index
                new_index += 1
            else:
                index_map[name, index] = None
                removed_cubes += 1
    return CullResult(keep_faces(geometry, kept), removed_faces, removed_cubes, index_map)


Texture = tuple[int, int, bytes]


def _texels(origin, extent, texels, uv_size):
    lo, hi = sorted((origin * texels / uv_size, (origin + extent) * texels / uv_size))
    first, last = max(0, ceil(lo - 0.5)), min(texels - 1, floor(hi - 0.5))
    if first > last and hi - lo < 1:
        first = last = min(texels - 1, max(0, floor((lo + hi) / 2)))
    return range(first, last + 1)


def _face_opaque(face, texture, uv_space):
    width, height, pixels = texture
    u, v = face["uv"]
    du, dv = face["uv_size"]
    xs = _texels(u, du, width, uv_space[0])
    ys = _texels(v, dv, height, uv_space[1])
    if not xs or not ys:
        return False
    return all(pixels[(y * width + x) * 4 + 3] == 255 for y in ys for x in xs)


def opaque_occluder(
    textures_for_face: Callable[[str, dict, str], Sequence[tuple[Texture, tuple[int, int]]]],
) -> Callable[[str, dict], bool]:
    """Require an opaque sample at each covered texel of every bound texture."""
    def opaque(bone, cube):
        for side, face in cube["uv"].items():
            textures = textures_for_face(bone, cube, side)
            if not textures or not all(_face_opaque(face, texture, space) for texture, space in textures):
                return False
        return bool(cube["uv"])

    return opaque


def write_record(outputs, identifier, policy_textures, result, excluded_bones):
    path = Path(__file__).resolve().parent.parent / "tests/packs/fixtures/face-cull"
    outputs.fixture_json(path / f"{identifier.removeprefix('geometry.')}.json", {
        "excludedBones": list(excluded_bones),
        "textures": list(policy_textures),
        "removedFaces": result.removed_faces,
        "removedCubes": result.removed_cubes,
    })
