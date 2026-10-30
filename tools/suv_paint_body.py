"""Painted steel panels and matte hardtop in the fixed body atlas block."""

import math
from functools import cache

from tool_loader import load_tool

palette = load_tool("suv_palette")
dims = load_tool("suv_dims")
material = load_tool("suv_material")
RegionSpec = load_tool("suv_texture").RegionSpec
MIN_FLAKE_FACE_PX = 1
FLAKE_COLOR_JITTER = 6
FLAKE_METAL_JITTER = 8
FLAKE_ROUGH_JITTER = 5
GROOVE_DARKEN = 24
HIGHLIGHT_LIGHTEN = 10
HARDTOP_GRAIN = 2
GROOVE_RELIEF = -2
RECESS_RELIEF = -1
RECESS_PADDING_TEXELS = 2

DETAIL_DELTAS = {"groove": -GROOVE_DARKEN, "highlight": HIGHLIGHT_LIGHTEN,
                 "recess": -GROOVE_DARKEN // 2, "recess_highlight": HIGHLIGHT_LIGHTEN}


# Importing the atlas here would re-enter its painter allocation.
def density():
    return load_tool("suv_atlas").TEXELS_PER_PIXEL


# The full-density roof and underside overflow the 160-row block together.
# ADR 0192 permits reducing the largest flat faces first; steel stays at 4.
HARDTOP_FLAT_DENSITY = 2
REGION_DENSITY = 4


def panel(name, w, h, base="body", scale=REGION_DENSITY):
    return RegionSpec(name, math.ceil(w * scale), math.ceil(h * scale), base)


REGIONS = (
    panel("flake", 2 * dims.BODY_HALF_WIDTH, 2 * dims.BODY_HALF_WIDTH),
    panel("hardtop", dims.ROOF_FRONT - dims.REAR, 2 * dims.BODY_HALF_WIDTH, "hardtop", HARDTOP_FLAT_DENSITY),
    panel("hardtop_down", 2 * dims.BODY_HALF_WIDTH, dims.ROOF_FRONT - dims.REAR, "hardtop", HARDTOP_FLAT_DENSITY),
    panel("hood_top", dims.FRONT - dims.HOOD_REAR_Z, 2 * dims.BODY_HALF_WIDTH),
    panel("tailgate", 2 * dims.BODY_HALF_WIDTH, dims.BELT_Y - dims.FLOOR_Y),
    panel("door_front", dims.FRONT_DOOR_HINGE_Z - dims.B_PILLAR_FRONT_Z, dims.BELT_Y - dims.FLOOR_Y),
    panel("door_rear", dims.B_PILLAR_REAR_Z - dims.CARGO_FRONT, dims.BELT_Y - dims.FLOOR_Y),
    panel("hardtop_rib_down", 1, dims.ROOF_SEAM - dims.REAR, "hardtop_rib"),
    panel("hood_side", dims.FRONT - dims.HOOD_REAR_Z, dims.HOOD_TOP_Y - dims.ARCH_TOP_Y),
    panel("hood_lower", dims.FRONT - dims.FRONT_DOOR_HINGE_Z, dims.ARCH_TOP_Y - dims.FLOOR_Y),
    panel("cargo", dims.CARGO_FRONT - (dims.REAR + 1), dims.BELT_Y - dims.FLOOR_Y),
    panel("hardtop_side", dims.ROOF_FRONT - dims.REAR, dims.ROOF_Y - dims.BELT_Y, "hardtop"),
    panel("hardtop_rib", dims.ROOF_FRONT - dims.REAR, 1, "hardtop_rib"),
)
SPECS = {spec.name: spec for spec in REGIONS}


def texel_hash(x, y):
    value = ((x * 0x1F123BB5) ^ (y * 0x5F356495)) & 0xFFFFFFFF
    value = ((value ^ (value >> 16)) * 0x45D9F3B) & 0xFFFFFFFF
    return value ^ (value >> 16)


def jitter(u, v, bound, shift=0):
    return (texel_hash(u, v) >> shift) % (2 * bound + 1) - bound


def door_extent(region):
    return load_tool("suv_shell").DOORS["door_fr" if region == "door_front" else "door_rr"]


@cache
def recess(region):
    # Handles and DOORS are available only after atlas allocation finishes.
    shell = load_tool("suv_shell")
    _, _, back = door_extent(region)
    center_z = back + (shell.HANDLE_REAR_OFFSET + shell.HANDLE_FRONT_OFFSET) / 2
    center_y = (shell.HANDLE_BOTTOM_Y + shell.HANDLE_TOP_Y) / 2
    return ((center_z - back) * density(), (dims.BELT_Y - center_y) * density(),
            (shell.HANDLE_FRONT_OFFSET - shell.HANDLE_REAR_OFFSET) * density() / 2 + RECESS_PADDING_TEXELS,
            (shell.HANDLE_TOP_Y - shell.HANDLE_BOTTOM_Y) * density() / 2 + RECESS_PADDING_TEXELS)


@cache
def arch_panel(region):
    if region.startswith("door_"):
        _, front, back = door_extent(region)
        return back, dims.BELT_Y, dims.FRONT_AXLE_Z if front > 0 else dims.REAR_AXLE_Z
    return {
        "hood_side": (dims.HOOD_REAR_Z, dims.HOOD_TOP_Y, dims.FRONT_AXLE_Z),
        "hood_lower": (dims.FRONT_DOOR_HINGE_Z, dims.ARCH_TOP_Y, dims.FRONT_AXLE_Z),
        "cargo": (dims.REAR + 1, dims.BELT_Y, dims.REAR_AXLE_Z),
    }.get(region)


def arch_detail(region, u, v):
    panel = arch_panel(region)
    if panel is None:
        return None
    back, top, axle = panel
    y = top - (v + 0.5) / density()
    z = back + (u + 0.5) / density()
    # Use the same trapezoid as arch_cut so separate strips share one continuous joint.
    if y >= dims.ARCH_TOP_Y:
        if abs(z - axle) > dims.ARCH_TOP_HALF:
            return None
        distance = y - dims.ARCH_TOP_Y
    else:
        distance = abs(z - axle) - (dims.arch_side_z(axle, 1, y) - axle)
    texels = distance * density()
    if 0 <= texels < 1:
        return "groove"
    if 1 <= texels < 2:
        return "highlight"
    return None


def detail(region, u, v):
    spec = SPECS[region]
    if region == "flake" or spec.base != "body":
        return None
    edge = min(u, v, spec.w - 1 - u, spec.h - 1 - v)
    if edge == 0:
        return "groove"
    if edge == 1:
        return "highlight"
    if region.startswith("door_"):
        x, y, rx, ry = recess(region)
        if ((u + 0.5 - x) / rx) ** 2 + ((v + 0.5 - y) / ry) ** 2 <= 1:
            return "recess_highlight" if v + 0.5 > y + ry / 2 else "recess"
    return arch_detail(region, u, v)


def color(region, u, v, paint):
    spec = SPECS[region]
    if spec.base != "body":
        rgb = palette.PALETTE[spec.base]
        delta = jitter(u, v, HARDTOP_GRAIN)
    else:
        rgb = paint.body
        kind = detail(region, u, v)
        delta = DETAIL_DELTAS.get(kind, jitter(u, v, FLAKE_COLOR_JITTER))
    return (*(max(0, min(255, c + delta)) for c in rgb), 255)


def mer(region, u, v, paint):
    if SPECS[region].base != "body":
        return material.Mer(0, 0, material.HARDTOP_ROUGHNESS + jitter(u, v, HARDTOP_GRAIN, 8))
    return material.Mer(material.PAINT_METALNESS + jitter(u, v, FLAKE_METAL_JITTER, 8), 0,
                        material.PAINT_ROUGHNESS + jitter(u, v, FLAKE_ROUGH_JITTER, 16))


def lit(region, u, v):
    return False


def relief(region, u, v):
    kind = detail(region, u, v)
    if kind == "groove":
        return GROOVE_RELIEF
    if kind in ("recess", "recess_highlight"):
        return RECESS_RELIEF
    return None
