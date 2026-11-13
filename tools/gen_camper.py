"""Generate the camper geometry, single khaki texture, and item icon.

Based on the owner's photos of a cab-over motorhome, with no manufacturer name.
Model units are pixels (16 per block), with the front at -z (ADR 0009). Build
coordinates use +x for right; mirror left and right just before writing into
Bedrock's frame. The stripe's W is an explicit exception recorded in ADR 0067.
Run: python3 -I tools/gen_camper.py packs/yasu_ride_rp [--check]
"""

import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

cube_tilt = load_tool("cube_tilt")
assert_axes, compound_cubes = cube_tilt.assert_axes, cube_tilt.compound_cubes
ASSEMBLIES = {"slanted": {"owner": "camper", "cubes": 0}, "front_panels": {"owner": "camper", "cubes": 518}}

texture_io = load_tool("texture_io")
mer = load_tool("mer")
outputs = texture_io.Outputs("--check" in sys.argv[2:])
build_lit_textures = load_tool("lit_textures").build_lit_textures

RP = Path(sys.argv[1])
MODELS = RP / "models/entity/yasu_ride"
ENTITY_TEXTURES = RP / "textures/entity/yasu_ride"
ITEM_TEXTURES = RP / "textures/items/yasu_ride"
kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
ATLAS = kit.ATLAS
REGISTRY = kit.REGISTRY
LAYOUT = kit.LAYOUT
PALETTE = kit.PALETTE
LAMP_GROUPS = kit.LAMP_GROUPS
LIT_SLOTS = kit.LIT_SLOTS
RIB_PERIOD_TEXELS = kit.RIB_PERIOD_TEXELS
BOLT_PITCH_PX = kit.BOLT_PITCH_PX
HARDWARE_DARK_FACTOR = kit.HARDWARE_DARK_FACTOR
MIRROR_CHROME_REGION = kit.MIRROR_CHROME_REGION
REAR = kit.REAR
FLOOR = kit.FLOOR
WHEEL_R = kit.WHEEL_R
GLOW_BOTTOM = kit.GLOW_BOTTOM
# The camper tests run this script with runpy and read these names from its globals.
RIB_TEXELS_PER_PX = kit.RIB_TEXELS_PER_PX
SLOTS = kit.SLOTS
right_windows, left_windows = kit.right_windows, kit.left_windows
FRONT = kit.FRONT
box = kit.box
moved = kit.moved
carve = kit.carve
take_slots = kit.take_slots

AREA_ORDER = (
    "shell", "curtains", "door", "front", "rear", "roof", "running", "cab",
    "bed_bunk", "fridge", "kitchen", "room", "shower", "ceiling", "dinette", "arches",
)
areas = {name: load_tool(f"camper_{name}") for name in AREA_ORDER}
merged = AreaCubes()
owners = {}

for name, module in areas.items():
    built = module.build_kitchen_top(REGISTRY)[0] if name == "kitchen" else module.build()
    for cubes in built.values():
        for cube in cubes:
            owners[id(cube)] = module.area_of(cube) if name == "kitchen" else name
    if name == "curtains":
        # Side curtains originally followed their individual panes inside the wall loop.
        for i, anchor in enumerate(module.anchors()):
            index = merged["body"].index(anchor) + 1
            merged["body"][index:index] = built["body"][2 * i:2 * i + 2]
        continue
    if name == "arches":
        # The arches rise above the floor. Thin panels enclose them inside without
        # closing the exterior arches; the floor and furniture must leave room for the panels.
        for hole in module.holes():
            for bone in ("body", "seat_2", "seat_3"):
                cut = []
                for cube in merged[bone]:
                    for piece in carve(cube, hole):
                        owners[id(piece)] = owners[id(cube)]
                        cut.append(piece)
                merged[bone] = cut
    merged.merge(built)

body = merged["body"]
door = merged["door_entry"]
# Extract the headlight group's lamps (lenses, roof clearance, rear roof, and tail lamps)
# after shaping the nose so the lenses follow the lamp pod taper.
headlights, body = take_slots(body, LAMP_GROUPS["headlights"])

# Glass gets its own bones, listed last, so only glass is alpha-blended and it draws after the
# opaque interior. Blending the whole model let a near pane drawn early hide the cabin behind it
# and show the terrain on the far side (ADR 0091).
glass, body = take_slots(body, ("glass",))
door_glass, door = take_slots(door, ("glass",))

merged.update(body=body, door_entry=door, headlights=headlights, glass=glass, door_glass=door_glass)
door_area, cab, shower, room, fridge = (areas[n] for n in ("door", "cab", "shower", "room", "fridge"))
DOOR_HINGE = door_area.DOOR_HINGE
STEERING_PIVOT, STEERING_LEAN = cab.STEERING_PIVOT, cab.STEERING_LEAN
SHOWER_HINGE, SHOWER_HEAD = shower.SHOWER_HINGE, shower.SHOWER_HEAD
CABINET_SINK_HINGE, CABINET_STOVE_HINGE = room.CABINET_SINK_HINGE, room.CABINET_STOVE_HINGE
FRIDGE_HINGE = fridge.FRIDGE_HINGE
wheels, glows, hover = [], [], {}
for name, sx, center_x, z in kit.wheel_positions():
    # Emit below the solid disc: emissive alpha controls brightness, not transparency.
    hover[f"hover_{name}"] = [center_x, GLOW_BOTTOM, z]
    wheels.append({"name": f"wheel_{name}", "parent": "body", "pivot": [center_x, WHEEL_R, z],
                   "cubes": merged[f"wheel_{name}"]})
    glows.append({"name": f"glow_{name}", "parent": "body", "pivot": [center_x, 0, z],
                  "cubes": merged[f"glow_{name}"]})
camper_bones = [
    {"name": "root", "pivot": [0, 0, 0]},
    {"name": "body", "parent": "root", "pivot": [0, 0, 0], "cubes": body,
     "locators": {**hover, "exhaust": [-12, 4, REAR - 4], "shower_head": SHOWER_HEAD}},
    {"name": "bunk", "parent": "body", "pivot": [0, 0, 0], "cubes": merged["bunk"]},
    {"name": "headlights", "parent": "body", "pivot": [0, 0, 0], "cubes": headlights},
    {"name": "ceiling_lights", "parent": "body", "pivot": [0, 0, 0], "cubes": merged["ceiling_lights"]},
    *wheels,
    *glows,
    *[{"name": f"seat_{i}", "parent": "body", "pivot": [0, FLOOR, 0], "cubes": cubes}
      for i, cubes in enumerate((merged[f"seat_{i}"] for i in range(4)))],
    {"name": "door_entry", "parent": "body", "pivot": DOOR_HINGE, "cubes": door},
    {"name": "steering", "parent": "body", "pivot": STEERING_PIVOT, "rotation": [STEERING_LEAN, 0, 0],
     "cubes": [moved(c, STEERING_PIVOT) for c in merged["steering"]]},
    {"name": "shower_door", "parent": "body", "pivot": SHOWER_HINGE, "cubes": merged["shower_door"]},
    {"name": "cabinet_sink_door", "parent": "body", "pivot": CABINET_SINK_HINGE, "cubes": merged["cabinet_sink_door"]},
    {"name": "cabinet_stove_door", "parent": "body", "pivot": CABINET_STOVE_HINGE, "cubes": merged["cabinet_stove_door"]},
    {"name": "fridge_top_door", "parent": "body", "pivot": FRIDGE_HINGE, "cubes": merged["fridge_top_door"]},
    {"name": "fridge_bottom_door", "parent": "body", "pivot": FRIDGE_HINGE, "cubes": merged["fridge_bottom_door"]},
    {"name": "mirror", "parent": "body", "pivot": [0, 0, 0], "cubes": merged["mirror"]},
    {"name": "glass", "parent": "body", "pivot": [0, 0, 0], "cubes": glass},
    {"name": "door_glass", "parent": "door_entry", "pivot": DOOR_HINGE, "cubes": door_glass},
]


def mirror_x(bones):
    """Mirror the building frame (+x right) into the game's frame (+x left)."""
    for bone in bones:
        bone["pivot"] = [-bone["pivot"][0], *bone["pivot"][1:]]
        for name, (x, y, z) in bone.get("locators", {}).items():
            bone["locators"][name] = [-x, y, z]
        if "rotation" in bone:
            rx, ry, rz = bone["rotation"]
            bone["rotation"] = [rx, -ry, -rz]
        for c in bone.get("cubes", []):
            c["origin"] = [-(c["origin"][0] + c["size"][0]), *c["origin"][1:]]
            # Face names follow the written x axis, so a ribbed outer face swaps names with the
            # mirror, as the sports boat's turn-around does (gen_sportsboat.py).
            c["uv"]["east"], c["uv"]["west"] = c["uv"]["west"], c["uv"]["east"]
            if "pivot" in c:
                c["pivot"] = [-c["pivot"][0], *c["pivot"][1:]]
                rx, ry, rz = c["rotation"]
                # A mirror negates y and z turns, but the game turns z the other way from
                # the right-handed math these cubes are built with, so z stays as written
                # (the sports boat generator keeps z for the same reason, ADR 0058).
                c["rotation"] = [rx, -ry, rz]
    return bones


def rounded(value):
    """Drop floating-point noise and normalize negative zero before writing."""
    if isinstance(value, float):
        return round(value, 3) + 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


# Use the source lists to retain ownership when moved() replaces steering dictionaries.
area_ranges = {name: {} for name in dict.fromkeys(owners.values())}
for bone in camper_bones:
    source = merged.get(bone["name"], [])
    for i, cube in enumerate(source):
        ranges = area_ranges[owners[id(cube)]].setdefault(bone["name"], [])
        if ranges and ranges[-1][1] == i - 1:
            ranges[-1][1] = i
        else:
            ranges.append([i, i])
for bones in area_ranges.values():
    for bone, ranges in bones.items():
        if len(ranges) == 1:
            bones[bone] = ranges[0]
outputs.json(Path(__file__).resolve().parent.parent / "tests/packs/fixtures/camper-areas.json", area_ranges)

mirror_x(camper_bones)
geo = {
    "format_version": "1.12.0",
    "minecraft:geometry": [{
        "description": {
            "identifier": "geometry.yasu_ride.camper",
            "texture_width": LAYOUT.size[0], "texture_height": LAYOUT.size[1],
            "visible_bounds_width": 10, "visible_bounds_height": 5,
            "visible_bounds_offset": [0, 1.5, 0],
        },
        "bones": camper_bones,
    }],
}
model_cubes = [cube for bone in geo["minecraft:geometry"][0]["bones"] for cube in bone.get("cubes", [])]
slanted = [cube for cube in compound_cubes(model_cubes) if cube["rotation"][0] == 45]
assert_axes(model_cubes, {"slanted": slanted, "front_panels": [cube for cube in compound_cubes(model_cubes) if cube not in slanted]}, ASSEMBLIES)
outputs.json(MODELS / "camper.geo.json", rounded(geo), separators=(",", ":"))


atlas_pixels = kit.regions.render_atlas(LAYOUT)
bound_faces = {id(face) for _, face in LAYOUT._faces}
for cube in model_cubes:
    for face in cube["uv"].values():
        if id(face) not in bound_faces:
            LAYOUT.bind_face("base", face)
atlas_errors = kit.regions.audit(LAYOUT, atlas_pixels)
if atlas_errors:
    raise ValueError("Camper atlas audit failed: " + "; ".join(atlas_errors))


def atlas_pixel(x, y):
    offset = (y * LAYOUT.size[0] + x) * 4
    return tuple(atlas_pixels[offset:offset + 4])


outputs.png(ENTITY_TEXTURES / "camper.png", *LAYOUT.size, atlas_pixel)

build_lit_textures(outputs, ENTITY_TEXTURES, "camper", *LAYOUT.size,
                   atlas_pixel,
                   lambda x, y: ATLAS.atlas_swatch_at(x, y) in LIT_SLOTS)

# Polished plate, not a perfect mirror: Vibrant Visuals keeps a soft highlight along the housing.
MER_MIRROR_CHROME = mer.Mer(255, 0, 26)
outputs.png(ENTITY_TEXTURES / "camper_mirror.png", *LAYOUT.size,
            atlas_pixel)
outputs.png(ENTITY_TEXTURES / "camper_mirror_mer.png", *LAYOUT.size, mer.mer_painter(
    lambda x, y: MER_MIRROR_CHROME if (MIRROR_CHROME_REGION.x <= x - LAYOUT.origin("base")[0] < MIRROR_CHROME_REGION.x + MIRROR_CHROME_REGION.w
                                       and MIRROR_CHROME_REGION.y <= y - LAYOUT.origin("base")[1] < MIRROR_CHROME_REGION.y + MIRROR_CHROME_REGION.h)
    else None))
texture_io.write_texture_set(outputs, ENTITY_TEXTURES, "camper_mirror", "camper_mirror_mer")

ICON = [
    "................",
    "................",
    ".OOOOOOOOOOOOO..",
    ".OWWWWWWWWWWWWO.",
    ".OKKKKKKKKKGGGO.",
    ".OKGGKKGGKKGGGO.",
    ".OKGGKKGGKKWWWO.",
    ".OWWWWWWWWWWWWO.",
    ".OSSSSSSSSSSSSO.",
    ".OWWWWWWWWWWWWO.",
    ".OTTTTTTTTTTTTO.",
    ".OOBBBOOOOOBBBO.",
    "...BBB.....BBB..",
    "................",
    "................",
    "................",
]
ICON_COLORS = {"W": PALETTE["white"], "K": PALETTE["khaki"], "G": (70, 86, 96, 255),
               "S": PALETTE["stripe"], "T": PALETTE["tan"], "B": (28, 28, 30, 255),
               "O": (60, 60, 60, 255), ".": (0, 0, 0, 0)}
outputs.png(ITEM_TEXTURES / "camper_item.png", 16, 16, lambda x, y: ICON_COLORS[ICON[y][x]])
# The camping gear box a player gets with their first camper (ADR 0093), in the 1970s palette of #347.
BOX_ICON = [
    "................",
    "................",
    "................",
    "..LLLLLLLLLLLL..",
    ".LLLLLLLLLLLLLL.",
    ".OOOOOOOOOOOOOO.",
    ".CCCCCCCCCCCCCC.",
    ".CCCCCCCCCCCCCC.",
    ".GGGGGGGGGGGGGG.",
    ".RRRRRRRRRRRRRR.",
    ".AAAAAAAAAAAAAA.",
    ".CCCCCCCCCCCCCC.",
    ".CCCCCCCCCCCCCC.",
    ".OOOOOOOOOOOOOO.",
    "................",
    "................",
]
BOX_ICON_COLORS = {"L": (222, 184, 135, 255), "C": (196, 150, 98, 255), "O": (110, 74, 40, 255),
                   "G": (218, 165, 32, 255), "R": (204, 85, 0, 255), "A": (86, 130, 3, 255),
                   ".": (0, 0, 0, 0)}
outputs.png(ITEM_TEXTURES / "camping_gear_box.png", 16, 16, lambda x, y: BOX_ICON_COLORS[BOX_ICON[y][x]])
print("cubes:", sum(len(b.get("cubes", [])) for b in camper_bones))

outputs.finish("Stale camper outputs:", "camper model and textures are up to date")
