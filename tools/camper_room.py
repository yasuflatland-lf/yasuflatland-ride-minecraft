"""Build the camper room area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
CEIL = kit.CEIL
FLOOR = kit.FLOOR
FURN_X = kit.FURN_X
box = kit.box

AREA = "room"


CABINET_DOOR_X = (9.5, 10)
CABINET_SINK_HINGE = [CABINET_DOOR_X[0], 0, 9]
CABINET_STOVE_HINGE = [CABINET_DOOR_X[0], 0, 39]


def build() -> AreaCubes:
    body = []
    COUNTER_Z = (8.5, 39.5)
    body.append(box(FURN_X[0], FLOOR, COUNTER_Z[0], 22.8, 29, COUNTER_Z[1], "wood"))
    body.append(box(8.7, FLOOR + 1, 9.5, FURN_X[0], 28, 23.5, "avocado"))
    body.append(box(8.3, 25, 22.2, 8.7, 26.5, 23, "chrome"))

    # Wall cabinet over the counter, up at the ceiling (cells z = -1 and -2; ADR 0103), with two
    # compartments behind two doors that open on their own (ADR 0114). It hangs from the ceiling
    # down to y 50, clear of the counter window's top at 49 (ADR 0113), so its compartment floor
    # tops at 51, 3 px above the ceiling layer's bottom, and its compartments are 9 px high inside:
    # enough for the tallest standing item, 8 px. The compartment over the sink spans the sink
    # cell and the one over the stove the stove cell, split at the cell edge z 24, so each one's
    # middle is its cell's middle, where the decor spots are.
    CABINET_Y = (CEIL - 11, CEIL)
    CABINET_Z = COUNTER_Z
    CABINET_X = (10, 22.8)  # behind the doors, up to the wall's inner face
    CABINET_SHELF = CABINET_Y[0] + 1
    body.append(box(CABINET_X[0], CABINET_Y[0], CABINET_Z[0], CABINET_X[1], CABINET_SHELF, CABINET_Z[1], "wood"))  # floor
    body.append(box(CABINET_X[0], CABINET_Y[1] - 1, CABINET_Z[0], CABINET_X[1], CABINET_Y[1], CABINET_Z[1], "wood"))  # top
    body.append(box(CABINET_X[1] - 0.5, CABINET_SHELF, CABINET_Z[0], CABINET_X[1], CABINET_Y[1] - 1, CABINET_Z[1], "brown"))  # back
    for z0, z1 in ((CABINET_Z[0], CABINET_Z[0] + 0.5), (23.75, 24.25), (CABINET_Z[1] - 0.5, CABINET_Z[1])):
        body.append(box(CABINET_X[0], CABINET_SHELF, z0, CABINET_X[1] - 0.5, CABINET_Y[1] - 1, z1, "wood"))  # ends and divider
    CABINET_DOOR_Y = (CABINET_Y[0] + 0.5, CABINET_Y[1] - 0.5)


    def cabinet_door(z0, z1, handle_z):
        """One door on the aisle face of the cabinet, with a chrome pull low on its free edge,
        where a hand reaches up to it."""
        out = [box(*(CABINET_DOOR_X[0], CABINET_DOOR_Y[0], z0), *(CABINET_DOOR_X[1], CABINET_DOOR_Y[1], z1), "avocado")]
        out.append(box(CABINET_DOOR_X[0] - 0.3, CABINET_DOOR_Y[0] + 0.5, handle_z, CABINET_DOOR_X[0], CABINET_DOOR_Y[0] + 2, handle_z + 0.7, "chrome"))
        return out


    # Each door is its own bone, hinged at the cabinet's outer end on the aisle face, so the two
    # open doors stand at the ends and leave the compartments' fronts free; they stay closed here.
    cabinet_sink_door = cabinet_door(9, 23.6, 22.3)
    cabinet_stove_door = cabinet_door(24.4, 39, 24.9)

    return AreaCubes({'body': body, 'cabinet_sink_door': cabinet_sink_door, 'cabinet_stove_door': cabinet_stove_door})
