"""Build the camper bed bunk area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
FLOOR = kit.FLOOR
HW = kit.HW
REAR = kit.REAR
box = kit.box

AREA = "bed_bunk"


def build() -> AreaCubes:
    body = []

    # Bed at the rear left: two cells (build cell x = -1, z = +2 and +3), 9 px high like the
    # future parked bed block (the driving model is visual only).
    BED = (-HW + 1, -8, 24, REAR - 1)  # x0, x1, z0, z1
    BUNK_DECK_BOTTOM = FLOOR + 16
    BUNK_DECK_TOP = BUNK_DECK_BOTTOM + 1
    body.append(box(BED[0], FLOOR, BED[2], BED[1], FLOOR + 3, BED[3], "wood"))
    bunk = [
        box(BED[0], BUNK_DECK_BOTTOM, BED[2], BED[1], BUNK_DECK_TOP, BED[3], "wood"),
        *[box(BED[1] - 1.25, FLOOR, z, BED[1], BUNK_DECK_TOP, z + 1.25, "wood")
          for z in (BED[2], BED[3] - 1.25)],
    ]
    return AreaCubes({'body': body, 'bunk': bunk})
