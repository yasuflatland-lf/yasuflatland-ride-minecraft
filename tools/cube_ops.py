"""Pure helpers for axis-aligned model cube bounds."""


def ordered_extent(x0, y0, z0, x1, y1, z1) -> tuple[list[float], list[float]]:
    """Return the origin and nonnegative size, tolerating roundoff on flat axes."""
    origin = [x0, y0, z0]
    size = []
    for axis, low, high in zip("xyz", origin, (x1, y1, z1)):
        delta = high - low
        if delta < -1e-9:
            raise ValueError(f"{axis} axis: minimum {low} exceeds maximum {high}")
        size.append(max(0, delta))
    return origin, size
