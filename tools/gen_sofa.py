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
    wicker.PALETTE_AMBER, strand=(184, 138, 88), light=(212, 176, 130),
    dark=(150, 108, 68), gap=(104, 72, 46))
TEXELS_PER_PIXEL = 16
SEAT_TOP = 6.4
SEAT_POSITION = (0, SEAT_TOP / 16 - 0.24, -0.1)
PALETTE = {
    "beige": (230, 200, 170, 255),
    "piping": (214, 182, 152, 255),
    "metal": (196, 200, 201, 255),
    "metal_dark": (142, 148, 150, 255),
}
ASSEMBLIES = {"throw_cushion": {"owner": "sofa", "cubes": 3}}


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
            # Separate transposed weave fields keep the same physical pitch on
            # every face, including the narrow arm fronts and wide double base.
            faces[side] = {"uv": [512 if side in ("east", "west") else 0, 0],
                           "uv_size": [size[a] * TEXELS_PER_PIXEL, size[b] * TEXELS_PER_PIXEL]}
        else:
            faces[side] = {"uv": [list(PALETTE).index(material) * 4, 512], "uv_size": [4, 4]}
    return {"origin": list(origin), "size": list(size), "uv": faces}


def build_frame(width_cells):
    h = half_width(width_cells)
    return [
        box((-h, 0.6, -7.6), (2.4, 10.2, 15.2), "wicker"),
        box((h - 2.4, 0.6, -7.6), (2.4, 10.2, 15.2), "wicker"),
        box((-h + 2.4, 0.6, -7.6), (2*h - 4.8, 3.4, 15.2), "wicker"),
        box((-h + 2.4, 4, 5.6), (2*h - 4.8, 6.8, 2), "wicker"),
    ]


def pillow(origin, size):
    """Inset broad faces soften the silhouette and leave a fine sewn edge."""
    x, y, z = origin
    w, h, d = size
    edge = 0.25
    return [box((x+edge, y, z+edge), (w-2*edge, h, d-2*edge), "piping"),
            box((x, y+edge, z+edge), (w, h-2*edge, d-2*edge), "beige"),
            box((x+edge, y+edge, z), (w-2*edge, h-2*edge, d), "beige")]


def build_cushions(width_cells):
    h = half_width(width_cells)
    parts = []
    # Separate seat and back pads preserve the reference's proportions at both widths.
    inner = 2*h - 4.8
    for i in range(width_cells):
        x = -h + 2.45 + i * inner / width_cells
        w = inner / width_cells - 0.1
        parts += pillow((x, 4, -7.2), (w, SEAT_TOP-4, 12.5))
        back = pillow((x, 6.2, 3.4), (w, 5.8, 2.1))
        parts += tilt.tilt_assembly(back, (0, 6.2, 3.4), "x", -12)
    # A square pad rests against the left arm, tilted sideways and back together.
    throw = pillow((-h+2.55, 5.6, -0.2), (6.5, 6.5, 1.7))
    pivot = (-h+5.8, 8.85, 0.65)
    for cube in throw:
        cube["pivot"] = list(pivot)
        cube["rotation"] = [0, 0, -13]
    throw = tilt.tilt_assembly(throw, pivot, "x", -15,
                               assembly="throw_cushion", assemblies=ASSEMBLIES)
    parts += throw
    tilt.assert_axes(parts, {"throw_cushion": throw}, ASSEMBLIES)
    return parts


def build_feet(width_cells):
    h = half_width(width_cells)
    return [box((x, 0, z), (1.25, 0.6, 1.25), "metal")
            for x in (-h+0.5, h-1.75) for z in (-7.1, 5.85)]


def cubes(width_cells=1):
    return build_frame(width_cells) + build_cushions(width_cells) + build_feet(width_cells)


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
    vertical = wicker.weave_tile(SOFA_WEAVE, direction="vertical")
    def pixel(x, y):
        if y < 512:
            tile = horizontal if x < 512 else vertical
            return tile[y % 16][x % 16]
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
