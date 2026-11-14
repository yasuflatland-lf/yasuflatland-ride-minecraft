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
    seat2 = [box(DIN_X[0], FLOOR, -23, DIN_X[1], FLOOR + 7, -10, "tweed"),
             box(DIN_X[0], FLOOR + 7, -24, DIN_X[1], FLOOR + 20, -21.5, "tweed")]
    seat3 = [box(DIN_X[0], FLOOR, 10, DIN_X[1], FLOOR + 7, 23, "tweed"),
             box(DIN_X[0], FLOOR + 7, 21.5, DIN_X[1], FLOOR + 20, 24, "tweed")]

    return AreaCubes({'body': body, 'seat_2': seat2, 'seat_3': seat3})
