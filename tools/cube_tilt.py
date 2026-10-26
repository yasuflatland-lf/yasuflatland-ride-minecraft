"""Tilt a whole assembly of model cubes about one common axis (ADR 0166).

Cube `rotation` values are in the game's convention: tools/render_preview.py negates the x and z
turns (game_turn) and then applies x, then y, then z about the cube's pivot, so the matrix of a cube
is Rz(-rz) * Ry(ry) * Rx(-rx) in the preview's own rotate(). Tilting an assembly multiplies that
matrix on the left by the tilt, which usually needs all three axes, so the result is decomposed back
into the same order. Pure math, no generator state, so tests can import it on its own.
"""
import copy
import math

# Assemblies that may carry a cube turned about more than one axis (ADR 0166, ADR 0009).
ONE_AXIS_EXCEPTION = ("wheel",)

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


def tilt_assembly(cubes, pivot, axis, degrees, assembly=None):
    """Return copies of `cubes` moved rigidly, as one body, about the world line through `pivot`
    along `axis` (only "x"). `degrees` has the sign of a cube's x rotation: tilting a cube turned
    [rx, 0, 0] gives [rx + degrees, 0, 0]. A cube that ends up turned about more than one axis needs
    `assembly` to be named in ONE_AXIS_EXCEPTION."""
    if axis != "x":
        raise ValueError(f"only the x axis is supported, got {axis!r}")
    if not degrees:
        return copy.deepcopy(cubes)
    tilt = _rx(-degrees)
    result = []
    for cube in cubes:
        moved = copy.deepcopy(cube)
        old_pivot = cube.get("pivot", cube["origin"])
        rotation = cube.get("rotation", [0, 0, 0])
        offset = [old_pivot[i] - pivot[i] for i in range(3)]
        new_pivot = [_clean(pivot[i] + v) for i, v in enumerate(_apply(tilt, offset))]
        moved["origin"] = [_clean(new_pivot[i] + cube["origin"][i] - old_pivot[i]) for i in range(3)]
        moved["pivot"] = new_pivot
        moved["rotation"] = _rotation_of(_mul(tilt, cube_matrix(rotation)))
        if sum(1 for angle in moved["rotation"] if angle) > 1 and assembly not in ONE_AXIS_EXCEPTION:
            raise ValueError(f"assembly {assembly!r} may not carry a two-axis rotation (ADR 0009, 0166)")
        result.append(moved)
    return result
