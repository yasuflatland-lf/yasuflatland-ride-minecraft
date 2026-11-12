"""Camping gear builders in camping_gear.json order."""

import json
from pathlib import Path

from tool_loader import load_tool, load_tool_in

gear_atlas = load_tool("gear_atlas")

IDS = tuple(
    item["id"]
    for item in json.loads(Path(__file__).with_name("camping_gear.json").read_text())
)


def build(item_id):
    gear_atlas.begin(item_id)
    return load_tool_in("gear_items", item_id).build()


def models():
    return {item_id: build(item_id) for item_id in IDS}


def assemblies(item_id):
    return getattr(load_tool_in("gear_items", item_id), "ASSEMBLIES", {})
