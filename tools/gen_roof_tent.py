"""Generate roof tent geometry and sixteen fabric paints, without script behavior.

    python3 -I tools/gen_roof_tent.py packs/yasu_ride_rp [--check]

Front is -z. The shell is 32 x 40 pixels and about 19 pixels tall above its
platform. The ladder hangs on the -x side, the vehicle's left, and extends below
the platform; host-specific sizing is deferred.
"""
import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")
tent = load_tool("gen_tent")
cube_tilt = load_tool("cube_tilt")
# Share the ground tent's swatches and paint order, including fixed bedding colors.
box = tent.box
FLY_PAINTS = tent.FLY_PAINTS
GEOMETRY = "models/entity/yasu_ride/roof_tent.geo.json"
TEXTURE = "textures/entity/yasu_ride/roof_tent.png"


def parts():
    body = [box(-16, 0, -20, 16, 2, 20, "pole_dark")]
    for x in (-15, 14):
        for z in (-19, 18):
            body.append(box(x, 2, z, x+1, 12, z+1, "pole"))
    fabric = []
    # A pitched roof uses only z rotations; the eaves meet the side walls at y=12.
    length = math.hypot(16, 7)
    angle = math.degrees(math.atan2(7, 16))
    fabric += [box(-length, 19, -20, 0, 19.5, 20, "fly",
                   pivot=(0, 19, 0), rotation=(0, 0, -angle)),
               box(0, 19, -20, length, 19.5, 20, "fly",
                   pivot=(0, 19, 0), rotation=(0, 0, angle))]
    # Real openings surround the dark mesh, rather than placing it over opaque walls.
    for x in (-16, 15.5):
        fabric += [box(x, 2, -20, x+0.5, 5, 20, "fly"),
                   box(x, 10, -20, x+0.5, 12, 20, "fly"),
                   box(x, 5, -20, x+0.5, 10, -12, "fly"),
                   box(x, 5, 12, x+0.5, 10, 20, "fly"),
                   box(x+0.15, 5, -12, x+0.35, 10, 12, "glass")]
    for z in (-20, 19.5):
        # Thin vertical strips fill the triangular gables under the sloped roof.
        for x in range(-16, 16):
            top = 19 - min(abs(x), abs(x+1)) * 7 / 16
            fabric.append(box(x, 12, z, x+1, top, z+0.5, "fly"))
    fabric += [box(-16, 2, -20, -8, 12, -19.5, "fly"),
               box(8, 2, -20, 16, 12, -19.5, "fly"),
               box(-8, 12, -20.1, 8, 13, -19.5, "fly_dark"),
               box(-16, 2, 19.5, 16, 12, 20, "fly")]
    ladder = [box(-17, -32, z, -16, 2, z+1, "strap",
                  pivot=(-16, 2, 0), rotation=(0, 0, 15)) for z in (-6, 5)]
    for y in range(-29, 2, 5):
        ladder.append(box(-17, y, -5, -16, y+0.8, 5, "ring",
                          pivot=(-16, 2, 0), rotation=(0, 0, 15)))
    def bone(name, cubes, pivot=(0, 0, 0), parent="body"):
        return {"name": name, "parent": parent, "pivot": list(pivot), "cubes": cubes}
    return [{"name": "root", "pivot": [0, 0, 0]},
            bone("body", body, parent="root"),
            bone("fabric", fabric),
            bone("flap", [box(-8, 2, -20.1, 8, 12, -19.6, "fly")], (0, 12, -20)),
            bone("sleeping_bag", [box(-10, 2, -14, 10, 3.5, 16, "mattress_edge"),
                                  box(-10, 3.5, -14, 10, 4, 10, "mattress"),
                                  box(-8, 3.5, 11, 8, 5, 15, "inner")]),
            bone("ladder", ladder, (-16, 2, 0))]


def geometry():
    bones = tent.rounded(parts())
    cubes = [c for bone in bones for c in bone.get("cubes", [])]
    cube_tilt.assert_axes(cubes, {})
    for bone in bones:
        for cube in bone.get("cubes", []):
            for point in tent.corners(cube):
                assert all(lo <= v <= hi for v, lo, hi in zip(point, (-27 if bone["name"] == "ladder" else -17, -33, -31), (17, 20, 21))), bone["name"]
            for face in cube["uv"].values():
                u, v = face["uv"]
                slot = int(u // 4 + 4 * (v // 4))
                assert slot > 1 or bone["name"] in ("fabric", "flap"), bone["name"]
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.roof_tent",
                        "texture_width": 16, "texture_height": 16,
                        "visible_bounds_width": 4, "visible_bounds_height": 4,
                        "visible_bounds_offset": [0, -0.4, -0.3]},
        "bones": bones,
    }]}


def texture_pixel(paint):
    palette = tent.paint_palette(paint)
    # The tent's glass swatch becomes a dark translucent woven window mesh.
    def pixel(x, y):
        slot = (y // 4) * 4 + x // 4
        if slot == tent.SLOTS.index("glass"):
            return (24, 28, 30, 160 if x % 2 == 0 or y % 2 == 0 else 64)
        return palette[tent.SLOTS[slot]] if slot < len(tent.SLOTS) else (0, 0, 0, 0)
    return pixel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry())
    for paint in FLY_PAINTS:
        path = TEXTURE if paint == "khaki" else TEXTURE.replace(".png", f"_{paint}.png")
        out.png(args.resource_pack / path, 16, 16, texture_pixel(paint), compress_level=9)
    out.finish("Roof tent outputs are stale. Run `pnpm model`:", "roof tent model and textures are up to date")


if __name__ == "__main__":
    main()
