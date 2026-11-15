"""Generate the camping gear block models and their shared texture atlas (ADR 0093).

    python3 -I tools/gen_camping_gear.py <resource pack> <behavior pack>          write the files
    python3 -I tools/gen_camping_gear.py <resource pack> <behavior pack> --check  fail if any file is stale

tools/camping_gear.json lists the items; gear_registry loads each item's cubes. Units are pixels (16
per block). Every model is centered on x 0 and z 0, with its front at -z (ADR 0009). A standing item
stands on y 0; a hanging item also starts on y 0, and its slot's height lifts it to the hook (ADR
0102). The 512 x 512 atlas preserves the swatches in cell 0 and reserves per-item cells
with edge-extension gutters; gear_atlas defines the layout (ADR 0247). --check compares parsed JSON and decoded pixels, because
Biome reformats the geometry and zlib builds do not all compress identically. It also writes the
Behavior Pack decor blocks, the items, and the gear part of
item_texture.json; the decor block's face, height, and spot states are described next to
FACE_ROTATION. It also writes the pair blocks and their geometry, which draw the two items of a
shelf board or of the table in one block (PAIRS, ADR 0108), the wall cabinet's compartment
block, a pair block that also holds the ceiling up and shows its items only while its door is
open (ADR 0114), and the fridge's compartment block, which shows its items the same way (ADR
0123).
The icon entry of the camping gear box (BOX) comes first in the generated part of
item_texture.json; its item JSON and icon are written elsewhere (ADR 0093), and
tools/gen_item_catalog.py lists it in the creative group.
A gear shape may use cubes turned about a single axis (a `pivot` and a `rotation` on the cube; ADR
0169): cube_tilt.bounds() and the pair blocks follow the turn. Registered assemblies allow yaw plus local pitch, without roll
(ADR 0247).
"""

import argparse
import json
import math
import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool, load_tool_in

texture_io = load_tool("texture_io")
gear_model = load_tool("gear_model")
gear_registry = load_tool("gear_registry")
gear_atlas = load_tool("gear_atlas")
gear_validate = load_tool("gear_validate")
ATLAS_SIZE = gear_atlas.ATLAS_SIZE
face = gear_atlas.face
box = gear_atlas.box
atlas_pixels = gear_atlas.atlas_pixels

cube_tilt = load_tool("cube_tilt")

LAID_TAG = "tag:yasu_ride:laid"

SPEC = Path(__file__).resolve().parent / "camping_gear.json"
MODELS = "models/blocks/yasu_ride"
ATLAS = "textures/blocks/yasu_ride/camping_gear.png"
TERRAIN = "textures/terrain_texture.json"
BLOCKS = "blocks/yasu_ride"
ITEMS = "items/yasu_ride"
ITEM_TEXTURES = "textures/item_texture.json"
ATLAS_KEY = "yasu_ride_camping_gear"
# Decor block states (ADR 0093). The rotation turns the gear model into the camper model's frame:
# model -z to the camper's front. In a block frame, rotation 0 faces model -z north and +90 turns
# north to west.
FACE_STATE = "yasu_ride:face"
HEIGHT_STATE = "yasu_ride:height"
FACE_ROTATION = [180, 90, 0, -90]  # index = FACE_STATE = the camper's yaw quarter
FACES = range(len(FACE_ROTATION))
HEIGHTS = range(16)  # HEIGHT_STATE, px above the cell bottom
# SPOT_STATE says where on its cell the item stands (ADR 0107): index = DECOR_SPOTS in
# src/domain/vehicle/kinds/camper/furniture.ts, as (left, forward) px from the cell middle in the
# camper's room frame. Spot 0 is the middle; 1 to 4 were the four stove burners of ADR 0107,
# 15 px high (SPOT_HEIGHTS), so only those permutations are written. No slot uses them since the
# stove got one burner in its middle (ADR 0112); they stay so a decor block an older build laid
# on a burner still draws there until the next lay clears it. tests/packs/campingGear.test.ts
# ties both to the domain.
SPOT_STATE = "yasu_ride:spot"
SPOTS = {0: (0, 0), 1: (3.8, 5.4), 2: (3.8, -5.35), 3: (-3.3, 5.4),
         4: (-3.3, -5.35), 9: (4.2, 5.057), 10: (-4.1, 4.441)}
SPOT_HEIGHTS = {0: list(HEIGHTS), **{spot: [15] for spot in range(1, 5)}, 9: [3], 10: [3]}
# A shelf board or the table holds two items in its one cell, and a block's transformed geometry
# must keep at least one pixel on each axis inside its own cell: a decor block moved a cell away
# to draw the second item is rejected and renders as the fallback block (ADR 0108). So one pair
# block per furniture draws both. Its geometry has one bone per standing item per end, the item
# standing at that end, and bone_visibility shows the bone whose item the end's states name. ENDS
# are each end's (left, forward) px from the cell middle in the camper's room frame, as
# DECOR_SPOTS 5 to 8 in src/domain/vehicle/kinds/camper/furniture.ts; HEIGHTS are the heights of
# its slots. tests/packs/campingGear.test.ts ties both to the domain slots.
# A pair with a "door" is a compartment behind a storage door (ADR 0121): its "door" names how
# its boxes are laid (DOOR_BOXES), and "inside_px" is its inside height, which no standing item
# may pass.
PAIRS = {
    # No slot lays the shelf's pair block since the fridge took the shelf's place. It stays
    # defined so a block an older build laid keeps its type, which lets the next lay replace it
    # with the fridge's compartment block (ADR 0123).
    "shelf": {"ends": [(0, -3.5), (0, 3.5)], "heights": [4, 10]},
    "table": {"ends": [(3.3, 0), (-3.7, 0)], "heights": [12]},
    # A wall cabinet compartment under the ceiling, as long as a shelf board, so its ends are the
    # board's. Its items stand on the compartment floor, 3 px above the cell bottom (ADR 0114).
    # Its inside runs from its floor's top at model y 51 to its top panel at 60
    # (tools/gen_camper.py CABINET_Y).
    "cabinet": {"ends": [(0, -3.5), (0, 3.5)], "heights": [3], "door": "ceiling", "inside_px": 9},
    # A fridge compartment in a shelf cell, as long as a shelf board, so its ends are the board's.
    # Its items stand on the bottom compartment's floor, 3 px above layer 1's bottom, or on the
    # divider, 4 px above layer 2's bottom. The upper compartment is the lower one inside: from
    # the divider's top at model y 36 to the top panel at 48 (tools/gen_camper.py FRIDGE_Y,
    # ADR 0123).
    "fridge": {"ends": [(0, -3.5), (0, 3.5)], "heights": [3, 4], "door": "cell", "inside_px": 12},
}
# A compartment block's door state: its items show only while the door is open or still swinging
# shut. The cabinet's box ("ceiling") covers the compartment from its floor to the top of its
# door, 10 px, and it keeps the ceiling plate's collision at the top 3 px of the cell. Both
# boxes are given before the lift, which moves them with the items (ADR 0097, 0107); if the
# client left them in place, both would still be inside the cell and over the cabinet (ADR
# 0114). The fridge's box ("cell") has no collision, as the shelf had none, and runs from the
# compartment floor to the cell's top: given before the lift, it is the cell less the lift, so
# each height's permutation sets its own (ADR 0123).
OPEN_STATE = "yasu_ride:open"
CABINET_COMPONENT = "yasu_ride:camper_cabinet"
CABINET_BOX_PX = 10
CEILING_PLATE_PX = 3
# A block state holds at most 16 values, and an end takes 17: empty, or one of the 16 standing
# items. So an end's code, 0 for empty and 1 + the item's index among the standing items, is
# split into end<n>_page (code // PAIR_PAGE_SIZE) and end<n>_item (code % PAIR_PAGE_SIZE), as
# pairEndStates in src/infrastructure/vehicle/bedrock/identifiers.ts.
PAIR_PAGE_SIZE = 10
MAX_STATE_VALUES = 16
# BDS rejects a block whose enum state lists one value ("Block State enum array must have more
# than 1 value"), so a pair whose ends share one height, the table, has no HEIGHT_STATE and its
# permutations lift it by that height (ADR 0108).
MIN_STATE_VALUES = 2
# The box a player gets with their first camper (ADR 0093). Its icon entry comes first in the
# generated part of item_texture.json; tools/gen_item_catalog.py makes it the creative group's
# icon and first item.
BOX = "camping_gear_box"
CELL_PX = 16
DRAWER_IDS = load_tool("camper_drawer_items").DRAWER_IDS
COUNTER_HEIGHT = 14


def rounded(value):
    """Drop floating-point noise and normalize negative zero before writing."""
    if isinstance(value, float):
        value = round(value, 3) + 0.0
        return int(value) if value.is_integer() else value
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def collect_assemblies(item_tables):
    table = {}
    for item_id, entries in item_tables.items():
        for name, entry in entries.items():
            if not name.startswith(f"{item_id}_") or name in table:
                raise ValueError(f"{item_id}: invalid or duplicate assembly {name!r}")
            table[name] = entry
    return table


MODELS_BY_ID = gear_registry.models()
ITEM_ASSEMBLIES = {item_id: getattr(load_tool_in("gear_items", item_id), "ASSEMBLIES", {})
                   for item_id in gear_registry.IDS}
ASSEMBLIES = collect_assemblies(ITEM_ASSEMBLIES)
SHAPES = {item_id: list(model.cubes) for item_id, model in MODELS_BY_ID.items()}

ATLAS_PIXELS = atlas_pixels()


def has_cutouts(item_id):
    return 0 in gear_validate.sampled_alphas(SHAPES[item_id], ATLAS_PIXELS, ATLAS_SIZE)


def geometry(item_id, cubes):
    return rounded({
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": f"geometry.yasu_ride.{item_id}",
                "texture_width": ATLAS_SIZE,
                "texture_height": ATLAS_SIZE,
            },
            "bones": [{"name": "root", "pivot": [0, 0, 0], "cubes": cubes}],
        }],
    })


def moved(cube, left, ahead):
    """The cube shifted to a pair end's spot; a turned cube's pivot moves with it."""
    # Translate the shipped coordinates so pair and standalone meshes round identically.
    cube = rounded(cube)
    shift = [left, 0, ahead]
    result = {**cube, "origin": [cube["origin"][i] - shift[i] for i in range(3)]}
    if "pivot" in cube:
        result["pivot"] = [cube["pivot"][i] - shift[i] for i in range(3)]
    return result


def pair_geometry(kind, spec):
    """Place one bone per standing item at each end's spot in the gear model's frame.

    The camper's left is -x and its forward is -z (FACE_ROTATION). One alpha-test
    material preserves cutouts across both items: BDS rejects material instances
    that mix opaque and blending render methods in one block ("MaterialInstances
    can't mix and match opaque and transparent materials"). Blending every item
    would sort their faces wrongly (ADR 0108).
    """
    bones = []
    for end, (left, ahead) in enumerate(PAIRS[kind]["ends"]):
        for item in standing(spec):
            cubes = [moved(c, left, ahead) for c in SHAPES[item["id"]]]
            members = {name: [moved(c, left, ahead) for c in part]
                       for name, part in MODELS_BY_ID[item["id"]].assemblies.items()}
            table = ITEM_ASSEMBLIES[item["id"]]
            cube_tilt.assert_axes(cubes, members, table)
            bones.append({"name": pair_bone(end, item["id"]), "pivot": [0, 0, 0], "cubes": cubes})
    return rounded({
        "format_version": "1.12.0",
        "minecraft:geometry": [{
            "description": {
                "identifier": f"geometry.yasu_ride.{kind}_decor_pair",
                "texture_width": ATLAS_SIZE,
                "texture_height": ATLAS_SIZE,
            },
            "bones": bones,
        }],
    })


def standing(spec):
    return [item for item in spec if not item["hanging"]]


def pair_bone(end, item_id):
    return f"end{end}_{item_id}"


def pair_pages(spec):
    return -(-(len(standing(spec)) + 1) // PAIR_PAGE_SIZE)


def drawers_geometry(spec):
    # Bedrock requires a cube at y 0 even when every visible item is raised (ADR 0101).
    bones = [{"name": "anchor", "pivot": [0, 0, 0],
              "cubes": [box(0, 0, 0, 1, 1, 1, "cream")]}]
    groups = [("counter", [item["id"] for item in standing(spec)], (0, 0, COUNTER_HEIGHT))]
    for prefix, ids, (x, z, height) in groups:
        for item_id in ids:
            cubes = []
            for cube in SHAPES[item_id]:
                cube = moved(cube, -x, -z)
                cube["origin"][1] += height
                if "pivot" in cube:
                    cube["pivot"][1] += height
                cubes.append(cube)
            bones.append({"name": f"{prefix}_{item_id}", "pivot": [0, 0, 0], "cubes": cubes})
    result = geometry("drawers_decor_pair", [])
    result["minecraft:geometry"][0]["bones"] = bones
    return rounded(result)


def drawers_block(spec):
    visibility = {"anchor": False}
    for code, item in enumerate(standing(spec), 1):
        page, index = divmod(code, PAIR_PAGE_SIZE)
        visibility[f"counter_{item['id']}"] = (
            f"q.block_state('yasu_ride:counter_page') == {page} && "
            f"q.block_state('yasu_ride:counter_item') == {index}")
    block = pair_block("cabinet", spec)
    body = block["minecraft:block"]
    body["description"]["identifier"] = "yasu_ride:drawers_decor_pair"
    body["description"]["states"] = {
        FACE_STATE: list(FACES),
        "yasu_ride:counter_page": list(range(pair_pages(spec))),
        "yasu_ride:counter_item": list(range(PAIR_PAGE_SIZE)),
    }
    components = body["components"]
    components["minecraft:geometry"] = {
        "identifier": "geometry.yasu_ride.drawers_decor_pair", "bone_visibility": visibility}
    components["minecraft:collision_box"] = False
    components["minecraft:selection_box"] = {"origin": [-8, 0, -8], "size": [16, COUNTER_HEIGHT, 16]}
    body["permutations"] = [{
        "condition": f"q.block_state('{FACE_STATE}') == {face}",
        "components": {"minecraft:transformation": {"rotation": [0, FACE_ROTATION[face], 0]}},
    } for face in FACES]
    body["permutations"].append({
        "condition": "!(q.block_state('yasu_ride:counter_page') == 0 && "
                     "q.block_state('yasu_ride:counter_item') == 0)",
        "components": {"minecraft:selection_box": {"origin": [-8, 0, -8], "size": [16, 16, 16]}},
    })
    return block


def y_span(item):
    """Every item's model starts on y 0; a hanging item is lifted to the hook by its slot's
    yasu_ride:height (ADR 0102)."""
    return (0, item["height_px"])


def validate(spec):
    """Stop before writing anything when a shape disagrees with its spec row."""
    errors = []
    if [gear_model.GearSpec.from_row(item).id for item in spec] != list(gear_registry.IDS):
        errors.append("Registry must list exactly the ids of camping_gear.json, in the same order")
    # Series part 5/17 adds the static tile assignments.
    tiles = getattr(gear_atlas, "GEAR_TILES", {})
    pixels = ATLAS_PIXELS
    for item in spec:
        errors.extend(gear_atlas.check_alpha(item["id"], item["glass"]))
        if not isinstance(item["hanging"], bool):
            errors.append(f"{item['id']}: hanging must be true or false")
        cubes = SHAPES.get(item["id"], [])
        errors.extend(gear_validate.item_budget_errors(item["id"], cubes))
        errors.extend(gear_validate.rotation_errors(item["id"], cubes))
        errors.extend(gear_validate.uv_errors(item["id"], cubes, tiles))
        alphas = gear_validate.sampled_alphas(cubes, pixels, ATLAS_SIZE)
        errors.extend(gear_validate.alpha_errors(item["id"], item["glass"], alphas))
        if not cubes:
            continue
        try:
            cube_tilt.assert_axes(cubes, MODELS_BY_ID[item["id"]].assemblies,
                                  ITEM_ASSEMBLIES[item["id"]])
        except ValueError as error:
            errors.append(f"{item['id']}: {error}")
            continue
        (x0, y0, z0), (x1, y1, z1) = cube_tilt.bounds(cubes)
        w = item["width_px"]
        # Written cube coordinates have three decimals; turning them adds sub-millipixel error.
        if x0 > -w / 2 + 0.001 or x1 < w / 2 - 0.001 or x0 < -8 or x1 > 8:
            errors.append(f"{item['id']}: x spans {x0}..{x1}, not covering {-w / 2}..{w / 2} within -8..8")
        ylo, yhi = y_span(item)
        if (y0, y1) != (ylo, yhi):
            errors.append(f"{item['id']}: y spans {y0}..{y1}, not {ylo}..{yhi}")
        if y0 < 0 or y1 > CELL_PX:
            errors.append(f"{item['id']}: y spans {y0}..{y1}, outside the cell")
        if z0 < -8 or z1 > 8:
            errors.append(f"{item['id']}: z spans {z0}..{z1}, outside the cell")
    counts = {item["id"]: len(SHAPES.get(item["id"], [])) for item in standing(spec)}
    for kind, pair in PAIRS.items():
        errors.extend(gear_validate.pair_budget_errors(kind, counts))
        for end, (left, ahead) in enumerate(pair["ends"]):
            for item in standing(spec):
                model = MODELS_BY_ID[item["id"]]
                try:
                    cube_tilt.assert_axes(
                        [moved(c, left, ahead) for c in model.cubes],
                        {name: tuple(moved(c, left, ahead) for c in members)
                         for name, members in model.assemblies.items()}, ITEM_ASSEMBLIES[item["id"]])
                except ValueError as error:
                    errors.append(f"{kind} end {end}: {item['id']}: {error}")
                (x0, _, z0), (x1, _, z1) = cube_tilt.bounds(SHAPES.get(item["id"], []) or [box(0, 0, 0, 0, 0, 0, "cream")])
                if x0 - left < -8 or x1 - left > 8 or z0 - ahead < -8 or z1 - ahead > 8:
                    errors.append(f"{kind} end {end}: {item['id']} leaves the cell")
    for kind, pair in PAIRS.items():
        if any(item["height_px"] > pair.get("inside_px", CELL_PX) for item in standing(spec)):
            errors.append(f"a standing item is taller than the {kind} compartment")
    if pair_pages(spec) > MAX_STATE_VALUES or PAIR_PAGE_SIZE > MAX_STATE_VALUES:
        errors.append("a pair block state holds more than 16 values")
    if pair_pages(spec) < MIN_STATE_VALUES or PAIR_PAGE_SIZE < MIN_STATE_VALUES:
        errors.append("a pair block state holds fewer than 2 values")
    standing_by_id = {item["id"]: item for item in standing(spec)}
    drawer_states = drawers_block(spec)["minecraft:block"]["description"]["states"]
    if any(len(values) > MAX_STATE_VALUES for values in drawer_states.values()):
        errors.append("a drawer block state holds more than 16 values")
    for item_id in DRAWER_IDS:
        if item_id not in standing_by_id or standing_by_id[item_id]["height_px"] > 4.5:
            errors.append(f"{item_id} does not fit the drawer's 4.5 px inside height")
    if sum(max(1, math.ceil(math.log2(len(values))))
           for values in drawer_states.values()) > 16:
        errors.append("the combined drawer block exceeds Bedrock's 16-bit state budget")
    if errors:
        sys.exit("\n".join(errors))


def terrain():
    return {
        "resource_pack_name": "yasu_ride",
        "texture_name": "atlas.terrain",
        "texture_data": {ATLAS_KEY: {"textures": "textures/blocks/yasu_ride/camping_gear"}},
    }


def num(v):
    return int(v) if float(v).is_integer() else v


def spot_translation(face, spot):
    """The world offset in blocks of `spot` when the camper's yaw is face * 90 degrees: the
    camper's forward is (-sin yaw, cos yaw) and its left (forward z, -forward x), as in room.ts.
    The translation applies after the rotation, in world axes."""
    left, ahead = SPOTS[spot]
    yaw = math.radians(90 * face)
    fx, fz = round(-math.sin(yaw)), round(math.cos(yaw))
    lx, lz = fz, -fx
    return ((left * lx + ahead * fx) / 16, (left * lz + ahead * fz) / 16)


def selection_box(item):
    """A hanging item keeps its footprint, so the box under the hook does not catch presses
    aimed at the table below (ADR 0097). A standing item's box spans the whole cell from the
    item's base to its top, at least 1 px, so a press anywhere on the furniture top under it
    reaches the decor block (ADR 0107)."""
    y0, y1 = y_span(item)
    if item["hanging"]:
        w = item["width_px"]
        return {"origin": [num(-w / 2), num(y0), num(-w / 2)], "size": [w, num(y1 - y0), w]}
    half = CELL_PX // 2
    return {"origin": [-half, num(y0), -half], "size": [CELL_PX, num(max(1, y1 - y0)), CELL_PX]}


def decor_block(item):
    gid = item["id"]
    return {
        "format_version": "1.21.80",
        "minecraft:block": {
            "description": {
                "identifier": f"yasu_ride:{gid}_decor",
                "menu_category": {"category": "none"},
                "states": {
                    FACE_STATE: list(FACES),
                    HEIGHT_STATE: list(HEIGHTS),
                    SPOT_STATE: list(SPOTS),
                },
            },
            "components": {
                "minecraft:geometry": f"geometry.yasu_ride.{gid}",
                "minecraft:material_instances": {
                    "*": {"texture": ATLAS_KEY, "render_method": "blend" if item["glass"] else "alpha_test" if has_cutouts(item["id"]) else "opaque"}
                },
                "minecraft:light_dampening": 0,
                "minecraft:destructible_by_mining": False,
                "minecraft:destructible_by_explosion": False,
                LAID_TAG: {},
                "minecraft:custom_components": ["yasu_ride:camper_decor"],
                "minecraft:collision_box": False,
                "minecraft:selection_box": selection_box(item),
            },
            "permutations": [
                {
                    "condition": (
                        f"q.block_state('{FACE_STATE}') == {face} && q.block_state('{SPOT_STATE}') == {spot}"
                        f" && q.block_state('{HEIGHT_STATE}') == {height}"
                    ),
                    "components": {
                        "minecraft:transformation": {
                            "rotation": [0, FACE_ROTATION[face], 0],
                            "translation": [num(dx), num(height / 16), num(dz)],
                        }
                    },
                }
                for face in FACES
                for spot in SPOTS
                for dx, dz in [spot_translation(face, spot)]
                for height in SPOT_HEIGHTS[spot]
            ],
        },
    }


def pair_block(kind, spec):
    """Both items of a shelf board or the table in one block (PAIRS). Its permutations only turn
    it by the face and lift it by the height, so the items stay over its own cell. A pair with one
    height has no height state (MIN_STATE_VALUES). The selection box covers the whole cell up to
    the tallest standing item, over both items (ADR 0108). A pair with a door, a storage
    compartment, shows its items only while open and takes its door's boxes (DOOR_BOXES, ADR
    0114, 0121, 0123)."""
    ids = [item["id"] for item in standing(spec)]
    door = PAIRS[kind].get("door")
    visibility = {}
    for end in range(2):
        for code, item_id in enumerate(ids, start=1):
            page, index = divmod(code, PAIR_PAGE_SIZE)
            visibility[pair_bone(end, item_id)] = (
                (f"q.block_state('{OPEN_STATE}') == true && " if door else "")
                + f"q.block_state('yasu_ride:end{end}_page') == {page}"
                f" && q.block_state('yasu_ride:end{end}_item') == {index}"
            )
    top = max(item["height_px"] for item in standing(spec))
    half = CELL_PX // 2
    heights = PAIRS[kind]["heights"]
    height_states = {HEIGHT_STATE: heights} if len(heights) >= MIN_STATE_VALUES else {}

    def condition(face, height):
        terms = [f"q.block_state('{FACE_STATE}') == {face}"]
        if height_states:
            terms.append(f"q.block_state('{HEIGHT_STATE}') == {height}")
        return " && ".join(terms)

    return {
        "format_version": "1.21.80",
        "minecraft:block": {
            "description": {
                "identifier": f"yasu_ride:{kind}_decor_pair",
                "menu_category": {"category": "none"},
                "states": {
                    FACE_STATE: list(FACES),
                    **height_states,
                    **({OPEN_STATE: [False, True]} if door else {}),
                    **{
                        f"yasu_ride:end{end}_{part}": list(range(size))
                        for end in range(2)
                        for part, size in (("item", PAIR_PAGE_SIZE), ("page", pair_pages(spec)))
                    },
                },
            },
            "components": {
                "minecraft:geometry": {
                    "identifier": f"geometry.yasu_ride.{kind}_decor_pair",
                    "bone_visibility": visibility,
                },
                "minecraft:material_instances": {
                    "*": {"texture": ATLAS_KEY, "render_method": "alpha_test" if any(has_cutouts(item["id"]) for item in standing(spec)) else "opaque"},
                },
                "minecraft:light_dampening": 0,
                "minecraft:destructible_by_mining": False,
                "minecraft:destructible_by_explosion": False,
                LAID_TAG: {},
                **(DOOR_BOXES[door][0](heights[0]) if door else {
                    "minecraft:custom_components": ["yasu_ride:camper_decor"],
                    "minecraft:collision_box": False,
                    "minecraft:selection_box": {"origin": [-half, 0, -half], "size": [CELL_PX, top, CELL_PX]},
                }),
            },
            "permutations": [
                {
                    "condition": condition(face, height),
                    "components": {
                        "minecraft:transformation": {
                            "rotation": [0, FACE_ROTATION[face], 0],
                            "translation": [0, num(height / 16), 0],
                        },
                        **(DOOR_BOXES[door][1](height) if door else {}),
                    },
                }
                for face in FACES
                for height in heights
            ],
        },
    }


def ceiling_boxes(lift):
    """A compartment under the ceiling: its component and boxes, before its lift (OPEN_STATE)."""
    half = CELL_PX // 2
    return {
        "minecraft:custom_components": [CABINET_COMPONENT],
        "minecraft:collision_box": {
            "origin": [-half, CELL_PX - CEILING_PLATE_PX - lift, -half],
            "size": [CELL_PX, CEILING_PLATE_PX, CELL_PX],
        },
        "minecraft:selection_box": {"origin": [-half, 0, -half], "size": [CELL_PX, CABINET_BOX_PX, CELL_PX]},
    }


def open_cell_component(_lift):
    """A compartment without collision: its component; each permutation sets its box."""
    return {"minecraft:custom_components": [CABINET_COMPONENT], "minecraft:collision_box": False}


def floor_to_top_box(lift):
    """The selection box from the compartment floor to the cell's top once lifted by `lift`."""
    half = CELL_PX // 2
    return {"minecraft:selection_box": {"origin": [-half, 0, -half], "size": [CELL_PX, CELL_PX - lift, CELL_PX]}}


# A compartment's boxes by its PAIRS "door": the components every permutation shares, then those
# of the permutation at each height.
DOOR_BOXES = {
    "ceiling": (ceiling_boxes, lambda _height: {}),
    "cell": (open_cell_component, floor_to_top_box),
}


def gear_item(item):
    gid = item["id"]
    return {
        "format_version": "1.21.80",
        "minecraft:item": {
            "description": {"identifier": f"yasu_ride:{gid}", "menu_category": {"category": "items"}},
            "components": {
                "minecraft:icon": f"yasu_ride_{gid}",
                "minecraft:max_stack_size": 64,
                "minecraft:display_name": {"value": f"item.yasu_ride:{gid}.name"},
            },
        },
    }


def item_textures(current, spec):
    """Keep every other entry in its order, then the box and each gear item, in spec order (ADR 0093)."""
    owned = [BOX] + [item["id"] for item in spec]
    keys = {f"yasu_ride_{i}" for i in owned}
    data = {k: v for k, v in current["texture_data"].items() if k not in keys}
    for i in owned:
        data[f"yasu_ride_{i}"] = {"textures": f"textures/items/yasu_ride/{i}"}
    return {
        "resource_pack_name": current["resource_pack_name"],
        "texture_name": current["texture_name"],
        "texture_data": data,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("behavior_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    spec = json.loads(SPEC.read_text())
    validate(spec)
    rp = args.resource_pack
    documents = {rp / MODELS / f"{item_id}.geo.json": geometry(item_id, cubes) for item_id, cubes in SHAPES.items()}
    for kind in PAIRS:
        documents[rp / MODELS / f"{kind}_decor_pair.geo.json"] = pair_geometry(kind, spec)
    documents[rp / MODELS / "drawers_decor_pair.geo.json"] = drawers_geometry(spec)
    documents[rp / TERRAIN] = terrain()
    bp = args.behavior_pack
    for item in spec:
        gid = item["id"]
        documents[bp / BLOCKS / f"{gid}_decor.block.json"] = decor_block(item)
        documents[bp / ITEMS / f"{gid}.item.json"] = gear_item(item)
    for kind in PAIRS:
        documents[bp / BLOCKS / f"{kind}_decor_pair.block.json"] = pair_block(kind, spec)
    documents[bp / BLOCKS / "drawers_decor_pair.block.json"] = drawers_block(spec)
    documents[rp / ITEM_TEXTURES] = item_textures(json.loads((rp / ITEM_TEXTURES).read_text()), spec)
    atlas = rp / ATLAS
    out = texture_io.Outputs(args.check, report_writes=True)

    for path, document in documents.items():
        out.json(path, json.dumps(document, separators=(",", ":")) + "\n")
    out.png(atlas, ATLAS_SIZE, ATLAS_SIZE, texture_io.texel_reader(ATLAS_SIZE, ATLAS_PIXELS), compress_level=9)
    out.finish("Camping gear outputs are out of date with tools/gen_camping_gear.py and tools/camping_gear.json. Run `pnpm model` and commit the result:", "camping gear models, atlas, blocks, and items are up to date")


if __name__ == "__main__":
    main()
