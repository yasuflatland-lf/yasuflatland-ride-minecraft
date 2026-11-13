"""Build the camper door area."""

import math
from tool_loader import load_tool

kit = load_tool("camper_kit")
ATLAS = kit.ATLAS
AreaCubes = kit.AreaCubes
BAND_Y = kit.BAND_Y
DOOR = kit.DOOR
DOOR_HEAD_REGION = kit.DOOR_HEAD_REGION
DOOR_HINGE_REGION = kit.DOOR_HINGE_REGION
DOOR_LATCH_REGION = kit.DOOR_LATCH_REGION
HW = kit.HW
STRIPE_Y = kit.STRIPE_Y
WIN_Y = kit.WIN_Y
box = kit.box
rib_sides = kit.rib_sides

AREA = "door"


DZ0, DZ1, DY0, DY1 = DOOR
DOOR_HINGE = [HW, 0, DZ0]


def build() -> AreaCubes:
    body = []
    # Entry door stays closed until the later parking work; a fold-out step stays below it.
    DOOR_HANDLE_Y = (STRIPE_Y[0] - 1.5, STRIPE_Y[0] - 0.5)  # half a pixel below the stripe (ADR 0145)
    door = rib_sides([box(HW - 1, DY0, DZ0 + 0.1, HW, DY1, DZ1 - 0.1, "white")])
    # The door window lines up with the side windows, as on the close-up photo.
    DW0, DW1 = DZ0 + 3, DZ1 - 3
    door.append(box(HW, WIN_Y[0], DW0, HW + 0.15, WIN_Y[1], DW1, "glass"))
    for fz0, fz1, fy0, fy1, hardware in ((DW0 - 0.6, DW1 + 0.6, WIN_Y[0] - 0.6, WIN_Y[0], None),
                                         (DW0 - 0.6, DW1 + 0.6, WIN_Y[1], WIN_Y[1] + 0.6, DOOR_HEAD_REGION),
                                         (DW0 - 0.6, DW0, *WIN_Y, DOOR_HINGE_REGION),
                                         (DW1, DW1 + 0.6, *WIN_Y, DOOR_LATCH_REGION)):
        door_frame = box(HW, fy0, fz0, HW + 0.18, fy1, fz1, "aluminium")
        if hardware is not None:
            # The build's +x face is named east; mirror_x swaps it to the outward west face.
            door_frame["uv"]["east"] = ATLAS.face(hardware)
        door.append(door_frame)
    door.append(box(HW, STRIPE_Y[0], DZ0 + 0.1, HW + 0.12, STRIPE_Y[1], DZ1 - 0.1, "stripe"))
    door.append(box(HW, BAND_Y[0], DZ0 + 0.1, HW + 0.1, BAND_Y[1], DZ1 - 0.1, "khaki"))
    door.append(box(HW, DY0, DZ0 + 0.1, HW + 0.12, 15, DZ1 - 0.1, "tan"))
    door.append(box(HW, DOOR_HANDLE_Y[0], DZ1 - 2.5, HW + 0.6, DOOR_HANDLE_Y[1], DZ1 - 1, "chrome"))  # handle outside
    door.append(box(HW - 1.6, DOOR_HANDLE_Y[0], DZ1 - 2.5, HW - 1, DOOR_HANDLE_Y[1], DZ1 - 1, "chrome"))  # handle inside
    # The latch plate at the door's rear edge: a square of aluminium with a dark recess behind the handle.
    door.append(box(HW + 0.12, 27.7, DZ1 - 2.5, HW + 0.3, 30.4, DZ1 - 0.15, "aluminium"))
    door.append(box(HW + 0.3, 27.9, DZ1 - 2.2, HW + 0.32, 29.7, DZ1 - 1.2, "grille"))
    for rivet_z in (DZ1 - 2.25, DZ1 - 0.4):
        for rivet_y in (27.95, 30.15):
            door.append(box(HW + 0.3, rivet_y - 0.09, rivet_z - 0.09, HW + 0.33, rivet_y + 0.09, rivet_z + 0.09, "slat"))
    # The photo's window has rounded corners; level rows fill them inside the square frame.
    WINDOW_CORNER = 1.0
    for i in range(4):
        dy = (i + 0.5) * WINDOW_CORNER / 4
        inset = WINDOW_CORNER - math.sqrt(WINDOW_CORNER ** 2 - (WINDOW_CORNER - dy) ** 2)
        for row_y in (WIN_Y[0] + i * WINDOW_CORNER / 4, WIN_Y[1] - (i + 1) * WINDOW_CORNER / 4):
            for z0, z1 in ((DW0, DW0 + inset), (DW1 - inset, DW1)):
                door.append(box(HW, row_y, z0, HW + 0.18, row_y + WINDOW_CORNER / 4, z1, "aluminium"))


    def door_rivets(y, z0, z1, x, count):
        return [box(x, y - 0.09, z - 0.09, x + 0.03, y + 0.09, z + 0.09, "slat")
                for z in (z0 + (z1 - z0) * (i + 0.5) / count for i in range(count))]


    def door_trim():
        """The fixed aluminium door surround, measured on the owner's photo at 16.8 px per px of width
        and 19.4 per px of height: each strip has a bright edge and a dark seam so it reads as metal."""
        FACE = HW + 0.14  # clears the door's painted skins, whose edges the strips overlap
        BOTTOM_Y, TOP_Y = 8.7, 54.6
        REAR_Z, HINGE_Z = DZ1 + 0.8, DZ0 - 1.8
        parts = []
        # Latch side: one strip whose lip covers the gap around the door.
        parts.append(box(FACE, BOTTOM_Y, DZ1 - 0.15, FACE + 0.14, TOP_Y, REAR_Z, "aluminium"))
        parts.append(box(FACE + 0.14, BOTTOM_Y, DZ1 - 0.15, FACE + 0.17, TOP_Y, DZ1 + 0.05, "chrome"))
        # Hinge side: two strips with a dark seam between them, as on the photo.
        parts.append(box(FACE, BOTTOM_Y, DZ0 - 0.85, FACE + 0.14, TOP_Y, DZ0 + 0.15, "aluminium"))
        parts.append(box(HW, BOTTOM_Y, DZ0 - 0.95, FACE + 0.06, TOP_Y, DZ0 - 0.85, "grille"))
        parts.append(box(HW, BOTTOM_Y, HINGE_Z, FACE + 0.18, TOP_Y, DZ0 - 0.95, "aluminium"))
        parts.append(box(FACE + 0.18, BOTTOM_Y, HINGE_Z, FACE + 0.21, TOP_Y, HINGE_Z + 0.15, "chrome"))
        # Threshold plate under the door, riveted along its length.
        parts.append(box(FACE, 9.2, DZ0 + 0.15, FACE + 0.12, 10.7, DZ1 - 0.15, "aluminium"))
        parts.append(box(FACE, BOTTOM_Y, DZ0 + 0.15, FACE + 0.16, 9.2, DZ1 - 0.15, "chrome"))
        parts += door_rivets(9.95, DZ0 + 0.15, DZ1 - 0.15, FACE + 0.12, 8)
        # Head: an inner rail over the door and a riveted drip cap past both jambs, its top standing out.
        parts.append(box(FACE, DY1 - 0.05, DZ0 + 0.15, FACE + 0.16, TOP_Y, DZ1 - 0.15, "aluminium"))
        parts.append(box(HW, TOP_Y, HINGE_Z - 0.2, FACE + 0.3, TOP_Y + 0.9, REAR_Z + 0.2, "aluminium"))
        parts.append(box(HW, TOP_Y + 0.9, HINGE_Z - 0.2, FACE + 0.5, TOP_Y + 1.5, REAR_Z + 0.2, "chrome"))
        parts += door_rivets(TOP_Y + 1.2, HINGE_Z, REAR_Z, FACE + 0.5, 10)
        # Three hinges: a bright leaf on the inner strip and dark knuckle ends on the seam.
        for y in (13.3, 32.1, 51.5):
            parts.append(box(FACE + 0.14, y - 1.1, DZ0 - 0.8, FACE + 0.22, y + 1.1, DZ0 + 0.1, "chrome"))
            for knuckle in (y - 1.4, y + 0.9):
                parts.append(box(HW, knuckle, DZ0 - 1.25, FACE + 0.3, knuckle + 0.5, DZ0 - 0.65, "grille"))
        # The small catch low on the latch side.
        parts.append(box(FACE + 0.14, 16.65, DZ1 + 0.1, FACE + 0.26, 18.95, DZ1 + 0.6, "chrome"))
        return parts


    def fold_out_step():
        """Thin black panels like a dustpan: a tread on two slanted side plates, open at the back as on
        the photo, with a thin rod between the plates under the body."""
        REACH = 6
        TREAD_Y, TOP_Y = 3.5, 8
        TREAD_Z0, TREAD_Z1 = DZ0 + 1, DZ1 - 1
        SLANT = 0.2  # both side plates move toward the rear going up, 0.85 px over their height on the photo
        THICK, ROW = 0.3, 0.25
        parts = [box(HW + 0.2, TREAD_Y, TREAD_Z0, HW + REACH, TREAD_Y + THICK, TREAD_Z1, "black")]
        # A short front lip keeps the tread from reading as a flat sheet.
        parts.append(box(HW + REACH - THICK, TREAD_Y + THICK, TREAD_Z0, HW + REACH, TREAD_Y + 0.8, TREAD_Z1, "black"))
        for i in range(4):
            x = HW + 1.2 + i
            parts.append(box(x, TREAD_Y + THICK, TREAD_Z0 + 1, x + 0.4, TREAD_Y + THICK + 0.04, TREAD_Z1 - 1, "grille"))
        rows = round((TOP_Y - TREAD_Y - THICK) / ROW)
        for i in range(rows):
            y0 = TREAD_Y + THICK + i * ROW
            dz = SLANT * (y0 + ROW / 2 - TREAD_Y)
            reach = REACH * (1 - (i + 0.5) / rows)
            for z in (TREAD_Z0 + dz, TREAD_Z1 - THICK + dz):
                parts.append(box(HW + 0.2, y0, z, HW + max(reach, 0.6), y0 + ROW, z + THICK, "black"))
        parts.append(box(HW + 0.5, 7.1, TREAD_Z0 + 0.6, HW + 0.7, 7.3, TREAD_Z1 + 0.6, "slat"))
        return parts


    body += door_trim() + fold_out_step()


    return AreaCubes({'body': body, 'door_entry': door})
