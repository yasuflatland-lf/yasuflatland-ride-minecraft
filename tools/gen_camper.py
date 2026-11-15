"""Generate the camper geometry, single khaki texture, and item icon.

Based on the owner's photos of a cab-over motorhome, with no manufacturer name.
Model units are pixels (16 per block), with the front at -z (ADR 0009). Build
coordinates use +x for right; mirror left and right just before writing into
Bedrock's frame. The stripe's W is an explicit exception recorded in ADR 0067.
Run: python3 -I tools/gen_camper.py packs/yasu_ride_rp [--check]
"""

import sys
import math
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

cube_tilt = load_tool("cube_tilt")
assert_axes, compound_cubes = cube_tilt.assert_axes, cube_tilt.compound_cubes
STEERING = load_tool("camper_steering")
ASSEMBLIES = {"slanted": {"owner": "camper", "cubes": 0}, "front_panels": {"owner": "camper", "cubes": 518}, "cab_seats": {"owner": "camper", "cubes": 464}, **STEERING.ASSEMBLIES}

texture_io = load_tool("texture_io")
mer = load_tool("mer")
outputs = texture_io.Outputs("--check" in sys.argv[2:])
build_layout_lit_textures = load_tool("lit_textures").build_layout_lit_textures

RP = Path(sys.argv[1])
MODELS = RP / "models/entity/yasu_ride"
ENTITY_TEXTURES = RP / "textures/entity/yasu_ride"
ITEM_TEXTURES = RP / "textures/items/yasu_ride"
kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
ATLAS = kit.ATLAS
REGISTRY = kit.REGISTRY
LAYOUT = kit.LAYOUT
DASH_CORE_TOP = load_tool("camper_dash").CORE_TOP_Y
DASH_SILL_Y = load_tool("camper_dash").DASH_GEOMETRY.shelf_y
DASH_COORD_DECIMALS = 8
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

# Keep the original body cube order; bone draw order is declared separately below.
AREA_ORDER = tuple(name for area in kit.AREA_ORDER
                   for name in ((area, "steering") if area == "cab" else (area,)))
areas = {name: load_tool(f"camper_{name}") for name in AREA_ORDER}
merged = AreaCubes()
owners = {}

for name, module in areas.items():
    if name == "kitchen":
        built = module.build_kitchen_top(REGISTRY)[0]
    elif name == "surfaces":
        built = module.build_surfaces(REGISTRY)
    else:
        built = module.build()
    for cubes in built.values():
        for cube in cubes:
            owners[id(cube)] = module.area_of(cube) if name in ("kitchen", "surfaces") else name
    if name == "curtains":
        # Side curtains originally followed their individual panes inside the wall loop.
        for i, anchor in enumerate(module.anchors()):
            index = merged["body"].index(anchor) + 1
            merged["body"][index:index] = built["body"][81 * i:81 * (i + 1)]
        continue
    if name == "arches":
        # The arches rise above the floor. Thin panels enclose them inside without
        # closing the exterior arches; the floor and furniture must leave room for the panels.
        for hole in module.holes():
            for bone in ("body", "seat_2", "seat_3"):
                cut = []
                for cube in merged[bone]:
                    # Surfaces are mapped after wheel-well cuts in their builder.
                    if owners[id(cube)] in ("floor", "walls", "tile", "table"):
                        cut.append(cube)
                        continue
                    for piece in carve(cube, hole):
                        owners[id(piece)] = owners[id(cube)]
                        cut.append(piece)
                merged[bone] = cut
    merged.merge(built)

# Carve after the arches as their inner trim also crosses the drawer cavity.
cut = []
for cube in merged["body"]:
    for piece in carve(cube, areas["kitchen_fronts"].CAVITY):
        owners[id(piece)] = owners[id(cube)]
        cut.append(piece)
merged["body"] = cut
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
door_area, cab, shower, fridge = (areas[n] for n in ("door", "cab", "shower", "fridge"))
DOOR_HINGE = door_area.DOOR_HINGE
STEERING_PIVOT = [-STEERING.STEERING_PIVOT[0], *STEERING.STEERING_PIVOT[1:]]
SHOWER_HINGE, SHOWER_HEAD = shower.SHOWER_HINGE, shower.SHOWER_HEAD
CABINET_SINK_HINGE, CABINET_STOVE_HINGE = areas["kitchen_fronts"].CABINET_SINK_HINGE, areas["kitchen_fronts"].CABINET_STOVE_HINGE
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
    {"name": "steering", "parent": "body", "pivot": STEERING_PIVOT,
     "rotation": [STEERING.WHEEL_LEAN, 0, 0], "cubes": merged["steering"]},
    {"name": "shower_door", "parent": "body", "pivot": SHOWER_HINGE, "cubes": merged["shower_door"]},
    {"name": "cabinet_sink_door", "parent": "body", "pivot": CABINET_SINK_HINGE, "cubes": merged["cabinet_sink_door"]},
    {"name": "cabinet_stove_door", "parent": "body", "pivot": CABINET_STOVE_HINGE, "cubes": merged["cabinet_stove_door"]},
    {"name": "fridge_top_door", "parent": "body", "pivot": FRIDGE_HINGE, "cubes": merged["fridge_top_door"]},
    {"name": "fridge_bottom_door", "parent": "body", "pivot": FRIDGE_HINGE, "cubes": merged["fridge_bottom_door"]},
    {"name": "mirror", "parent": "body", "pivot": [0, 0, 0], "cubes": merged["mirror"]},
    *[{"name": name, "parent": "body", "pivot": pivot, "cubes": merged[name]}
      for name, pivot in areas["kitchen_fronts"].DRAWER_PIVOTS.items()],
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


CAB_BODY_IDS = {id(c) for c in body if owners.get(id(c)) == "cab"}


def dash_top(cube: dict) -> float:
    angle = math.radians(cube.get("rotation", [0, 0, 0])[0])
    py, pz = cube.get("pivot", [0, 0, 0])[1:]
    # Normalize trig noise before the sill checks choose whether to clip a cube.
    return round(max(py + (y - py) * math.cos(angle) + (z - pz) * math.sin(angle)
               for y in (cube["origin"][1], cube["origin"][1] + cube["size"][1])
               for z in (cube["origin"][2], cube["origin"][2] + cube["size"][2])), DASH_COORD_DECIMALS)


def rounded(value):
    """Drop floating-point noise and normalize negative zero before writing."""
    if isinstance(value, float):
        return round(value, 3) + 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        result = {k: rounded(v) for k, v in value.items()}
        if ("origin" in value and "size" in value and "rotation" not in value
                and abs(value["origin"][1] + value["size"][1] - DASH_CORE_TOP) < 1e-8):
            # Keep the approved core/shelf separation through the usual 3-decimal serialization.
            result["size"][1] = round(DASH_CORE_TOP - result["origin"][1], DASH_COORD_DECIMALS)
        if (id(value) in CAB_BODY_IDS and not any(value.get("rotation", [0, 0, 0])[1:])
                and dash_top(value) <= DASH_SILL_Y + 1e-8):
            overhang = dash_top(result) - DASH_SILL_Y
            if overhang > 0:
                # Rounding a clipped cap must not put its corner back above the sill.
                cosine = math.cos(math.radians(result.get("rotation", [0, 0, 0])[0]))
                scale = 10 ** DASH_COORD_DECIMALS
                result["size"][1] = math.floor((result["size"][1] - overhang / cosine) * scale) / scale
        return result
    return value


# Area ownership is retained through the final coordinate mirror.
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
steering_cubes = merged["steering"]
steering_members = {
    "steering_wheel": steering_cubes[:STEERING.WHEEL_CUBES] + [cube for cube in body if owners.get(id(cube)) == "steering"][:2],
    "steering_spokes": steering_cubes[STEERING.WHEEL_CUBES:],
    "steering_lever": [cube for cube in body if owners.get(id(cube)) == "steering"][2:],
}
seat_compound = compound_cubes(merged["seat_0"] + merged["seat_1"])
seat_ids = {id(cube) for cube in seat_compound}
other_compound = compound_cubes([cube for cube in model_cubes if owners.get(id(cube)) != "steering" and id(cube) not in seat_ids])
slanted = [cube for cube in other_compound if cube["rotation"][0] == 45]
assert_axes(model_cubes, {"slanted": slanted,
                         "front_panels": [cube for cube in other_compound if cube not in slanted],
                         "cab_seats": seat_compound, **steering_members}, ASSEMBLIES)
drawer_items = load_tool("camper_drawer_items").geometry(
    [bone for bone in camper_bones if bone["name"] in areas["kitchen_fronts"].DRAWER_PIVOTS])
geo["minecraft:geometry"].append(drawer_items)
print("drawer item cubes added:", sum(len(b.get("cubes", [])) for b in drawer_items["bones"]))
outputs.json(MODELS / "camper.geo.json", rounded(geo), separators=(",", ":"))


atlas_pixels = kit.regions.render_atlas(LAYOUT)
bound_faces = {id(face) for _, face in LAYOUT._faces}
for cube in model_cubes:
    for face in cube["uv"].values():
        if id(face) in bound_faces:
            continue
        u, v = face["uv"]
        du, dv = face["uv_size"]
        for region in LAYOUT.regions:
            x, y = LAYOUT.origin(region.name)
            if (x <= min(u, u + du) and max(u, u + du) <= x + region.width
                    and y <= min(v, v + dv) and max(v, v + dv) <= y + region.height):
                LAYOUT.bind_face(region.name, face)
                break
        else:
            raise ValueError(f"Camper face outside registered regions: {face}")
atlas_errors = kit.regions.audit(LAYOUT, atlas_pixels)
if atlas_errors:
    raise ValueError("Camper atlas audit failed: " + "; ".join(atlas_errors))


def atlas_pixel(x, y):
    offset = (y * LAYOUT.size[0] + x) * 4
    return tuple(atlas_pixels[offset:offset + 4])


outputs.png(ENTITY_TEXTURES / "camper.png", *LAYOUT.size, atlas_pixel)

build_layout_lit_textures(outputs, ENTITY_TEXTURES, "camper", LAYOUT,
                          atlas_pixel, "base", lambda x, y: ATLAS.swatch_at(x, y) in LIT_SLOTS)

# Polished plate, not a perfect mirror: Vibrant Visuals keeps a soft highlight along the housing.
MER_MIRROR_CHROME = mer.Mer(255, 0, 26)
mirror_mask = mer.layout_mask(LAYOUT, "base", lambda x, y:
    MIRROR_CHROME_REGION.x <= x < MIRROR_CHROME_REGION.x + MIRROR_CHROME_REGION.w
    and MIRROR_CHROME_REGION.y <= y < MIRROR_CHROME_REGION.y + MIRROR_CHROME_REGION.h)
outputs.png(ENTITY_TEXTURES / "camper_mirror.png", *LAYOUT.size, atlas_pixel)
outputs.png(ENTITY_TEXTURES / "camper_mirror_mer.png", *LAYOUT.size, mer.mer_painter(
    lambda x, y: MER_MIRROR_CHROME if mirror_mask(x, y) else None))
texture_io.write_texture_set(outputs, ENTITY_TEXTURES, "camper_mirror", "camper_mirror_mer")

interior_mer = load_tool("camper_mer").build_interior_mer(LAYOUT)
outputs.png(ENTITY_TEXTURES / "camper_interior_mer.png", *LAYOUT.size,
            texture_io.texel_reader(LAYOUT.size[0], interior_mer))
texture_io.write_texture_set(outputs, ENTITY_TEXTURES, "camper", "camper_interior_mer")

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
