"""Generate isolated block-rendering probes for ADR 0247; never write shipped assets."""

import copy
import json
import math
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "tools"))
from tool_loader import load_tool

texture_io = load_tool("texture_io")
tilt = load_tool("cube_tilt")
BP_UUID = "65f708d5-ddd6-4dd9-bcca-c555e1b00001"
RP_UUID = "65f708d5-ddd6-4dd9-bcca-c555e1b00002"
BP_MODULE_UUID = "65f708d5-ddd6-4dd9-bcca-c555e1b00003"
RP_MODULE_UUID = "65f708d5-ddd6-4dd9-bcca-c555e1b00004"
VERSION = [1, 0, 0]
ATLAS = "yasu_gear_proof_atlas"
FACES = ("north", "south", "east", "west", "up", "down")
PALETTE = [
    (240, 228, 196, 255), (128, 138, 52, 255), (222, 165, 36, 255),
    (204, 85, 20, 255), (128, 78, 40, 255), (74, 46, 26, 255),
    (205, 206, 210, 255), (24, 24, 24, 255), (178, 96, 60, 255),
    (70, 128, 50, 255), (196, 40, 36, 255), (244, 240, 226, 255),
    (124, 172, 210, 255), (120, 124, 130, 255), (210, 228, 236, 110),
    (250, 250, 248, 255),
]
DIGITS = ("111101101101111", "010110010010111", "111001111100111",
          "111001111001111", "101101111001001", "111100111001111",
          "111100111101111", "111001010010010", "111101111101111",
          "111101111001111")


def region(cell, offset=(4, 4), size=(120, 120), material=None):
    face = {"uv": [128 * (cell % 4) + offset[0], 128 * (cell // 4) + offset[1]],
            "uv_size": list(size)}
    if material:
        face["material_instance"] = material
    return face


def swatch(index=6):
    return {"uv": [4 * (index % 4), 4 * (index // 4)], "uv_size": [4, 4]}


def cube(center, size, rotation=(0, 0, 0), uv=None):
    return {"origin": [center[i] - size[i] / 2 for i in range(3)],
            "size": list(size), "pivot": list(center), "rotation": list(rotation),
            "uv": {face: copy.deepcopy(uv or swatch()) for face in FACES}}


def bone(name, cubes):
    return {"name": name, "pivot": [0, 0, 0], "cubes": cubes}


def floor_bones(bones):
    cubes = [c for b in bones for c in b["cubes"]]
    low, _ = tilt.bounds(cubes)
    for c in cubes:
        c["origin"][1] -= low[1]
        c["pivot"][1] -= low[1]
    return bones


def ring(lean=0, steps=False, x=0):
    cubes = []
    height, radius = 6, 2.7
    rows = 12 if steps else 1
    for row in range(rows):
        y = (row + 0.5) * height / rows
        r = radius - y * math.tan(math.radians(lean))
        # Rectangular loft panels overlap at their narrow end; a gap is never intentional.
        wide_r = radius - row * height / rows * math.tan(math.radians(lean))
        width = 2 * wide_r * math.tan(math.pi / 8) + 0.08
        for side in range(8):
            yaw = side * 45
            a = math.radians(yaw)
            cubes.append(cube([x + r * math.sin(a), y, r * math.cos(a)],
                              [width, height / rows / math.cos(math.radians(lean if not steps else 0)), 0.12],
                              [0 if steps else lean, yaw, 0]))
    return cubes


def square_loop():
    cubes = [cube([0, 0, -2], [4, 0.4, 0.4], [0, 30, 0]),
             cube([0, 0, 2], [4, 0.4, 0.4], [0, 30, 0]),
             cube([-2, 0, 0], [0.4, 0.4, 4], [0, 30, 0]),
             cube([2, 0, 0], [0.4, 0.4, 4], [0, 30, 0])]
    # Rotate the centers too, preserving a closed square before the outer x tilt.
    matrix = tilt.cube_matrix([0, 30, 0])
    for c in cubes:
        p = tilt.apply_matrix(matrix, c["pivot"])
        c["origin"] = [p[i] - c["size"][i] / 2 for i in range(3)]
        c["pivot"] = p
    return tilt.tilt_assembly(cubes, [0, 0, 0], "x", 25, assembly="proof_loop",
                              assemblies={"proof_loop": {"owner": "proof", "cubes": 4}})


def budget_item(count, x):
    cubes = []
    rows = count // 16
    for row in range(rows):
        y = (row + 0.5) * 6 / rows
        r = 2.6 - y * 0.22
        for side in range(16):
            yaw = side * 22.5
            a = math.radians(yaw)
            cubes.append(cube([x + r * math.sin(a), y, r * math.cos(a)],
                              [2 * r * math.tan(math.pi / 16) + 0.02, 6 / rows, 0.06],
                              [0, yaw, 0], swatch(row % 14)))
    return cubes


def budget(count):
    return [bone(f"end{i}", budget_item(count // 2, x)) for i, x in enumerate((-3.5, 3.5))]


def plate(x=0, material=None):
    return cube([x, 3, 0], [3, 6, 1], uv=region(7, material=material))


def glass(x=0, twin=False):
    uv = region(8, (68 if twin else 4, 4), (56, 56))
    return [cube([x, 1.5, 0], [1.2, 3, 1.2], uv=swatch(3)),
            cube([x, 3, 0], [3, 6, 3], uv=uv)]


def probes():
    one = ring()
    one.append(cube([0, 2, 0], [1, 3, 0.12], [25, 0, 0], swatch(3)))
    result = {
        "rot_one": ([bone("item", one)], "opaque", None),
        "rot_two": ([bone("item", ring(20))], "opaque", None),
        "rot_two_steps": ([bone("item", ring(20, steps=True))], "opaque", None),
        "rot_three": ([bone("item", square_loop())], "opaque", None),
        "pair_rot_two": ([bone("end0", ring(20, x=-3.5)), bone("end1", ring(20, x=3.5))],
                         "opaque", None),
        "atlas_tiles": ([bone("item", [cube([0, 3.75, 0], [7.5, 7.5, 7.5])])], "opaque", None),
        "cutout_alpha_test": ([bone("item", [plate()])], "alpha_test", None),
        "cutout_single_sided": ([bone("item", [plate()])], "alpha_test_single_sided", None),
        "glass_blend": ([bone("item", glass())], "blend", None),
        "pair_alpha_test": ([bone("end0", [plate(-3.5)]), bone("end1", glass(3.5, twin=True))],
                            "alpha_test", None),
    }
    atlas_cube = result["atlas_tiles"][0][0]["cubes"][0]
    atlas_cube["uv"] = {face: region(i + 1) for i, face in enumerate(FACES)}
    for method in ("alpha_test", "blend"):
        result[f"mix_opaque_{method}"] = ([bone("item", [plate(-2), plate(2, "probe")])],
                                           "opaque", method)
    for count in (128, 256, 512, 1024):
        result[f"budget_{count}"] = (budget(count), "opaque", None)
    result["budget_512_alpha_test"] = (budget(512), "alpha_test", None)
    result["pair_hidden"] = ([bone(f"end{i}", budget_item(256, -3.5 if i % 2 == 0 else 3.5))
                              for i in range(32)], "opaque", None)
    return result


def atlas_pixel(x, y):
    cell = (y // 128) * 4 + x // 128
    if cell == 0:
        if x < 16 and y < 16:
            return PALETTE[(y // 4) * 4 + x // 4]
        return PALETTE[0]
    # Clamp extends cell edges through the four-texel gutter.
    u, v = max(4, min(123, x % 128)), max(4, min(123, y % 128))
    if cell == 7:
        distance = math.hypot(u - 64, v - 64)
        return (244, 240, 226, 255 if 19 <= distance <= 54 else 0)
    if cell == 8:
        return (210, 228, 236, 110 if u < 64 else 255)
    color = (255, 0, 0, 255) if cell % 2 else (0, 255, 0, 255)
    # A 7.5px face samples 120 texels, giving the lettering density of 16 texels/px.
    digit_index, dx = divmod((u - 20) // 8, 4)
    dy = (v - 40) // 8
    if 0 <= digit_index < 3 and 0 <= dy < 5 and dx < 3:
        if DIGITS[(cell * 3 + digit_index) % 10][dy * 3 + dx] == "1":
            return (255, 255, 255, 255)
        return (0, 0, 0, 255)
    return color


def manifest(kind):
    bp = kind == "bp"
    doc = {"format_version": 2, "header": {
        "name": f"Camping Gear Proof {'Behavior' if bp else 'Resources'}",
        "description": "Throwaway ADR 0247 probes; includes intentionally invalid mix blocks",
        "uuid": BP_UUID if bp else RP_UUID, "version": VERSION, "min_engine_version": [1, 21, 80]},
        "modules": [{"type": "data" if bp else "resources", "uuid": BP_MODULE_UUID if bp else RP_MODULE_UUID,
                     "version": VERSION}]}
    if bp:
        doc["dependencies"] = [{"uuid": RP_UUID, "version": VERSION}]
    return doc


def validate(name, bones):
    cubes = [c for b in bones for c in b["cubes"]]
    low, high = tilt.bounds(cubes)
    base_low, base_high = [-8, 0, -8], [8, 16, 8]
    for i in range(3):
        assert high[i] - low[i] <= 30 and low[i] >= -30 and high[i] <= 30, (name, low, high)
        assert min(high[i], base_high[i]) - max(low[i], base_low[i]) >= 1, (name, low, high)
    assert abs(low[1]) < 1e-5, (name, low)
    expected = 8192 if name == "pair_hidden" else int(name.split("_")[1]) if name.startswith("budget_") else None
    assert expected is None or len(cubes) == expected, (name, len(cubes), expected)


def generate(directory):
    bp, rp = [directory / f"yasu_gear_proof_{kind}" for kind in ("bp", "rp")]
    out = texture_io.Outputs(False)
    out.json(bp / "manifest.json", manifest("bp"), indent=2)
    out.json(rp / "manifest.json", manifest("rp"), indent=2)
    out.json(rp / "textures/terrain_texture.json", {
        "resource_pack_name": "yasu_gear_proof", "texture_name": "atlas.terrain",
        "texture_data": {ATLAS: {"textures": "textures/blocks/atlas"}}}, indent=2)
    out.png(rp / "textures/blocks/atlas.png", 512, 512, atlas_pixel)
    names = []
    for name, (bones, method, mixed) in probes().items():
        floor_bones(bones)
        validate(name, bones)
        identifier = f"geometry.yasu_gear_proof.{name}"
        out.json(rp / f"models/blocks/{name}.geo.json", {
            "format_version": "1.12.0", "minecraft:geometry": [{"description": {
                "identifier": identifier, "texture_width": 512, "texture_height": 512,
                "visible_bounds_width": 2, "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.5, 0]},
                "bones": bones}]}, indent=2)
        geometry = {"identifier": identifier}
        if name in ("pair_hidden", "pair_rot_two", "pair_alpha_test"):
            geometry["bone_visibility"] = {b["name"]: i < 2 for i, b in enumerate(bones)}
        materials = {"*": {"texture": ATLAS, "render_method": method}}
        if mixed:
            materials["probe"] = {"texture": ATLAS, "render_method": mixed}
        out.json(bp / f"blocks/{name}.json", {"format_version": "1.21.80", "minecraft:block": {
            "description": {"identifier": f"yasu_gear_proof:{name}", "menu_category": {"category": "construction"}},
            "components": {"minecraft:geometry": geometry, "minecraft:material_instances": materials,
                           "minecraft:collision_box": False, "minecraft:light_dampening": 0}}}, indent=2)
        names.append(f"tile.yasu_gear_proof:{name}.name=Proof: {name.replace('_', ' ').title()}")
    (rp / "texts").mkdir(exist_ok=True)
    (rp / "texts/en_US.lang").write_text("\n".join(names) + "\n")
    out.json(rp / "texts/languages.json", ["en_US"])
    # Fixed ZIP timestamps make the import artifact reproducible too.
    with zipfile.ZipFile(directory / "yasu_gear_proof.mcaddon", "w", zipfile.ZIP_DEFLATED) as archive:
        for pack in (bp, rp):
            for path in sorted(pack.rglob("*")):
                if path.is_file():
                    entry = zipfile.ZipInfo(path.relative_to(directory).as_posix(), (2026, 11, 11, 0, 0, 0))
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    entry.external_attr = 0o100644 << 16
                    archive.writestr(entry, path.read_bytes())
    print(f"Wrote {len(names)} probes; bounds and cube counts verified: {directory}")


if __name__ == "__main__":
    generate(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent / "out")
