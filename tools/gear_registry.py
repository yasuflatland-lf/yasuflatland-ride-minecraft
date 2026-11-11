"""Camping gear builders in camping_gear.json order."""

from tool_loader import load_tool_in

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


def models():
    return {item_id: load_tool_in("gear_items", item_id).build() for item_id in IDS}
