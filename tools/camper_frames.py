"""Conversions between the camper's build frame (+x right) and the game frame (+x left).

A conversion moves geometry and never renames faces (ADR 0259)."""

Cube = dict
Bone = dict


def _mirror_cube(cube: Cube) -> None:
    x, y, z = cube["origin"]
    w = cube["size"][0]
    cube["origin"] = [-(x + w), y, z]
    if "pivot" in cube:
        px, py, pz = cube["pivot"]
        cube["pivot"] = [-px, py, pz]
        rx, ry, rz = cube["rotation"]
        # A mirror negates y and z turns, but the game turns z the other way from
        # the right-handed math these cubes are built with, so z stays as written
        # (the sports boat generator keeps z for the same reason, ADR 0058).
        cube["rotation"] = [rx, -ry, rz]


def to_game_frame(bones: list[Bone]) -> list[Bone]:
    """Mirror build-frame bones into the game frame, in place, and return the same list."""
    for bone in bones:
        px, py, pz = bone["pivot"]
        bone["pivot"] = [-px, py, pz]
        for name, (x, y, z) in bone.get("locators", {}).items():
            bone["locators"][name] = [-x, y, z]
        if "rotation" in bone:
            rx, ry, rz = bone["rotation"]
            bone["rotation"] = [rx, -ry, -rz]
        # Face names stay as written: builders name the build frame's maximum-x face east,
        # and the mirror moves it to the minimum-x side, where Bedrock draws east (ADR 0259).
        for cube in bone.get("cubes", []):
            _mirror_cube(cube)
    return bones


def from_game_trace(cubes: list[Cube]) -> list[Cube]:
    """Move cubes traced in the game frame into the build frame, in place, so to_game_frame returns
    them to where they were traced. Returns the same list."""
    for cube in cubes:
        _mirror_cube(cube)
    return cubes
