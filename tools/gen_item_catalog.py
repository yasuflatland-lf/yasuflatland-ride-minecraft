"""Write the Behavior Pack's creative catalog from GROUPS (ADR 0093).

    python3 -I tools/gen_item_catalog.py <behavior pack>          write the file
    python3 -I tools/gen_item_catalog.py <behavior pack> --check  fail if the file is stale

item_catalog/crafting_item_catalog.json lists the groups in the Items tab in list order.
--check compares parsed JSON because Biome reformats the file.
"""
import argparse
import json
import sys
from pathlib import Path

SPEC = Path(__file__).resolve().parent / "camping_gear.json"
CATALOG = "item_catalog/crafting_item_catalog.json"
NAMESPACE = "yasu_ride"
FORMAT_VERSION = "1.21.60"
CATEGORY = "items"
GEAR_IDS = [item["id"] for item in json.loads(SPEC.read_text())]

# Plain camp-feature items, not decor in tools/camping_gear.json (ADR 0122, 0130).
OUTSIDE_IDS = ["low_chair_item", "tent_item", "camp_table_item", "fire_pit_item"]

# Inside gear starts with its gift box; independent outdoor items follow in their own
# group, before the bulldozer switches (ADR 0144).
GROUPS = [
    {
        "name": "camping_gear_inside",
        "icon": "camping_gear_box",
        "items": ["camping_gear_box", *GEAR_IDS],
    },
    {
        "name": "camping_gear_outside",
        "icon": "low_chair_item",
        "items": OUTSIDE_IDS,
    },
    # The bulldozer's switches; the Blade Up/Down item raises and lowers its blade (ADR 0138).
    {"name": "bulldozer_switches", "icon": "blade_switch", "items": ["blade_switch"]},
]


def validate(groups):
    errors = []
    for item in OUTSIDE_IDS:
        if item in GEAR_IDS:
            errors.append(f"{item} is both outside gear and camper decor")
    names = set()
    seen_items = set()
    for group in groups:
        name, icon, items = group["name"], group["icon"], group["items"]
        if name in names:
            errors.append(f"group {name} is listed more than once")
        names.add(name)
        if not items:
            errors.append(f"{name}: has no items")
        if icon not in items:
            errors.append(f"{name}: icon {icon} is not one of its items")
        for item in items:
            if item in seen_items:
                errors.append(f"{item} is listed more than once")
            seen_items.add(item)
    if errors:
        sys.exit("\n".join(errors))


def catalog(groups):
    return {
        "format_version": FORMAT_VERSION,
        "minecraft:crafting_items_catalog": {
            "categories": [
                {
                    "category_name": CATEGORY,
                    "groups": [
                        {
                            "group_identifier": {
                                "icon": f"{NAMESPACE}:{group['icon']}",
                                "name": f"{NAMESPACE}:{group['name']}",
                            },
                            "items": [f"{NAMESPACE}:{i}" for i in group["items"]],
                        }
                        for group in groups
                    ],
                }
            ]
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("behavior_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    validate(GROUPS)
    document = catalog(GROUPS)
    path = args.behavior_pack / CATALOG
    if not args.check:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(document, separators=(",", ":")) + "\n")
        print(f"wrote {path}")
        return
    try:
        stale = json.loads(path.read_text()) != document
    except (OSError, ValueError):
        stale = True
    if stale:
        sys.exit(f"{path} out of date with tools/gen_item_catalog.py and tools/camping_gear.json. Run `pnpm model` and commit the result.")
    print("creative item catalog is up to date")


if __name__ == "__main__":
    main()
