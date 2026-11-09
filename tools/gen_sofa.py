"""Generate width-parameterized amber wicker sofas (ADR 0240).

Units are model pixels, sixteen per cell; the front is -z. The shared
components also build the later two-cell sofa without stretching the weave.
"""
import argparse
import dataclasses
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

tilt = load_tool("cube_tilt")
wicker = load_tool("wicker")
texture_io = load_tool("texture_io")
ATLAS_SIZE = 1024
# The photo's strands are orange and the gaps between them stay warm and light, so all four colors of
# the shared amber palette are replaced (strand, light, dark, gap); only the weave geometry is inherited.
SOFA_WEAVE = dataclasses.replace(
    wicker.PALETTE_BLACK, columns=4, strand=(206, 150, 88), light=(226, 172, 110),
    dark=(178, 122, 70), gap=(150, 102, 58))
TEXELS_PER_PIXEL = 16
SEAT_TOP = 7.8
SEAT_POSITION = (0, SEAT_TOP / 16 - 0.24, -0.1)
FOOT = 1.0
ARM = 3.0
Z0, Z1 = -6.6, 6.6
RAIL_TOP = 4.4
ARM_TOP = 11.8
BACK_TOP = 10.6
PALETTE = {
    "beige": (222, 190, 160, 255),
    "piping": (204, 170, 140, 255),
    "metal": (196, 200, 201, 255),
    "metal_dark": (142, 148, 150, 255),
}
ASSEMBLIES = {"throw_cushion": {"owner": "sofa", "cubes": 6}}


def half_width(width_cells):
    if isinstance(width_cells, bool) or not isinstance(width_cells, int) or width_cells not in (1, 2):
        raise ValueError("width_cells must be 1 or 2")
    return (16 * width_cells - 0.8) / 2


def box(origin, size, material):
    faces = {}
    for side in ("north", "south", "east", "west", "up", "down"):
        if material == "wicker":
            a, b = {"north": (0, 1), "south": (0, 1), "east": (2, 1),
                    "west": (2, 1), "up": (0, 2), "down": (0, 2)}[side]
            # Strand rows run horizontally on every face, as in the photo, and the
            # same physical pitch holds on narrow arm fronts and the wide double base.
            faces[side] = {"uv": [0, 0],
                           "uv_size": [size[a] * TEXELS_PER_PIXEL, size[b] * TEXELS_PER_PIXEL]}
        else:
            faces[side] = {"uv": [list(PALETTE).index(material) * 4, 512], "uv_size": [4, 4]}
    return {"origin": list(origin), "size": list(size), "uv": faces}


def build_frame(width_cells):
    h = half_width(width_cells)
    depth = Z1 - Z0
    return [
        box((-h, FOOT, Z0), (ARM, ARM_TOP - FOOT, depth), "wicker"),
        box((h - ARM, FOOT, Z0), (ARM, ARM_TOP - FOOT, depth), "wicker"),
        box((-h + ARM, FOOT, Z0), (2*h - 2*ARM, RAIL_TOP - FOOT, depth), "wicker"),
        box((-h + ARM, RAIL_TOP, Z1 - 2.2), (2*h - 2*ARM, BACK_TOP - RAIL_TOP, 2.2), "wicker"),
    ]


def pillow(origin, size, edge=0.25):
    """Round all twelve edges in two steps, so the pad reads as stuffed fabric rather than a board."""
    x, y, z = origin
    w, h, d = size
    near, far = edge / 2, edge
    insets = ([(0, 0, far), (0, far, 0), (far, 0, 0)] * 1
              + [(0, near, near), (near, 0, near), (near, near, 0)])
    parts = []
    for k, (ix, iy, iz) in enumerate(insets):
        parts.append(box((x+ix, y+iy, z+iz), (w-2*ix, h-2*iy, d-2*iz), "beige" if k < 3 else "piping"))
    return parts


def build_cushions(width_cells, throw_cushions=0):
    h = half_width(width_cells)
    parts = []
    # Separate seat and back pads preserve the reference's proportions at both widths.
    inner = 2*h - 2*ARM
    for i in range(width_cells):
        x = -h + ARM + 0.05 + i * inner / width_cells
        w = inner / width_cells - 0.1
        # The seat sits in the opening and overhangs the front rail like the photo's thick cushion.
        parts += pillow((x, RAIL_TOP - 0.2, Z0 - 0.6), (w, SEAT_TOP - RAIL_TOP + 0.2, 11.4), edge=0.9)
        back = pillow((x, SEAT_TOP - 1.0, 0.8), (w, 6.0, 4.4), edge=1.0)
        parts += tilt.tilt_assembly(back, (0, SEAT_TOP - 1.0, 0.8), "x", -12)
    # The single sofa has no throw cushion; the double sofa keeps its two.
    throws = []
    for k in range(throw_cushions):
        sign = -1 if k == 0 else 1
        throw = pillow((sign*(h-2.55-6.5) if sign > 0 else -h+2.55, 5.6, -0.2), (6.5, 6.5, 1.7))
        pivot = (throw[1]["origin"][0] + 3.25, 8.85, 0.65)
        for cube in throw:
            cube["pivot"] = list(pivot)
            cube["rotation"] = [0, 0, 13*sign]
        throw = tilt.tilt_assembly(throw, pivot, "x", -15,
                                   assembly="throw_cushion", assemblies=ASSEMBLIES)
        parts += throw
        throws.append(throw)
    if throws:
        tilt.assert_axes(parts, {"throw_cushion": throws[0]}, ASSEMBLIES)
    return parts


def build_feet(width_cells):
    h = half_width(width_cells)
    return [box((x, 0, z), (2.0, FOOT, 2.0), "metal")
            for x in (-h+0.3, h-2.3) for z in (Z0+0.3, Z1-2.3)]


def cubes(width_cells=1, throw_cushions=0):
    return build_frame(width_cells) + build_cushions(width_cells, throw_cushions) + build_feet(width_cells)


def validate(parts, width_cells=1):
    lo, hi = tilt.bounds(parts)
    limits = (half_width(width_cells), 12.8, 7.6)
    if any(lo[i] < (-limits[i] if i != 1 else 0) - 1e-6 or hi[i] > limits[i]+1e-6 for i in range(3)):
        raise ValueError(f"sofa leaves footprint or height bounds: {lo}, {hi}")


def geometry(width_cells=1):
    parts = cubes(width_cells)
    validate(parts, width_cells)
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.sofa_single" if width_cells == 1 else "geometry.yasu_ride.sofa_double",
                        "texture_width": ATLAS_SIZE, "texture_height": ATLAS_SIZE,
                        "visible_bounds_width": width_cells+1, "visible_bounds_height": 2,
                        "visible_bounds_offset": [0, 0.5, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0], "cubes": parts}]}]}


def texture_pixels():
    horizontal = wicker.weave_tile(SOFA_WEAVE)
    def pixel(x, y):
        if y < 512:
            return horizontal[y % 16][x % 16]
        return list(PALETTE.values())[x // 4] if y < 516 and x < 16 else (0, 0, 0, 0)
    return pixel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / "models/entity/yasu_ride/sofa_single.geo.json", geometry())
    out.png(args.resource_pack / "textures/entity/yasu_ride/sofa_single.png", ATLAS_SIZE, ATLAS_SIZE, texture_pixels())
    out.finish("Sofa assets are stale; run pnpm model.", "sofa model and texture are up to date")


if __name__ == "__main__":
    main()
