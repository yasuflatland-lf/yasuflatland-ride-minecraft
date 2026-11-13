"""Build the camper fridge area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
FLOOR = kit.FLOOR
FURN_X = kit.FURN_X
box = kit.box

AREA = "fridge"


FRIDGE_Z = (-23.5, -8.5)
FRIDGE_BEVEL = 0.4  # the step that rounds each outer edge
fz0, fz1 = FRIDGE_Z
fx0, fb = FURN_X[0], FRIDGE_BEVEL
FRIDGE_DOOR_X = (8.5, fx0)  # the door slab; its face plate stands proud of it by FRIDGE_FACE
FRIDGE_FACE = 0.2
# The hinge side starts 0.2 px in from the front end, so the open door's face plate and handles,
# turned to face the cab, stay in the fridge's cell row.
FRIDGE_DOOR_Z = (fz0 + 0.2, fz1 - 0.1)
FRIDGE_HINGE = [FRIDGE_DOOR_X[0] - FRIDGE_FACE, 0, FRIDGE_DOOR_Z[0]]


def build() -> AreaCubes:
    body = []
    # --- Right-hand furniture (ADR 0093) ----------------------------------------
    # Each decor slot height in src/domain/vehicle/kinds/camper/furniture.ts is the top of the
    # furniture at the middle of its cell; tests/packs/camper/room.test.ts checks them against this model.
    # Retro two-door fridge behind the driver (cell z = 1), at the size of the two-tier shelf it
    # replaced (ADR 0123): a cream body with softly rounded edges, a shorter top door over a taller
    # bottom door with a chrome seam strip between them, a chrome lever handle by each door's free
    # edge, and a thin chrome trim line across the top door. No brand name or logo. Its two
    # compartments are the shelf's two cells: the bottom one stands its items on the bottom panel,
    # 3 px into layer 1, and the top one on the divider, 4 px into layer 2, as the decor slots say.
    # The bottom panel is 3 px thick so it covers the front wheel arch's hump, which rises to y 18.4
    # in the fridge's back corner.
    FRIDGE_Y = (FLOOR, 49)
    FRIDGE_FLOOR_Y = FLOOR + 3  # the bottom panel's top
    FRIDGE_DIVIDER_Y = 36  # the divider's top, under the top door
    FRIDGE_PANEL_Y = FRIDGE_Y[1] - 1  # the top panel's underside
    FRIDGE_SIDE = 0.6  # the side walls' thickness
    FRIDGE_BACK_X = FURN_X[1] - 0.5  # the back wall's inner face
    fin0, fin1 = fz0 + FRIDGE_SIDE, fz1 - FRIDGE_SIDE  # the inside, between the side walls
    for z0, z1, inner in ((fz0, fin0, (fz0 + fb, fin0)), (fin1, fz1, (fin1, fz1 - fb))):
        body.append(box(fx0 + fb, FLOOR, z0, FURN_X[1], FRIDGE_Y[1] - fb, z1, "ivory"))  # side wall
        body.append(box(fx0 + fb, FRIDGE_Y[1] - fb, inner[0], FURN_X[1], FRIDGE_Y[1], inner[1], "ivory"))  # its rounded top edge
        body.append(box(fx0, FLOOR, inner[0], fx0 + fb, FRIDGE_Y[1] - fb, inner[1], "ivory"))  # its rounded front edge
    body.append(box(fx0 + fb, FRIDGE_PANEL_Y, fin0, FURN_X[1], FRIDGE_Y[1], fin1, "ivory"))  # top panel
    body.append(box(fx0, FRIDGE_PANEL_Y, fin0, fx0 + fb, FRIDGE_Y[1] - fb, fin1, "ivory"))  # its rounded front edge
    body.append(box(FRIDGE_BACK_X, FRIDGE_FLOOR_Y, fin0, FURN_X[1], FRIDGE_PANEL_Y, fin1, "white"))  # back liner
    body.append(box(fx0, FLOOR, fin0, FURN_X[1], FRIDGE_FLOOR_Y, fin1, "white"))  # bottom panel
    body.append(box(fx0, FRIDGE_DIVIDER_Y - 1, fin0, FRIDGE_BACK_X, FRIDGE_DIVIDER_Y, fin1, "white"))  # divider
    FRIDGE_SEAM_Y = (FRIDGE_DIVIDER_Y - 0.8, FRIDGE_DIVIDER_Y - 0.2)
    body.append(box(8.4, *(FRIDGE_SEAM_Y[0], fz0 + 0.3), fx0, *(FRIDGE_SEAM_Y[1], fz1 - 0.3), "chrome"))  # seam strip
    FRIDGE_HANDLE_Z = fz1 - 2.2  # by the free edge, toward the entry door


    def fridge_door(y0, y1, handle_y, trim_y=None):
        """One fridge door on the aisle face, its edges rounded by a face plate inset by
        FRIDGE_BEVEL, with a chrome lever handle by its free edge: a mount on the face and a bar
        standing off it. `trim_y` adds a thin chrome line across the door."""
        dz0, dz1 = FRIDGE_DOOR_Z
        x_face = FRIDGE_DOOR_X[0] - FRIDGE_FACE
        out = [box(FRIDGE_DOOR_X[0], y0, dz0, FRIDGE_DOOR_X[1], y1, dz1, "ivory")]
        out.append(box(x_face, y0 + fb, dz0 + fb, FRIDGE_DOOR_X[0], y1 - fb, dz1 - fb, "ivory"))
        out.append(box(x_face - 0.2, handle_y - 0.4, FRIDGE_HANDLE_Z - 0.5, x_face, handle_y + 3.4, FRIDGE_HANDLE_Z + 0.5, "chrome"))  # mount
        out.append(box(x_face - 0.7, handle_y, FRIDGE_HANDLE_Z - 0.3, x_face - 0.2, handle_y + 3, FRIDGE_HANDLE_Z + 0.3, "chrome"))  # lever
        if trim_y is not None:
            out.append(box(x_face - 0.1, trim_y, dz0 + 1, x_face, trim_y + 0.3, dz1 - 1, "chrome"))
        return out


    # Each door is its own bone, hinged at the fridge's front end on the aisle face, so an open
    # door stands across the aisle against the front seats' backs and leaves the way from the entry
    # door to the compartments free; they stay closed here (ADR 0123).
    fridge_bottom_door = fridge_door(FLOOR + 0.5, FRIDGE_SEAM_Y[0], 29)
    fridge_top_door = fridge_door(FRIDGE_SEAM_Y[1], FRIDGE_Y[1] - 0.4, 37.5, trim_y=45.5)

    return AreaCubes({'body': body, 'fridge_top_door': fridge_top_door, 'fridge_bottom_door': fridge_bottom_door})
