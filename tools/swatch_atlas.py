"""Pack swatches and rectangular texture regions into an atlas."""

from typing import NamedTuple, Sequence


class Region(NamedTuple):
    name: str
    x: int
    y: int
    w: int
    h: int


def _dimensions(w, h):
    if any(type(n) is not int or n <= 0 for n in (w, h)):
        raise ValueError("Region dimensions must be positive texel counts")


def _contains(region, x, y):
    return region.x <= x < region.x + region.w and region.y <= y < region.y + region.h


class Block:
    def __init__(self, region, atlas):
        self.region = region
        self._atlas = atlas
        self._regions = []
        self._x = region.x
        self._y = region.y
        self._shelf_height = 0

    @property
    def regions(self):
        return tuple(self._regions)

    def allocate(self, name, w, h):
        _dimensions(w, h)
        self._atlas._check_name(name)
        x, y = self._x, self._y
        shelf_height = self._shelf_height
        if x + w > self.region.x + self.region.w:
            x = self.region.x
            y += shelf_height
            shelf_height = 0
        if x + w > self.region.x + self.region.w or y + h > self.region.y + self.region.h:
            raise ValueError("Region exceeds block bounds")
        region = Region(name, x, y, w, h)
        self._regions.append(region)
        self._atlas._names.add(name)
        self._x, self._y = x + w, y
        self._shelf_height = max(shelf_height, h)
        return region


class Atlas:
    def __init__(self, swatches: Sequence[str], cell: int = 1, inset: int = 0,
                 width: int | None = None, height: int | None = None,
                 fill: tuple[int, int, int, int] = (0, 0, 0, 0)):
        self.swatches = tuple(swatches)
        if not self.swatches or len(set(self.swatches)) != len(self.swatches):
            raise ValueError("Swatches must be nonempty and unique")
        if type(cell) is not int or cell < 1 or type(inset) is not int or inset < 0 or cell - 2 * inset < 1:
            raise ValueError("Invalid swatch cell or inset")
        if width is not None and (type(width) is not int or width < len(self.swatches) * cell):
            raise ValueError("Swatches exceed atlas width")
        if height is not None and (type(height) is not int or height < cell):
            raise ValueError("Swatches exceed atlas height")
        self.cell = cell
        self.inset = inset
        self.swatch_rows = cell
        self._width = width
        self._height = height
        self.fill = tuple(fill)
        self._regions = []
        self._blocks = {}
        self._names = set(self.swatches)

    @property
    def regions(self):
        return tuple(self._regions)

    @property
    def width(self):
        return self._width if self._width is not None else max(
            [len(self.swatches) * self.cell, *(r.x + r.w for r in self._regions)])

    @property
    def height(self):
        return self._height if self._height is not None else self._bottom()

    def _bottom(self):
        return max([self.swatch_rows, *(r.y + r.h for r in self._regions)])

    def _check_name(self, name):
        if name in self._names:
            raise ValueError("Atlas names must be unique")

    def allocate(self, name, w, h):
        return self.place(name, 0, self._bottom(), w, h)

    def place(self, name, x, y, w, h):
        _dimensions(w, h)
        self._check_name(name)
        if (type(x) is not int or type(y) is not int or x < 0 or y < self.swatch_rows
                or (self._width is not None and x + w > self._width)
                or (self._height is not None and y + h > self._height)):
            raise ValueError("Region exceeds atlas bounds")
        if any(x < r.x + r.w and r.x < x + w and y < r.y + r.h and r.y < y + h
               for r in self._regions):
            raise ValueError("Regions must not overlap")
        region = Region(name, x, y, w, h)
        self._regions.append(region)
        self._names.add(name)
        return region

    def block(self, name, x, y, w, h):
        region = self.place(name, x, y, w, h)
        block = Block(region, self)
        self._blocks[name] = block
        return block

    def swatch_uv(self, name):
        return [self.swatches.index(name) * self.cell, 0]

    def swatch_at(self, x, y):
        return x // self.cell if 0 <= y < self.cell and 0 <= x < len(self.swatches) * self.cell else None

    def face(self, target, offset=(0, 0), uv_size=None):
        if isinstance(target, str):
            x, _ = self.swatch_uv(target)
            size = self.cell - 2 * self.inset
            return {"uv": [x + self.inset, self.inset], "uv_size": [size, size]}
        dx, dy = offset
        w, h = uv_size if uv_size is not None else (target.w - dx, target.h - dy)
        if dx < 0 or dy < 0 or w <= 0 or h <= 0 or dx + w > target.w or dy + h > target.h:
            raise ValueError("Face must stay within its region")
        return {"uv": [target.x + dx, target.y + dy], "uv_size": [w, h]}

    def pixel(self, colors, x, y, region_pixel=None):
        slot = self.swatch_at(x, y)
        if slot is not None:
            return colors[self.swatches[slot]]
        for region in self._regions:
            if _contains(region, x, y):
                block = self._blocks.get(region.name)
                if block is not None:
                    for subregion in block.regions:
                        if _contains(subregion, x, y):
                            return region_pixel(subregion, x - subregion.x, y - subregion.y)
                    return self.fill
                return region_pixel(region, x - region.x, y - region.y)
        return self.fill
