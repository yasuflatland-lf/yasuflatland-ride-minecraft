"""Generate roof tent geometry and sixteen fabric paints, without script behavior.

    python3 -I tools/gen_roof_tent.py packs/yasu_ride_rp [--check]

Front is -z. The shell is 32 x 40 pixels and about 19 pixels tall above its
platform. The ladder hangs on the -x side, the vehicle's left, and extends below
the platform. The SUV variant has sloping lower sides and a ground-reaching ladder.
"""
import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")
tent = load_tool("gen_tent")
cube_tilt = load_tool("cube_tilt")
# Share the ground tent's swatches and paint order, including fixed bedding colors.
box = tent.box
FLY_PAINTS = {**tent.FLY_PAINTS, "khaki": (86, 94, 64)}
GEOMETRY = "models/entity/yasu_ride/roof_tent.geo.json"
TEXTURE = "textures/entity/yasu_ride/roof_tent.png"


@dataclass(frozen=True)
class Dims:
    half_width: int = 16
    half_depth: int = 20
    platform_height: int = 2
    wall_height: int = 12
    ridge_height: int = 19
    half_roof: int = 16
    pole_x: tuple = (-15, 14)
    window_bottom: int = 5
    window_top: int = 10
    window_half_depth: int = 12
    doorway_half_width: int = 8
    ladder_pivot: tuple = (-16, 2, 0)
    ladder_tilt: int = 15
    ladder_bottom: float = -32
    ladder_first_rung: int = -29
    ladder_rails_z: tuple = (-6, 5)
    ladder_lower: tuple = (-27, -33, -31)
    visible_bounds_width: int = 4
    visible_bounds_height: int = 4
    visible_bounds_offset: tuple = (0, -0.4, -0.3)


GROUND_DIMS = Dims()
SUV_DIMS = Dims(
    half_roof=12, pole_x=(-11, 10), window_bottom=3, window_top=8,
    ladder_pivot=(-16.5, 2, 10),
    ladder_tilt=10, ladder_bottom=-38.5, ladder_first_rung=-36,
    ladder_rails_z=(4, 15), ladder_lower=(-28, -39, -31),
    visible_bounds_width=6, visible_bounds_height=5,
)


@dataclass(frozen=True)
class Shell:
    body: list
    fabric: list
    flap: list
    sleeping_bag: list
    ladder: list
    ladder_pivot: tuple


def common_shell(d: Dims) -> Shell:
    body = [box(-d.half_width, 0, -d.half_depth,
                d.half_width, d.platform_height, d.half_depth, "pole_dark")]
    for x in d.pole_x:
        for z in (-d.half_depth+1, d.half_depth-2):
            body.append(box(x, d.platform_height, z, x+1, d.wall_height, z+1, "pole"))
    # A pitched roof uses only z rotations; the eaves meet the side walls.
    rise = d.ridge_height - d.wall_height
    length = math.hypot(d.half_roof, rise)
    angle = math.degrees(math.atan2(rise, d.half_roof))
    fabric = [box(-length, d.ridge_height, -d.half_depth,
                  0, d.ridge_height+0.5, d.half_depth, "fly",
                  pivot=(0, d.ridge_height, 0), rotation=(0, 0, -angle)),
              box(0, d.ridge_height, -d.half_depth,
                  length, d.ridge_height+0.5, d.half_depth, "fly",
                  pivot=(0, d.ridge_height, 0), rotation=(0, 0, angle))]
    x, y, _ = d.ladder_pivot
    near, far = d.ladder_rails_z
    ladder = [box(x-1, d.ladder_bottom, z, x, y, z+1, "strap",
                  pivot=d.ladder_pivot, rotation=(0, 0, d.ladder_tilt))
              for z in d.ladder_rails_z]
    for rung_y in range(d.ladder_first_rung, y, 5):
        ladder.append(box(x-1, rung_y, near+1, x, rung_y+0.8, far, "ring",
                          pivot=d.ladder_pivot, rotation=(0, 0, d.ladder_tilt)))
    return Shell(
        body, fabric,
        [box(-d.doorway_half_width, d.platform_height, -d.half_depth-0.1,
             d.doorway_half_width, d.wall_height, -d.half_depth+0.4, "fly")],
        [box(-10, 2, -14, 10, 3.5, 16, "mattress_edge"),
         box(-10, 3.5, -14, 10, 4, 10, "mattress"),
         box(-8, 3.5, 11, 8, 5, 15, "inner")],
        ladder, d.ladder_pivot,
    )


def ground_shell() -> Shell:
    d = GROUND_DIMS
    shell = common_shell(d)
    fabric = shell.fabric
    # Real openings surround the dark mesh, rather than placing it over opaque walls.
    for x in (-d.half_width, d.half_width-0.5):
        fabric += [box(x, d.platform_height, -d.half_depth, x+0.5, d.window_bottom, d.half_depth, "fly"),
                   box(x, d.window_top, -d.half_depth, x+0.5, d.wall_height, d.half_depth, "fly"),
                   box(x, d.window_bottom, -d.half_depth, x+0.5, d.window_top, -d.window_half_depth, "fly"),
                   box(x, d.window_bottom, d.window_half_depth, x+0.5, d.window_top, d.half_depth, "fly"),
                   box(x+0.15, d.window_bottom, -d.window_half_depth,
                       x+0.35, d.window_top, d.window_half_depth, "glass")]
    for z in (-d.half_depth, d.half_depth-0.5):
        # Thin vertical strips fill the triangular gables under the sloped roof.
        for x in range(-d.half_width, d.half_width):
            top = d.ridge_height - min(abs(x), abs(x+1)) * (d.ridge_height-d.wall_height) / d.half_roof
            fabric.append(box(x, d.wall_height, z, x+1, top, z+0.5, "fly"))
    fabric += [box(-d.half_width, d.platform_height, -d.half_depth,
                   -d.doorway_half_width, d.wall_height, -d.half_depth+0.5, "fly"),
               box(d.doorway_half_width, d.platform_height, -d.half_depth,
                   d.half_width, d.wall_height, -d.half_depth+0.5, "fly"),
               box(-d.doorway_half_width, d.wall_height, -d.half_depth-0.1,
                   d.doorway_half_width, d.wall_height+1, -d.half_depth+0.5, "fly_dark"),
               box(-d.half_width, d.platform_height, d.half_depth-0.5,
                   d.half_width, d.wall_height, d.half_depth, "fly")]
    return shell


def suv_shell() -> Shell:
    d = SUV_DIMS
    shell = common_shell(d)
    fabric = shell.fabric
    # Local wall height follows the slope so the mesh remains a real opening.
    inset = d.half_width - d.half_roof
    rise = d.wall_height - d.platform_height
    wall_length = math.hypot(inset, rise)
    wall_angle = math.degrees(math.atan2(inset, rise))
    for side in (-1, 1):
        x = side * d.half_width
        pivot = (x, d.platform_height, 0)
        rotation = (0, 0, -side * wall_angle)
        def panel(lo, hi, z0, z1, swatch="fly", thickness=0.5):
            return box(x-thickness/2, d.platform_height+lo, z0,
                       x+thickness/2, d.platform_height+hi, z1,
                       swatch, pivot=pivot, rotation=rotation)
        fabric += [panel(0, d.window_bottom, -d.half_depth, d.half_depth),
                   panel(d.window_top, wall_length, -d.half_depth, d.half_depth),
                   panel(d.window_bottom, d.window_top, -d.half_depth, -d.window_half_depth),
                   panel(d.window_bottom, d.window_top, d.window_half_depth, d.half_depth),
                   panel(d.window_bottom, d.window_top, -d.window_half_depth, d.window_half_depth, "glass", 0.2)]
    for z in (-d.half_depth, d.half_depth-0.5):
        # Strips follow both lower slopes and the roof, leaving the front doorway open.
        for x in range(-d.half_width, d.half_width):
            edge = min(abs(x), abs(x+1))
            top = (d.ridge_height - edge * (d.ridge_height-d.wall_height) / d.half_roof
                   if edge < d.half_roof else d.platform_height + (d.half_width-edge) * rise / inset)
            bottom = (d.wall_height
                      if z < 0 and -d.doorway_half_width <= x < d.doorway_half_width
                      else d.platform_height)
            fabric.append(box(x, bottom, z, x+1, top, z+0.5, "fly"))
    fabric.append(box(-d.doorway_half_width, d.wall_height, -d.half_depth-0.1,
                      d.doorway_half_width, d.wall_height+1, -d.half_depth+0.5, "fly_dark"))
    return shell


def parts(suv=False):
    d = SUV_DIMS if suv else GROUND_DIMS
    shell = suv_shell() if suv else ground_shell()
    def bone(name, cubes, pivot=(0, 0, 0), parent="body"):
        return {"name": name, "parent": parent, "pivot": list(pivot), "cubes": cubes}
    return [{"name": "root", "pivot": [0, 0, 0]},
            bone("body", shell.body, parent="root"),
            bone("fabric", shell.fabric),
            bone("flap", shell.flap, (0, d.wall_height, -d.half_depth)),
            bone("sleeping_bag", shell.sleeping_bag),
            bone("ladder", shell.ladder, shell.ladder_pivot)]


def geometry():
    geometries = []
    for suv in (False, True):
        d = SUV_DIMS if suv else GROUND_DIMS
        bones = tent.rounded(parts(suv=suv))
        cubes = [c for bone in bones for c in bone.get("cubes", [])]
        cube_tilt.assert_axes(cubes, {})
        for bone in bones:
            for cube in bone.get("cubes", []):
                for point in tent.corners(cube):
                    lower = d.ladder_lower if bone["name"] == "ladder" else (-17, 0, -31)
                    assert all(lo <= v <= hi for v, lo, hi in zip(point, lower, (17, 20, 21))), bone["name"]
                for face in cube["uv"].values():
                    u, v = face["uv"]
                    slot = int(u // 4 + 4 * (v // 4))
                    assert slot > 1 or bone["name"] in ("fabric", "flap"), bone["name"]
        geometries.append({
            "description": {"identifier": "geometry.yasu_ride.roof_tent" + ("_suv" if suv else ""),
                            "texture_width": 16, "texture_height": 16,
                            "visible_bounds_width": d.visible_bounds_width,
                            "visible_bounds_height": d.visible_bounds_height,
                            "visible_bounds_offset": list(d.visible_bounds_offset)},
            "bones": bones,
        })
    return {"format_version": "1.12.0", "minecraft:geometry": geometries}


def texture_pixel(paint):
    palette = tent.paint_palette(paint)
    if paint == "khaki":
        for slot, shade in tent.FLY_SHADES.items():
            palette[slot] = tent.scale(FLY_PAINTS[paint], shade) + (255,)
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
