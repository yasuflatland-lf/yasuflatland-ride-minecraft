"""Frozen tuple packer from HEAD before issue #2001; independent regression oracle."""

import math
import random


# The spike searched these widths and orders; dimensions remain unconstrained.
PACK_WIDTHS = (416, 448, 480, 512, 576, 640, 704, 768, 896, 1024)
PACK_SEED = 27729
PACK_RANDOM_ORDERS = 40
PACK_ORDER_WEIGHT_RANGE = (0.65, 1.4)


def _overlap(a, b):
    x, y, w, h = a
    xx, yy, ww, hh = b
    return x < xx + ww and xx < x + w and y < yy + hh and yy < y + h


def _contains(a, b):
    x, y, w, h = a
    xx, yy, ww, hh = b
    return x <= xx and y <= yy and xx + ww <= x + w and yy + hh <= y + h


def _attempt(sizes, width, height, order, mode):
    free = [(0, 0, width, height)]
    placed = {}
    for i in order:
        w, h = sizes[i]
        choices = []
        for x, y, fw, fh in free:
            if w <= fw and h <= fh:
                score = ((min(fw - w, fh - h), max(fw - w, fh - h), y, x)
                         if mode == 0 else (y + h, x, fw * fh - w * h))
                choices.append((score, x, y))
        if not choices:
            return None
        _, x, y = min(choices)
        rect = (x, y, w, h)
        placed[i] = rect
        remaining = []
        for a, b, c, d in free:
            if not _overlap((a, b, c, d), rect):
                remaining.append((a, b, c, d))
                continue
            if a < x:
                remaining.append((a, b, x - a, d))
            if x + w < a + c:
                remaining.append((x + w, b, a + c - x - w, d))
            if b < y:
                remaining.append((a, b, c, y - b))
            if y + h < b + d:
                remaining.append((a, y + h, c, b + d - y - h))
        unique = sorted(set(remaining))
        free = [a for a in unique if not any(a != b and _contains(b, a) for b in unique)]
    return placed


def reference_pack(sizes, gutter, max_side):
    gutter_px = gutter
    regions = sizes
    orders = []
    for key in (lambda s: math.prod(s), max, lambda s: s[1], lambda s: s[0], sum):
        orders.append(sorted(range(len(sizes)), key=lambda i: key(sizes[i]), reverse=True))
    rng = random.Random(PACK_SEED)
    for _ in range(PACK_RANDOM_ORDERS):
        scores = [math.prod(s) * rng.uniform(*PACK_ORDER_WEIGHT_RANGE) for s in sizes]
        orders.append(sorted(range(len(sizes)), key=lambda i: scores[i], reverse=True))
    area = sum(math.prod(s) for s in sizes)
    min_width = max(w for w, _ in sizes)
    widths = sorted({min_width, max(min_width, math.ceil(math.sqrt(area))),
                     *(w for w in PACK_WIDTHS if w >= min_width)})
    if max_side is not None:
        # Minimum area alone can pick a tall narrow atlas that exceeds a texture limit.
        # Packing includes a trailing gutter that is omitted from the final atlas.
        limit = max_side + gutter_px
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
                for mode in (0, 1):
                    found = _attempt(sizes, width, height, order, mode)
                    if found is not None:
                        break
                if found is not None:
                    break
            if found is None:
                low = height + 1
                continue
            used_w = max(x + w for x, y, w, h in found.values()) - gutter_px
            used_h = max(y + h for x, y, w, h in found.values()) - gutter_px
            origins = tuple(found[i][:2] for i in range(len(regions)))
            candidate = (used_w * used_h, used_w, used_h, origins)
            if best is None or candidate < best:
                best = candidate
            high = height - 1
    if best is None:
        raise ValueError(f"Regions do not fit within a {max_side} by {max_side} atlas")
    _, width, height, origins = best
    return (width, height), origins
