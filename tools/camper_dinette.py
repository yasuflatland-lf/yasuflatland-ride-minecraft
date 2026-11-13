"""Build the camper dinette area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
FLOOR = kit.FLOOR
HW = kit.HW
box = kit.box

AREA = "dinette"


def build() -> AreaCubes:
    body = []
    # Facing dinette on the left behind the passenger: seat 2 faces the rear, seat 3 forward,
    # with the table between them in the middle cell (seats 2 and 3 of minecraft:rideable).
    DIN_X = (-HW + 1, -8)
    body.append(box(DIN_X[0], FLOOR + 11, -6, -9, FLOOR + 12, 6, "wood"))  # table
    body.append(box(-15, FLOOR, -1, -13, FLOOR + 11, 1, "chrome"))

    return AreaCubes({'body': body})
