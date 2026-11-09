"""Generate the black woven Dining Table with splayed steel legs and an octagonal brace."""
import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
tilt = load_tool("cube_tilt")
texture_io = load_tool("texture_io")
wicker = load_tool("wicker")
TOP_PX = 12
# The whole visible top, rim included, is usable: either one Dutch Oven or up to
# four Gas Lanterns in a two-by-two grid fit inside +-7.5 px (ADR 0240).
TOP_HALF = 7.5
TOP_LIMIT = 4
# Proportions measured on daining_table_whole.png: a thin woven panel in a slim
# steel frame, legs meeting the underside well inside the corners and splaying
# out to feet just inside the top's outline, joined by a ring a little above
# mid height.
PANEL_HALF = 7.1
PANEL_BOTTOM = 11.6
RIM_BOTTOM = 11.3
LEG_HALF = 0.25
LEG_TOP = (2.8, 11.5)
LEG_FOOT = (6.0, 0.15)
RING_Y = 6.3
RING_HALF = 0.2
# Eight weave repeats across the top keep the strands as fine as the photo's.
WEAVE_SIZE = 128
WEAVE_TILE = 16
TEXTURE_WIDTH = WEAVE_SIZE
TEXTURE_HEIGHT = WEAVE_SIZE + 8
STEEL = (64, 65, 68, 255)
STEEL_DARK = (52, 53, 56, 255)
ASSEMBLIES = {"legs": {"owner": "dining_table", "cubes": 4}}
GEOMETRY = "models/entity/yasu_ride/dining_table.geo.json"
TEXTURE = "textures/entity/yasu_ride/dining_table.png"


def face(u=0, v=WEAVE_SIZE, size=8):
    return {"uv": [u, v], "uv_size": [size, size]}


def box(lo, hi, swatch=None):
    return panels.panel(*lo, *hi, swatch or face())


def r4(value):
    return round(value, 4)


def leg(sx, sz):
    """One straight splayed leg from its foot to the underside of the top."""
    start = (sx * LEG_FOOT[0], LEG_FOOT[1], sz * LEG_FOOT[0])
    end = (sx * LEG_TOP[0], LEG_TOP[1], sz * LEG_TOP[0])
    dx, dy, dz = [end[i] - start[i] for i in range(3)]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    cube = box((-LEG_HALF, 0, -LEG_HALF), (LEG_HALF, length, LEG_HALF))
    cube.update(pivot=[0, 0, 0], rotation=[0, 0, math.degrees(math.atan2(dx, math.hypot(dy, dz)))])
    cube = tilt.tilt_assembly([cube], (0, 0, 0), "x", -math.degrees(math.atan2(dz, dy)),
                              assembly="legs", assemblies=ASSEMBLIES)[0]
    for key in ("origin", "pivot"):
        cube[key] = [r4(cube[key][i] + start[i]) for i in range(3)]
    return cube


def leg_offset_at(y):
    """Distance of a leg's axis from the centre along x and z at height y."""
    t = (y - LEG_FOOT[1]) / (LEG_TOP[1] - LEG_FOOT[1])
    return LEG_FOOT[0] + (LEG_TOP[0] - LEG_FOOT[0]) * t


def ring():
    """An octagon of tube whose corners touch the inner edges of the legs at RING_Y."""
    radius = leg_offset_at(RING_Y) * math.sqrt(2) - LEG_HALF
    tubes = []
    for k in range(8):
        a, b = math.pi / 4 + k * math.pi / 4, math.pi / 2 + k * math.pi / 4
        x0, z0 = radius * math.cos(a), radius * math.sin(a)
        x1, z1 = radius * math.cos(b), radius * math.sin(b)
        half = math.hypot(x1 - x0, z1 - z0) / 2 + RING_HALF
        cx, cz = r4((x0 + x1) / 2), r4((z0 + z1) / 2)
        tube = box((r4(cx - half), RING_Y - RING_HALF, r4(cz - RING_HALF)),
                   (r4(cx + half), RING_Y + RING_HALF, r4(cz + RING_HALF)))
        tube.update(pivot=[cx, RING_Y, cz], rotation=[0, r4(-math.degrees(math.atan2(z1 - z0, x1 - x0))), 0])
        tubes.append(tube)
    return tubes


def geometry():
    panel = box((-PANEL_HALF, PANEL_BOTTOM, -PANEL_HALF), (PANEL_HALF, TOP_PX, PANEL_HALF), face(8))
    panel["uv"]["up"] = face(0, 0, WEAVE_SIZE)
    rim = [box((-TOP_HALF, RIM_BOTTOM, z0), (TOP_HALF, TOP_PX, z1))
           for z0, z1 in ((-TOP_HALF, -PANEL_HALF), (PANEL_HALF, TOP_HALF))]
    rim += [box((x0, RIM_BOTTOM, -PANEL_HALF), (x1, TOP_PX, PANEL_HALF))
            for x0, x1 in ((-TOP_HALF, -PANEL_HALF), (PANEL_HALF, TOP_HALF))]
    legs = [leg(sx, sz) for sx in (-1, 1) for sz in (-1, 1)]
    tubes = ring()
    tilt.assert_axes([panel, *rim, *legs, *tubes], {"legs": legs}, ASSEMBLIES)
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.dining_table", "texture_width": TEXTURE_WIDTH,
                        "texture_height": TEXTURE_HEIGHT, "visible_bounds_width": 1.5,
                        "visible_bounds_height": 1.5, "visible_bounds_offset": [0, 0.5, 0]},
        "bones": [{"name": "root", "pivot": [0, 0, 0]},
                  {"name": "top", "parent": "root", "pivot": [0, 0, 0], "cubes": [panel, *rim]},
                  {"name": "legs", "parent": "root", "pivot": [0, 0, 0], "cubes": legs},
                  {"name": "ring", "parent": "root", "pivot": [0, RING_Y, 0], "cubes": tubes}]}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    tile = wicker.weave_tile(wicker.PALETTE_BLACK, WEAVE_TILE)

    def pixel(x, y):
        if y < WEAVE_SIZE:
            return tile[y % WEAVE_TILE][x % WEAVE_TILE]
        return STEEL if x < 8 else STEEL_DARK
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry(), separators=(",", ":"))
    out.png(args.resource_pack / TEXTURE, TEXTURE_WIDTH, TEXTURE_HEIGHT, pixel, compress_level=9)
    out.finish("Dining Table outputs are stale. Run pnpm model:", "Dining Table model and texture are up to date")


if __name__ == "__main__":
    main()
