"""Camping gear builders in camping_gear.json order."""

from tool_loader import load_tool, load_tool_in

gear_atlas = load_tool("gear_atlas")

IDS = (
    "potted_plant",
    "macrame_planter",
    "cactus_pot",
    "percolator",
    "enamel_kettle",
    "saucepan",
    "mug_pair",
    "sugar_pot",
    "fruit_bowl",
    "toaster",
    "transistor_radio",
    "book_stack",
    "road_map",
    "photo_frame",
    "cushion",
    "tissue_box",
    "desk_fan",
)


def build(item_id):
    gear_atlas.begin(item_id)
    return load_tool_in("gear_items", item_id).build()


def models():
    return {item_id: build(item_id) for item_id in IDS}
