"""Tilt a whole assembly of model cubes about one common axis (ADR 0166).

Cube `rotation` values are in the game's convention: tools/render_preview.py negates the x and z
turns (game_turn) and then applies x, then y, then z about the cube's pivot, so the matrix of a cube
is Rz(-rz) * Ry(ry) * Rx(-rx) in the preview's own rotate(). Tilting an assembly multiplies that
matrix on the left by the tilt, which usually needs all three axes, so the result is decomposed back
into the same order. Pure math, no generator state, so tests can import it on its own.

Each generator declares ASSEMBLIES = {name: {"owner": generator_name, "cubes": count_or_description}}.
tilt_assembly authorizes compound rotations by name in that table. assert_axes instead receives
{name: tilted_member_cubes}, in the same coordinate frame as the final cubes it checks (ADR 0167).
"""
import copy
import math

_EPS = 1e-9


def _rx(degrees):
    s, c = math.sin(math.radians(degrees)), math.cos(math.radians(degrees))
    return [[1, 0, 0], [0, c, -s], [0, s, c]]


def _ry(degrees):
    s, c = math.sin(math.radians(degrees)), math.cos(math.radians(degrees))
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]]


def _rz(degrees):
    s, c = math.sin(math.radians(degrees)), math.cos(math.radians(degrees))
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]]


def _mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _apply(m, v):
    return [sum(m[i][k] * v[k] for k in range(3)) for i in range(3)]


def cube_matrix(rotation):
    """The matrix a cube with the game's `rotation` (x, y, z degrees) applies about its pivot."""
    rx, ry, rz = rotation
    return _mul(_rz(-rz), _mul(_ry(ry), _rx(-rx)))


def corners(cube):
    """Return eight corners in bit order x + 2y + 4z (ADR 0051, 0166).

    Corner n starts at origin + size * ((n >> axis) & 1) on each axis. Only a
    non-zero rotation reads the pivot and rounds the turned coordinates to 6 places.
    """
    origin, size = cube["origin"], cube["size"]
    points = [[origin[i] + size[i] * ((n >> i) & 1) for i in range(3)] for n in range(8)]
    if not any(cube.get("rotation", [])):
        return points
    pivot = cube["pivot"]
    matrix = cube_matrix(cube["rotation"])
    turned = [_apply(matrix, [p[i] - pivot[i] for i in range(3)]) for p in points]
    return [[round(pivot[i] + offset[i], 6) for i in range(3)] for offset in turned]


def bounds(cubes):
    """Return (lo, hi), each with one value per axis, over every cube corner."""
    points = [p for c in cubes for p in corners(c)]
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return lo, hi


def _rotation_of(m):
    """The game's `rotation` whose cube_matrix is `m`."""
    sin_y = max(-1.0, min(1.0, -m[2][0]))
    y = math.degrees(math.asin(sin_y))
    if abs(sin_y) < 1 - _EPS:
        x = math.degrees(math.atan2(m[2][1], m[2][2]))
        z = math.degrees(math.atan2(m[1][0], m[0][0]))
    else:
        # Gimbal lock: x and z turn the same axis, so put the whole turn on z.
        x = 0.0
        z = math.degrees(math.atan2(-m[0][1], m[1][1]))
    return [_clean(-x), _clean(y), _clean(-z)]


def _clean(value):
    value = round(value, 10)
    return 0 if value == 0 else value


def axis_count(cube):
    return sum(abs(angle) > 1e-6 for angle in cube.get("rotation", []))


def compound_cubes(cubes):
    """The cubes turned about more than one axis, for generators that register shipped assemblies."""
    return [cube for cube in cubes if axis_count(cube) > 1]


def assert_axes(cubes, assemblies, table=None):
    """Reject compound rotations outside the named assemblies, comparing cubes by value.

    With the generator's `table`, every assembly must be registered there and hold exactly the
    number of cubes it declares."""
    if table is not None:
        for name, members in assemblies.items():
            if name not in table or len(members) != table[name]["cubes"]:
                raise ValueError(f"assembly {name!r} does not match the generator's table (ADR 0167)")
        for name, entry in table.items():
            if entry["cubes"] and name not in assemblies:
                raise ValueError(f"assembly {name!r} is registered but missing (ADR 0167)")
    members = [cube for cubes in assemblies.values() for cube in cubes]
    for cube in cubes:
        if axis_count(cube) > 1 and cube not in members:
            raise ValueError("compound rotation outside a declared assembly (ADR 0167)")


def flip_z_for_mirror(cubes):
    """Negate the z turn of assembly cubes in place, before a generator's mirror_x.

    mirror_x keeps the legacy z sign because the game turns z the other way; a rigid assembly
    whose turns were composed by this module needs the full mirror, so its z flips first."""
    for cube in cubes:
        cube["rotation"][2] *= -1


def tilt_assembly(cubes, pivot, axis, degrees, assembly=None, assemblies=None):
    """Return copies of `cubes` moved rigidly, as one body, about the world line through `pivot`
    along `axis` (only "x"). `degrees` has the sign of a cube's x rotation: tilting a cube turned
    [rx, 0, 0] gives [rx + degrees, 0, 0]. A cube that ends up turned about more than one axis needs
    `assembly` to be a key in the generator's `assemblies` table (empty by default)."""
    if axis != "x":
        raise ValueError(f"only the x axis is supported, got {axis!r}")
    return _rotate_cubes(cubes, pivot, _rx(-degrees), degrees, assembly, assemblies)


def yaw_cubes(cubes, pivot, degrees, assembly=None, assemblies=None):
    """Return rigid copies yawed about the world vertical line through `pivot`.

    Positive degrees use the cube y convention. Ry multiplies the existing cube matrix
    on the left; compound results require the same assembly registration as tilt_assembly.
    """
    return _rotate_cubes(cubes, pivot, _ry(degrees), degrees, assembly, assemblies)


def _rotate_cubes(cubes, pivot, transform, degrees, assembly, assemblies):
    assemblies = {} if assemblies is None else assemblies
    if not degrees:
        result = copy.deepcopy(cubes)
        assert_axes(result, {assembly: result} if assembly is not None and assembly in assemblies else {})
        return result
    result = []
    for cube in cubes:
        moved = copy.deepcopy(cube)
        old_pivot = cube.get("pivot", cube["origin"])
        rotation = cube.get("rotation", [0, 0, 0])
        offset = [old_pivot[i] - pivot[i] for i in range(3)]
        new_pivot = [_clean(pivot[i] + v) for i, v in enumerate(_apply(transform, offset))]
        moved["origin"] = [_clean(new_pivot[i] + cube["origin"][i] - old_pivot[i]) for i in range(3)]
        moved["pivot"] = new_pivot
        moved["rotation"] = _rotation_of(_mul(transform, cube_matrix(rotation)))
        if axis_count(moved) > 1 and (assembly is None or assembly not in assemblies):
            raise ValueError(f"assembly {assembly!r} may not carry a two-axis rotation (ADR 0009, 0167)")
        result.append(moved)
    return result
