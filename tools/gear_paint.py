"""Deterministic tile painting (ADR 0247); pnpm model:check compares pixels."""

import math


def _pixels(tile, region=None):
    x0, y0, x1, y1 = region if region is not None else (0, 0, tile.width, tile.height)
    for y in range(max(0, math.ceil(y0 - 0.5)), min(tile.height, math.ceil(y1 - 0.5))):
        for x in range(max(0, math.ceil(x0 - 0.5)), min(tile.width, math.ceil(x1 - 0.5))):
            yield x, y


def fill(tile, color, x0=0, y0=0, x1=None, y1=None):
    for x, y in _pixels(tile, (x0, y0, tile.width if x1 is None else x1,
                               tile.height if y1 is None else y1)):
        tile.set(x, y, color)


def _mix(start, end, t):
    t = min(max(t, 0), 1)
    return tuple(round(a + (b - a) * t) for a, b in zip(start, end))


def linear_gradient(tile, start_color, end_color, p0, p1, region=None):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    length2 = dx * dx + dy * dy
    for x, y in _pixels(tile, region):
        t = ((x + 0.5 - p0[0]) * dx + (y + 0.5 - p0[1]) * dy) / length2 if length2 else 0
        tile.set(x, y, _mix(start_color, end_color, t))


def radial_gradient(tile, inner_color, outer_color, center, radius, region=None):
    if radius <= 0:
        raise ValueError("radius must be positive")
    for x, y in _pixels(tile, region):
        t = math.hypot(x + 0.5 - center[0], y + 0.5 - center[1]) / radius
        tile.set(x, y, _mix(inner_color, outer_color, t))


def polygon(tile, points, color):
    for x, y in _pixels(tile):
        px, py, inside = x + 0.5, y + 0.5, False
        for (ax, ay), (bx, by) in zip(points, points[1:] + points[:1]):
            if (ay > py) != (by > py) and px < ax + (py - ay) * (bx - ax) / (by - ay):
                inside = not inside
        if inside:
            tile.set(x, y, color)


def ellipse(tile, center, radii, color):
    rx, ry = radii
    if rx <= 0 or ry <= 0:
        return
    for x, y in _pixels(tile):
        if ((x + 0.5 - center[0]) / rx) ** 2 + ((y + 0.5 - center[1]) / ry) ** 2 <= 1:
            tile.set(x, y, color)


def line(tile, p0, p1, color, width=1):
    if width <= 0:
        return
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    length2 = dx * dx + dy * dy
    for x, y in _pixels(tile):
        px, py = x + 0.5 - p0[0], y + 0.5 - p0[1]
        t = min(max((px * dx + py * dy) / length2, 0), 1) if length2 else 0
        if (px - t * dx) ** 2 + (py - t * dy) ** 2 <= (width / 2) ** 2:
            tile.set(x, y, color)


def rounded_rect(tile, x0, y0, x1, y1, radius, color):
    radius = max(0, min(radius, (x1 - x0) / 2, (y1 - y0) / 2))
    for x, y in _pixels(tile, (x0, y0, x1, y1)):
        dx = max(x0 + radius - (x + 0.5), 0, x + 0.5 - (x1 - radius))
        dy = max(y0 + radius - (y + 0.5), 0, y + 0.5 - (y1 - radius))
        if dx * dx + dy * dy <= radius * radius:
            tile.set(x, y, color)


def noise(tile, seed, amount, region=None):
    if not isinstance(amount, int) or amount < 0:
        raise ValueError("amount must be a nonnegative integer")
    for x, y in _pixels(tile, region):
        value = (seed ^ (x * 0x9E3779B9) ^ (y * 0x85EBCA6B)) & 0xFFFFFFFF
        value = ((value ^ (value >> 16)) * 0x7FEB352D) & 0xFFFFFFFF
        value = ((value ^ (value >> 15)) * 0x846CA68B) & 0xFFFFFFFF
        value ^= value >> 16
        offset = value % (2 * amount + 1) - amount
        r, g, b, a = tile.get(x, y)
        tile.set(x, y, tuple(min(max(c + offset, 0), 255) for c in (r, g, b)) + (a,))


def cutout(tile, mask):
    for x, y in _pixels(tile):
        if mask(x + 0.5, y + 0.5):
            tile.set(x, y, tile.get(x, y)[:3] + (0,))


FONT = {
    '0': ('###', '#.#', '#.#', '#.#', '###'),
    '1': ('.#.', '##.', '.#.', '.#.', '###'),
    '2': ('###', '..#', '###', '#..', '###'),
    '3': ('###', '..#', '###', '..#', '###'),
    '4': ('#.#', '#.#', '###', '..#', '..#'),
    '5': ('###', '#..', '###', '..#', '###'),
    '6': ('###', '#..', '###', '#.#', '###'),
    '7': ('###', '..#', '.#.', '.#.', '.#.'),
    '8': ('###', '#.#', '###', '#.#', '###'),
    '9': ('###', '#.#', '###', '..#', '###'),
    'A': ('.#.', '#.#', '###', '#.#', '#.#'),
    'B': ('##.', '#.#', '##.', '#.#', '##.'),
    'C': ('.##', '#..', '#..', '#..', '.##'),
    'D': ('##.', '#.#', '#.#', '#.#', '##.'),
    'E': ('###', '#..', '##.', '#..', '###'),
    'F': ('###', '#..', '##.', '#..', '#..'),
    'G': ('.##', '#..', '#.#', '#.#', '.##'),
    'H': ('#.#', '#.#', '###', '#.#', '#.#'),
    'I': ('###', '.#.', '.#.', '.#.', '###'),
    'J': ('..#', '..#', '..#', '#.#', '.#.'),
    'K': ('#.#', '#.#', '##.', '#.#', '#.#'),
    'L': ('#..', '#..', '#..', '#..', '###'),
    'M': ('#.#', '###', '###', '#.#', '#.#'),
    'N': ('#.#', '###', '###', '###', '#.#'),
    'O': ('.#.', '#.#', '#.#', '#.#', '.#.'),
    'P': ('##.', '#.#', '##.', '#..', '#..'),
    'Q': ('.#.', '#.#', '#.#', '###', '..#'),
    'R': ('##.', '#.#', '##.', '#.#', '#.#'),
    'S': ('.##', '#..', '.#.', '..#', '##.'),
    'T': ('###', '.#.', '.#.', '.#.', '.#.'),
    'U': ('#.#', '#.#', '#.#', '#.#', '###'),
    'V': ('#.#', '#.#', '#.#', '#.#', '.#.'),
    'W': ('#.#', '#.#', '###', '###', '#.#'),
    'X': ('#.#', '#.#', '.#.', '#.#', '#.#'),
    'Y': ('#.#', '#.#', '.#.', '.#.', '.#.'),
    'Z': ('###', '..#', '.#.', '#..', '###'),
    ' ': ('...', '...', '...', '...', '...'),
    '-': ('...', '...', '###', '...', '...'),
    '.': ('...', '...', '...', '...', '.#.'),
    ':': ('...', '.#.', '...', '.#.', '...'),
    '/': ('..#', '..#', '.#.', '#..', '#..'),
    '+': ('...', '.#.', '###', '.#.', '...'),
    '%': ('#.#', '..#', '.#.', '#..', '#.#'),
}


def text_width(string, scale=1, spacing=1):
    if not isinstance(scale, int) or scale < 1 or spacing < 0:
        raise ValueError("scale must be a positive integer and spacing nonnegative")
    for char in string:
        if char not in FONT:
            raise ValueError(f"Unknown glyph: {char}")
    return len(string) * 3 * scale + max(0, len(string) - 1) * spacing


def text(tile, x, y, string, color, scale=1, spacing=1):
    text_width(string, scale, spacing)
    for char in string:
        for row, glyph in enumerate(FONT[char]):
            for col, bit in enumerate(glyph):
                if bit == "#":
                    fill(tile, color, x + col * scale, y + row * scale,
                         x + (col + 1) * scale, y + (row + 1) * scale)
        x += 3 * scale + spacing
