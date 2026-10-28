"""Generate the outdoor gas lantern model, PBR atlas, and texture set (ADR 0173)."""

import argparse
import math
import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

mer_atlas = load_tool("mer_atlas")
cube_tilt = load_tool("cube_tilt")
panels = load_tool("panels")
r4 = panels.r4

SIZE = 32
SWATCH = 8
GEOMETRY = "models/entity/yasu_ride/gas_lantern.geo.json"
TEXTURE = "textures/entity/yasu_ride/gas_lantern.png"
MER = "textures/entity/yasu_ride/gas_lantern_mer.png"
TEXTURE_SET = "textures/entity/yasu_ride/gas_lantern.texture_set.json"

OLIVE, SILVER, STEEL, CHROME, BRASS, GASKET, GLASS, FLAME = range(8)
# (colour with alpha, MER). Glass alpha 96 is see-through under entity_alphablend; flame alpha 0 is the
# entity_emissive mask (ADR 0020, 0147). Swatches 8 to 15 are unused.
PALETTE = [
    ((150, 138, 74, 255), (40, 0, 150)),
    ((200, 202, 205, 255), (230, 0, 60)),
    ((168, 172, 178, 255), (255, 0, 40)),
    ((228, 231, 235, 255), (255, 0, 10)),
    ((196, 158, 72, 255), (230, 0, 60)),
    ((38, 38, 40, 255), (0, 0, 210)),
    ((220, 235, 240, 96), (0, 0, 20)),
    ((255, 196, 96, 0), (0, 255, 255)),
] + [((0, 0, 0, 255), (0, 0, 255))] * 8

BOUNDS_X = (-3.1, 3.75)
BOUNDS_Z = (-3.1, 3.1)
BOUNDS_Y = (0, 11.3)
CROSS_BAR_Z = (-0.6, 0.6)
BODY_SWATCHES = {OLIVE, SILVER, STEEL, CHROME, BRASS, GASKET}


def face(slot):
    return mer_atlas.face(slot, SWATCH, SIZE // SWATCH)


def box(x0, y0, z0, x1, y1, z1, slot, pivot=None, rotation=None):
    return panels.panel(x0, y0, z0, x1, y1, z1, face(slot), pivot, rotation)


def ring(radius, y0, y1, slot, sides, thickness):
    return panels.panel_ring(radius, y0, y1, face(slot), sides, thickness)


def plate(radius, y0, y1, slot, bars):
    return panels.disc(radius, y0, y1, face(slot), bars)


# Each builder follows one part of the four reference photos (green: glass chimney and burner stack,
# blue: burner body and handle, orange: shoulder and collar, red: cartridge). No logo, lettering, label,
# or brand mark is modeled on any part.
def cartridge():
    """Red frame: the olive cartridge cylinder with a silver bottom rim."""
    return ring(3.05, 0, 0.4, SILVER, 16, 0.5) + ring(3.0, 0.4, 3.5, OLIVE, 16, 0.5)


def shoulder():
    """Orange frame: the hemisphere shoulder and the silver collar above it."""
    return panels.dome(3.0, 1.5, 3.5, face(OLIVE), 16, 6) + ring(1.2, 4.9, 5.4, SILVER, 12, 0.4)


def burner():
    """Blue frame: the faceted metallic burner body, its floor, then the green frame gasket, ring plate and nozzle."""
    return (ring(1.6, 5.4, 7.0, STEEL, 6, 0.6) + panels.disc(1.6, 5.4, 5.6, face(STEEL), 6)
            + ring(1.7, 7.0, 7.2, GASKET, 16, 0.4) + plate(1.9, 7.2, 7.4, SILVER, 8)
            + ring(0.35, 7.4, 8.2, BRASS, 8, 0.2))


def valve_knob():
    """Blue frame: the brass valve knob, buried in the burner's +x vertex and 0.15 px proud of it."""
    return [box(1.5, 5.8, -0.35, 2.0, 6.4, 0.35, BRASS)]


HANDLE_Y = (6.0, 6.2)
HANDLE_ARM_WIDTH = 0.2
HANDLE_ARMS = (((1.2, -0.9), (3.6, -0.5)), ((1.2, 0.9), (3.6, 0.5)))


def handle():
    """Blue frame: the wire fold-out handle, two arms meeting a cross bar."""
    cubes = []
    for (x0, z0), (x1, z1) in HANDLE_ARMS:
        dx, dz = x1 - x0, z1 - z0
        # In the game convention (cube_tilt.cube_matrix) a positive y turn moves a +x bar toward -z, so
        # the turn is negated: the -z arm turns about -9.46 degrees and the +z arm about +9.46 degrees.
        # A plain atan2 would splay the outer ends out to z +-1.3.
        turn = r4(-math.degrees(math.atan2(dz, dx)))
        half = HANDLE_ARM_WIDTH / 2
        cubes.append(box(x0, HANDLE_Y[0], r4(z0 - half), r4(x0 + math.hypot(dx, dz)), HANDLE_Y[1], r4(z0 + half),
                         STEEL, (x0, 0, z0), (0, turn, 0)))
    cubes.append(box(3.5, HANDLE_Y[0], CROSS_BAR_Z[0], 3.7, HANDLE_Y[1], CROSS_BAR_Z[1], STEEL))
    return cubes


def chimney():
    """Green frame: the transparent glass cylinder."""
    return ring(1.5, 7.4, 10.9, GLASS, 16, 0.12)


def top_cap():
    """Green frame: the chrome cap closing the chimney."""
    return ring(1.55, 10.9, 11.3, CHROME, 16, 0.3) + plate(1.55, 11.1, 11.3, CHROME, 8)


def flame():
    """Four crossed panels standing in the glass, turned k * 45 degrees about Y."""
    return [box(-0.3, 8.2, -0.03, 0.3, 9.8, 0.03, FLAME, (0, 8.2, 0), (0, k * 45, 0)) for k in range(4)]


def geometry():
    body = cartridge() + shoulder() + burner() + valve_knob() + handle() + top_cap()
    return {"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.gas_lantern", "texture_width": SIZE,
                        "texture_height": SIZE, "visible_bounds_width": 1,
                        "visible_bounds_height": 1, "visible_bounds_offset": [0, 0.4, 0]},
        "bones": [
            {"name": "root", "pivot": [0, 0, 0]},
            {"name": "body", "parent": "root", "pivot": [0, 0, 0], "cubes": body},
            {"name": "glass", "parent": "body", "pivot": [0, 0, 0], "cubes": chimney()},
            {"name": "flame", "parent": "body", "pivot": [0, 0, 0], "cubes": flame()},
        ],
    }]}


def swatches(cube):
    slots = {(uv["uv"][1] // SWATCH) * (SIZE // SWATCH) + uv["uv"][0] // SWATCH for uv in cube["uv"].values()}
    for uv in cube["uv"].values():
        assert all(0 <= v and v + size <= SIZE for v, size in zip(uv["uv"], uv["uv_size"]))
    return slots


def validate(doc):
    bones = doc["minecraft:geometry"][0]["bones"]
    assert [(b["name"], b.get("parent")) for b in bones] == [
        ("root", None), ("body", "root"), ("glass", "body"), ("flame", "body")], "bones or parents"
    assert bones[0]["pivot"] == [0, 0, 0] and "cubes" not in bones[0]
    by_name = {b["name"]: b.get("cubes", []) for b in bones}
    cubes = [c for b in bones for c in b.get("cubes", [])]
    cube_tilt.assert_axes(cubes, {})
    assert all(all(v > 0 for v in c["size"]) for c in cubes), "cube size not above 0"
    lo, hi = cube_tilt.bounds(cubes)
    for axis, (low, high) in zip(range(3), (BOUNDS_X, BOUNDS_Y, BOUNDS_Z)):
        assert low <= lo[axis] and hi[axis] <= high, f"bounds exceeded on axis {axis}: {lo} {hi}"
    arms = [c for c in by_name["body"] if c.get("rotation") and c["origin"][1] == HANDLE_Y[0]]
    assert len(arms) == 2, "handle arms"
    for arm in arms:
        far = max(p[0] for p in cube_tilt.corners(arm))
        ends = [p for p in cube_tilt.corners(arm) if p[0] > far - 0.5]
        assert all(CROSS_BAR_Z[0] <= p[2] <= CROSS_BAR_Z[1] for p in ends), "handle arm splays past the cross bar"
    used = {name: set().union(*(swatches(c) for c in members)) for name, members in by_name.items() if members}
    assert used["glass"] == {GLASS} and used["flame"] == {FLAME}, "glass or flame swatch"
    assert used["body"] <= BODY_SWATCHES, "body uses the glass or flame swatch"
    counts = {name: len(members) for name, members in by_name.items() if members}
    assert counts == {"body": 204, "glass": 16, "flame": 4}, counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    doc = geometry()
    validate(doc)
    mer_atlas.write_or_check(args.resource_pack, args.check, {
        "geometry": (GEOMETRY, doc),
        "texture_set": (TEXTURE_SET, mer_atlas.texture_set_doc("gas_lantern")),
        "color": (TEXTURE, SIZE, mer_atlas.atlas_pixels(PALETTE, SIZE, SWATCH, streak_rows=0)),
        "mer": (MER, SIZE, mer_atlas.mer_pixels(PALETTE, SIZE, SWATCH)),
    }, "Gas Lantern model, PBR maps, or texture set is stale; run pnpm model")


if __name__ == "__main__":
    main()
