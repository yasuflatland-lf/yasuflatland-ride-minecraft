"""Pure deterministic MaxRects packing in texels, without rotation."""

import math
import random
from collections.abc import Sequence
from dataclasses import dataclass
from enum import IntEnum
from typing import NamedTuple


class Size(NamedTuple):
    """Texel dimensions including the trailing gutter."""

    w: int
    h: int


class Rect(NamedTuple):
    x: int
    y: int
    w: int
    h: int

    def overlaps(self, other: "Rect") -> bool:
        x, y, w, h = self
        xx, yy, ww, hh = other
        return x < xx + ww and xx < x + w and y < yy + hh and yy < y + h

    def contains(self, other: "Rect") -> bool:
        x, y, w, h = self
        xx, yy, ww, hh = other
        return x <= xx and y <= yy and xx + ww <= x + w and yy + hh <= y + h


class ScoreMode(IntEnum):
    BEST_SHORT_SIDE = 0
    BOTTOM_LEFT = 1


class FreeSpace:
    def __init__(self, width: int, height: int):
        self._rects = [Rect(0, 0, width, height)]

    def best_fit(self, size: Size, mode: ScoreMode) -> Rect | None:
        w, h = size
        best = None
        short_side = mode == ScoreMode.BEST_SHORT_SIDE
        for x, y, fw, fh in self._rects:
            if w <= fw and h <= fh:
                score = ((min(fw - w, fh - h), max(fw - w, fh - h), y, x)
                         if short_side else (y + h, x, fw * fh - w * h))
                candidate = (score, x, y)
                if best is None or candidate < best:
                    best = candidate
        if best is None:
            return None
        _, x, y = best
        return Rect(x, y, w, h)

    def place(self, rect: Rect) -> None:
        x, y, w, h = rect
        right, bottom = x + w, y + h
        survivors = []
        pieces = []
        for free in self._rects:
            a, b, c, d = free
            # Inlined Rect.overlaps: this loop dominates the build time.
            if not (a < right and x < a + c and b < bottom and y < b + d):
                survivors.append(free)
                continue
            if a < x:
                pieces.append(Rect(a, b, x - a, d))
            if right < a + c:
                pieces.append(Rect(right, b, a + c - right, d))
            if b < y:
                pieces.append(Rect(a, b, c, y - b))
            if bottom < b + d:
                pieces.append(Rect(a, bottom, c, b + d - bottom))
        # The old list is maximal, so no survivor contains another. Each new piece
        # is a subset of an old rectangle that overlapped the placement, whereas
        # survivors are disjoint from it. If a piece contained a survivor, its
        # distinct parent would have contained that survivor in the old list,
        # contradicting maximality. Only new pieces need containment checks
        # against the survivors and the other new pieces.
        candidates = survivors + pieces
        for piece in pieces:
            a, b, c, d = piece
            end_x, end_y = a + c, b + d
            for other in candidates:
                x, y, w, h = other
                if x <= a and y <= b and end_x <= x + w and end_y <= y + h and other != piece:
                    break
            else:
                survivors.append(piece)
        self._rects = sorted(set(survivors))

    def rects(self) -> list[Rect]:
        return list(self._rects)


@dataclass(frozen=True)
class PackRequest:
    sizes: tuple[Size, ...]
    gutter: int
    max_side: int | None


@dataclass(frozen=True)
class PackResult:
    size: tuple[int, int]
    origins: tuple[tuple[int, int], ...]


# The spike searched these widths and orders; dimensions remain unconstrained.
PACK_WIDTHS = (416, 448, 480, 512, 576, 640, 704, 768, 896, 1024)
PACK_SEED = 27729
PACK_RANDOM_ORDERS = 40
FULL_SEARCH_MAX_REGIONS = 256
PACK_ORDER_WEIGHT_RANGE = (0.65, 1.4)


def attempt(sizes, width, height, order, mode: ScoreMode) -> dict[int, Rect] | None:
    free = FreeSpace(width, height)
    placed = {}
    for i in order:
        rect = free.best_fit(sizes[i], mode)
        if rect is None:
            return None
        placed[i] = rect
        free.place(rect)
    return placed


@dataclass(frozen=True)
class SearchEffort:
    random_orders: int

    @classmethod
    def for_request(cls, region_count: int) -> "SearchEffort":
        return cls(PACK_RANDOM_ORDERS if region_count <= FULL_SEARCH_MAX_REGIONS else 0)


def search_orders(sizes: Sequence[Size]) -> list[list[int]]:
    orders = []
    for key in (lambda s: math.prod(s), max, lambda s: s[1], lambda s: s[0], sum):
        orders.append(sorted(range(len(sizes)), key=lambda i: key(sizes[i]), reverse=True))
    rng = random.Random(PACK_SEED)
    for _ in range(SearchEffort.for_request(len(sizes)).random_orders):
        scores = [math.prod(s) * rng.uniform(*PACK_ORDER_WEIGHT_RANGE) for s in sizes]
        orders.append(sorted(range(len(sizes)), key=lambda i: scores[i], reverse=True))
    return orders


def search(request: PackRequest) -> PackResult:
    sizes, gutter, max_side = request.sizes, request.gutter, request.max_side
    orders = search_orders(sizes)
    area = sum(math.prod(s) for s in sizes)
    min_width = max(w for w, _ in sizes)
    widths = sorted({min_width, max(min_width, math.ceil(math.sqrt(area))),
                     *(w for w in PACK_WIDTHS if w >= min_width)})
    if max_side is not None:
        # Minimum area alone can pick a tall narrow atlas that exceeds a texture limit.
        # Packing includes a trailing gutter that is omitted from the final atlas.
        limit = max_side + gutter
        widths = sorted({*widths, *range(min_width, limit + 1, 64), limit})
        widths = [w for w in widths if w <= limit]
    best = None
    for width in widths:
        low = max(max(h for _, h in sizes), math.ceil(area / width))
        high = sum(h for _, h in sizes)
        if max_side is not None:
            high = min(high, limit)
        while low <= high:
            height = (low + high) // 2
            found = None
            for order in orders:
                for mode in (ScoreMode.BEST_SHORT_SIDE, ScoreMode.BOTTOM_LEFT):
                    found = attempt(sizes, width, height, order, mode)
                    if found is not None:
                        break
                if found is not None:
                    break
            if found is None:
                low = height + 1
                continue
            used_w = max(x + w for x, y, w, h in found.values()) - gutter
            used_h = max(y + h for x, y, w, h in found.values()) - gutter
            origins = tuple(found[i][:2] for i in range(len(sizes)))
            candidate = (used_w * used_h, used_w, used_h, origins)
            if best is None or candidate < best:
                best = candidate
            high = height - 1
    if best is None:
        raise ValueError(f"Regions do not fit within a {max_side} by {max_side} atlas")
    _, width, height, origins = best
    return PackResult((width, height), origins)
