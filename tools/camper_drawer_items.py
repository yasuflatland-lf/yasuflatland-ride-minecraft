"""Gear-atlas geometry following the camper's animated drawers (ADR 0121)."""

from copy import deepcopy
from tool_loader import load_tool

# Keep the saved domain allowlist order: zero is empty, followed by one-based codes.
DRAWER_IDS = ("saucepan", "mug_pair", "sugar_pot", "fruit_bowl", "transistor_radio",
              "book_stack", "road_map", "cushion", "tissue_box", "binoculars")


def geometry(drawer_bones):
    registry = load_tool("gear_registry")
    bones = [{"name": "root", "pivot": [0, 0, 0]},
             {"name": "body", "parent": "root", "pivot": [0, 0, 0]}]
    for drawer in drawer_bones:
        bones.append({key: deepcopy(value) for key, value in drawer.items() if key != "cubes"})
        floor = min(drawer["cubes"], key=lambda cube: cube["size"][1])
        center = [floor["origin"][0] + floor["size"][0] / 2,
                  floor["origin"][1] + floor["size"][1],
                  floor["origin"][2] + floor["size"][2] / 2]
        for item in DRAWER_IDS:
            cubes = deepcopy(list(registry.build(item).cubes))
            for cube in cubes:
                for key in ("origin", "pivot"):
                    if key in cube:
                        cube[key] = [value + shift for value, shift in zip(cube[key], center)]
            bones.append({"name": f"{drawer['name']}_item_{item}", "parent": drawer["name"],
                          "pivot": center, "cubes": cubes})
    size = load_tool("gear_atlas").ATLAS_SIZE
    return {"description": {"identifier": "geometry.yasu_ride.camper.drawer_items",
                            "texture_width": size, "texture_height": size,
                            "visible_bounds_width": 10, "visible_bounds_height": 5,
                            "visible_bounds_offset": [0, 1.5, 0]}, "bones": bones}
