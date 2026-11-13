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
    BUNK_TOP = BUNK_DECK_BOTTOM + 5.5
    body.append(box(BED[0], FLOOR, BED[2], BED[1], FLOOR + 3, BED[3], "wood"))
    body.append(box(BED[0] + 0.3, FLOOR + 3, BED[2] + 0.3, BED[1] - 0.3, FLOOR + 7.5, BED[3] - 0.3, "ivory"))
    body.append(box(BED[0] + 0.2, FLOOR + 7.5, BED[2] + 0.2, BED[1] - 0.2, FLOOR + 9, BED[3] - 8, "curtain"))
    body.append(box(BED[0] + 0.1, FLOOR + 5, BED[2] + 0.1, BED[1] - 0.1, FLOOR + 7.5, BED[2] + 0.4, "curtain"))  # blanket over the foot
    body.append(box(BED[0] + 0.2, FLOOR + 8.6, BED[3] - 9, BED[1] - 0.2, FLOOR + 9.4, BED[3] - 7.5, "ivory"))  # folded sheet
    body.append(box(BED[0] + 2, FLOOR + 7.5, BED[3] - 6, BED[1] - 2, FLOOR + 10, BED[3] - 1.5, "white"))  # pillow

    bunk = [
        box(BED[0], BUNK_DECK_BOTTOM, BED[2], BED[1], BUNK_DECK_TOP, BED[3], "wood"),
        box(BED[0] + 0.3, BUNK_DECK_TOP, BED[2] + 0.3, BED[1] - 0.3, BUNK_TOP - 2, BED[3] - 0.3, "ivory"),
        # Starts 0.5 px off the wall so it stays clear of the window curtains (0.3 px thick).
        box(BED[0] + 0.5, BUNK_TOP - 2, BED[2] + 0.2, BED[1] - 0.2, BUNK_TOP - 1, BED[3] - 8, "curtain"),
        box(BED[0] + 2, BUNK_TOP - 2, BED[3] - 6, BED[1] - 2, BUNK_TOP, BED[3] - 1.5, "white"),
        *[box(BED[1] - 1.25, FLOOR, z, BED[1], BUNK_DECK_TOP, z + 1.25, "wood")
          for z in (BED[2], BED[3] - 1.25)],
    ]
    # camper_bunk.block.json sizes its selection box to BUNK_TOP - BUNK_DECK_BOTTOM, so it must be the real top.
    assert max(c["origin"][1] + c["size"][1] for c in bunk) == BUNK_TOP


    return AreaCubes({'body': body, 'bunk': bunk})
