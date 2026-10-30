"""Append-only rectangular regions below a one-texel palette row."""

from typing import NamedTuple


class Region(NamedTuple):
    name: str
    x: int
    y: int
    w: int
    h: int


class Atlas:
    def __init__(self, swatches):
        self.swatches = tuple(swatches)
        if not self.swatches or len(set(self.swatches)) != len(self.swatches):
            raise ValueError("Swatches must be nonempty and unique")
        self._regions = []

    @property
    def regions(self):
        return tuple(self._regions)

    @property
    def width(self):
        return max([len(self.swatches), *(r.w for r in self._regions)])

    @property
    def height(self):
        return 1 + sum(r.h for r in self._regions)

    def allocate(self, name, w, h):
        if any(type(n) is not int or n <= 0 for n in (w, h)):
            raise ValueError("Region dimensions must be positive texel counts")
        if name in self.swatches or any(r.name == name for r in self._regions):
            raise ValueError("Atlas names must be unique")
        region = Region(name, 0, self.height, w, h)
        self._regions.append(region)
        return region

    def swatch_uv(self, name):
        return [self.swatches.index(name), 0]

    def swatch_at(self, x, y):
        return x if y == 0 and 0 <= x < len(self.swatches) else None

    def face(self, target, offset=(0, 0), uv_size=None):
        if isinstance(target, str):
            return {"uv": self.swatch_uv(target), "uv_size": [1, 1]}
        dx, dy = offset
        w, h = uv_size if uv_size is not None else (target.w - dx, target.h - dy)
        if dx < 0 or dy < 0 or w <= 0 or h <= 0 or dx + w > target.w or dy + h > target.h:
            raise ValueError("Face must stay within its region")
        return {"uv": [target.x + dx, target.y + dy], "uv_size": [w, h]}

    def pixel(self, colors, x, y, region_pixel=None):
        """Sample region callbacks in local texels; unused atlas space is transparent."""
        slot = self.swatch_at(x, y)
        if slot is not None:
            return colors[self.swatches[slot]]
        for region in self._regions:
            if region.x <= x < region.x + region.w and region.y <= y < region.y + region.h:
                return region_pixel(region, x - region.x, y - region.y)
        return (0, 0, 0, 0)
