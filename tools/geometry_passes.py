"""Split a built geometry into render-pass geometries that keep every bone."""

import copy
from collections.abc import Callable, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class PassSpec:
    identifier: str
    keeps_face: Callable[[str, dict, str], bool]


def _faces(bone, cube_index, cube):
    uv = cube.get("uv", {})
    if not isinstance(uv, dict):
        raise ValueError(f"bone {bone['name']!r} cube {cube_index}: per-face uv is required")
    return uv


def _build(geometry, identifier, kept):
    """kept maps (bone index, cube index) to the face names to keep."""
    bones = []
    for bone_index, bone in enumerate(geometry["bones"]):
        out = {key: copy.deepcopy(value) for key, value in bone.items() if key != "cubes"}
        if "cubes" in bone:
            cubes = []
            for cube_index, cube in enumerate(bone["cubes"]):
                names = kept.get((bone_index, cube_index), ())
                if not names:
                    continue
                piece = {key: copy.deepcopy(value) for key, value in cube.items() if key != "uv"}
                piece["uv"] = {name: copy.deepcopy(face) for name, face in cube["uv"].items() if name in names}
                cubes.append(piece)
            out["cubes"] = cubes
        bones.append(out)
    result = {key: copy.deepcopy(value) for key, value in geometry.items() if key not in ("bones", "description")}
    result["description"] = {**copy.deepcopy(geometry["description"]), "identifier": identifier}
    result["bones"] = bones
    return result


def _decisions(geometry, spec):
    kept = {}
    for bone_index, bone in enumerate(geometry["bones"]):
        for cube_index, cube in enumerate(bone.get("cubes", [])):
            for face in _faces(bone, cube_index, cube):
                if spec.keeps_face(bone["name"], cube, face):
                    kept.setdefault((bone_index, cube_index), set()).add(face)
    return kept


def select_faces(geometry, spec):
    """Subset: keep the faces `spec` accepts; the input is not modified."""
    kept = _decisions(geometry, spec)
    if not kept:
        raise ValueError(f"{spec.identifier}: no face is kept")
    return _build(geometry, spec.identifier, kept)


def partition_geometry(geometry, specs: Sequence[PassSpec]):
    """Partition: every face must be kept by exactly one spec."""
    per_spec = [_decisions(geometry, spec) for spec in specs]
    for bone_index, bone in enumerate(geometry["bones"]):
        for cube_index, cube in enumerate(bone.get("cubes", [])):
            for face in _faces(bone, cube_index, cube):
                owners = [spec.identifier for spec, kept in zip(specs, per_spec)
                          if face in kept.get((bone_index, cube_index), ())]
                if len(owners) != 1:
                    problem = "is kept by no pass" if not owners else f"is kept by several passes ({', '.join(owners)})"
                    raise ValueError(f"bone {bone['name']!r} cube {cube_index} face {face!r} {problem}")
    return [_build(geometry, spec.identifier, kept) for spec, kept in zip(specs, per_spec)]
