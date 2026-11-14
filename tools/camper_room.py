"""Build the hollow lower kitchen carcass."""

from tool_loader import load_tool
kit = load_tool("camper_kit")
AREA = "room"


def build() -> kit.AreaCubes:
    carcass = kit.box(kit.FURN_X[0], kit.FLOOR, 8.5, 22.8, 29, 39.5, "wood")
    return kit.AreaCubes(body=[carcass])
