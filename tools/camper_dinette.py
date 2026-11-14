"""Keep the dinette area hook; surfaces owns the table and soft owns seating."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes

AREA = "dinette"


def build() -> AreaCubes:
    return AreaCubes()
