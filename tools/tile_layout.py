"""Where each painted tile of the sports boat atlas sits (ADR 0166).

Pure data and one check, so tests can load the layout without running the whole generator.
Insertion order is the painting order; allocations must be disjoint and below the swatch row.
"""

SWATCH_ROWS = 4

# name -> ((u, v), (width, height)) in atlas texels
TILE_RECTS = {
    "quilt": ((0, 16), (8, 8)),
    "mirror": ((16, 16), (16, 8)),
    "switch_plate": ((40, 4), (24, 28)),
    "dial_pad": ((64, 4), (16, 16)),
    "display": ((84, 4), (32, 18)),
}


def assert_tile_allocations(rects, width, height):
    occupied = set()
    for name, ((u, v), (w, h)) in rects.items():
        assert all(isinstance(n, int) for n in (u, v, w, h)), f"{name}: non-integer tile bounds"
        assert 0 <= u and SWATCH_ROWS <= v and w > 0 and h > 0, f"{name}: invalid bounds or swatch overlap"
        assert u + w <= width and v + h <= height, f"{name}: outside atlas"
        cells = {(x, y) for y in range(v, v + h) for x in range(u, u + w)}
        assert not occupied & cells, f"{name}: overlapping tiles"
        occupied.update(cells)
