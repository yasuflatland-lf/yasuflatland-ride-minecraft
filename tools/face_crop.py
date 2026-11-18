"""Trim alpha-tested plates and extract their sampled atlas regions."""

import copy
from fractions import Fraction

from tool_loader import load_tool

atlas = load_tool("region_atlas")

# The directions are for increasing face U and V in Bedrock cube space.
FACE_AXES = {
    "north": ((0, 1), (1, -1)),
    "south": ((0, -1), (1, -1)),
    "east": ((2, 1), (1, -1)),
    "west": ((2, -1), (1, -1)),
    "up": ((0, 1), (2, -1)),
    "down": ((0, 1), (2, -1)),
}


def is_visible(face, image: atlas.AtlasImage) -> bool:
    return not image.is_clear(atlas.UvRect.of(face).texels())


def _crop_axis(origin, size, start, span, lo, hi, direction):
    origin, size, start, span = (Fraction(str(value)) for value in (origin, size, start, span))
    if not span or size <= 0:
        return None
    a, b = sorted(((lo - start) / span, (hi - start) / span))
    a, b = max(0, a), min(1, b)
    if a >= b:
        return None
    new_origin = origin + size * (a if direction > 0 else 1 - b)
    new_size = size * (b - a)
    # Bedrock receives dimensions rounded to thousandths by the model generator.
    if any((value * 1000).denominator != 1 for value in (new_origin, new_size)):
        return None
    return new_origin, new_size, size / abs(span), start + a * span, (b - a) * span


def crop_plate(cube: dict, image: atlas.AtlasImage) -> dict | None:
    faces = cube["uv"]
    axes = {tuple(axis for axis, _ in FACE_AXES[name]) for name in faces}
    if len(axes) != 1 or "inflate" in cube or cube.get("mirror"):
        return None
    axes, = axes
    shape = None
    cropped_uv = {}
    for name, face in faces.items():
        if face.get("uv_rotation"):
            return None
        uv = atlas.UvRect.of(face)
        bounds = image.alpha_bounds(uv.texels())
        if bounds is None:
            return None
        cropped = [_crop_axis(cube["origin"][axis], cube["size"][axis], start, span, lo, hi, direction)
                   for (axis, direction), start, span, lo, hi in zip(
                       FACE_AXES[name], (uv.u, uv.v), (uv.w, uv.h),
                       (bounds.x0, bounds.y0), (bounds.x1, bounds.y1))]
        if any(value is None for value in cropped):
            return None
        dimensions = tuple(value[:3] for value in cropped)
        if shape is not None and dimensions != shape:
            return None
        shape = dimensions
        u, v = cropped
        cropped_uv[name] = copy.copy(face)
        atlas.UvRect(float(u[3]), float(v[3]), float(u[4]), float(v[4])).apply(cropped_uv[name])
    origin, size = list(cube["origin"]), list(cube["size"])
    for axis, (start, length, _) in zip(axes, shape):
        origin[axis], size[axis] = float(start), float(length)
    if size == list(cube["size"]):
        return None
    return {**cube, "origin": origin, "size": size, "uv": cropped_uv}


def _crop_sample(layout, region, face):
    placement = layout.placement(region.name)
    uv = atlas.UvRect.of(face)
    cells = uv.texels()
    local = atlas.UvRect(uv.u - placement.x, uv.v - placement.y, uv.w, uv.h).to_atlas(
        atlas.Placement(0, 0, placement.flip_x, placement.flip_y), region.width, region.height)
    x0, x1 = cells.x0 - placement.x, cells.x1 - placement.x
    y0, y1 = cells.y0 - placement.y, cells.y1 - placement.y
    if placement.flip_x:
        x0, x1 = region.width - x1, region.width - x0
    if placement.flip_y:
        y0, y1 = region.height - y1, region.height - y0
    return atlas.TexelRect(x0, y0, x1, y1), local


def _crop_name(region, rect):
    return f"{region.name}@{rect.x0},{rect.y0},{rect.x1},{rect.y1}"


def crop_region_uv(layout: atlas.Layout, region: atlas.Region, face):
    rect, uv = _crop_sample(layout, region, face)
    return _crop_name(region, rect), atlas.UvRect(uv.u - rect.x0, uv.v - rect.y0, uv.w, uv.h)


def crop_regions(layout: atlas.Layout, faces) -> list[atlas.Region]:
    sources = {region.name: region for region in layout.regions}
    crops = {}
    for face in faces:
        source = sources[layout.face_region(face)]
        rect, _ = _crop_sample(layout, source, face)
        key = (source.name, rect)
        if key not in crops:
            crops[key] = atlas.Region(
                _crop_name(source, rect), rect.x1 - rect.x0, rect.y1 - rect.y0, source.material,
                lambda u, v, source=source, rect=rect: source.pixel(rect.x0 + u, rect.y0 + v))
    return list(crops.values())
