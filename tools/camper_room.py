"""Build the camper room area."""

import math
from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
CEIL = kit.CEIL
FLOOR = kit.FLOOR
FURN_X = kit.FURN_X
STEPS_16 = kit.STEPS_16
STEPS_8 = kit.STEPS_8
box = kit.box
disc = kit.disc

AREA = "room"


CABINET_DOOR_X = (9.5, 10)
CABINET_SINK_HINGE = [CABINET_DOOR_X[0], 0, 9]
CABINET_STOVE_HINGE = [CABINET_DOOR_X[0], 0, 39]


def build() -> AreaCubes:
    body = []
    # Counter behind the door: the sink in cell z = -1, the stove in cell z = -2 (ADR 0100), tops
    # at 30. The sink cell's middle stays flat at 30 for its decor slot, so the sink keeps off it;
    # the stove's slot stands on its one burner instead (ADR 0112).
    COUNTER_Z = (8.5, 39.5)
    STOVE_Z = (24, COUNTER_Z[1])
    body.append(box(FURN_X[0], FLOOR, COUNTER_Z[0], 22.8, 29, COUNTER_Z[1], "wood"))
    body.append(box(8.5, 29, COUNTER_Z[0], 22.8, 30, STOVE_Z[0], "harvest"))  # counter top
    body.append(box(8.7, FLOOR + 1, 9.5, FURN_X[0], 28, 23.5, "avocado"))  # cupboard door
    body.append(box(8.3, 25, 22.2, 8.7, 26.5, 23, "chrome"))
    body.append(box(11, 30, 17.5, 20, 30.15, 23, "steel"))  # sink, behind the slot
    body.append(box(15, 30.15, 19.8, 16, 30.2, 20.8, "black"))  # drain
    body.append(box(20.5, 30, 19.5, 21.5, 34, 20.5, "chrome"))  # tap
    body.append(box(17.5, 33, 19.5, 21.5, 34, 20.5, "chrome"))  # spout


    # One burner in the middle of the cooktop (16, 32), the stove slot's point, with the size the
    # four burners of ADR 0107 had, so the decor item stands on its grate (ADR 0112).
    BURNER_SCALE = 0.6  # burner reach 2.85 * 0.6 = 1.71 px
    GRATE_R = 2.7 * BURNER_SCALE  # half the burner grate's outer width


    def burner(cx, cz, turn):
        """One gas burner: drip bowl, dark gap, head with its port band and top disc, a black grate
        ring, and six raised prongs turned by `turn` degrees. Widths scale by BURNER_SCALE, while
        heights and bar thickness stay."""
        k = BURNER_SCALE
        body.extend(disc("y", cx, 30, cz, 2.45 * k, 0.08, "panel", STEPS_16))  # drip bowl
        body.extend(disc("y", cx, 30.08, cz, 1.3 * k, 0.06, "grille", STEPS_16))  # gap around the head
        body.extend(disc("y", cx, 30.14, cz, 0.85 * k, 0.56, "hub", STEPS_8))  # head
        body.extend(disc("y", cx, 30.45, cz, 0.9 * k, 0.08, "grille", STEPS_8))  # port band
        body.extend(disc("y", cx, 30.7, cz, 0.5 * k, 0.1, "steel", STEPS_8))  # top disc
        side, t = 2.3 * k, 0.3
        for dx, dz in ((-1, 0), (1, 0), (0, -1), (0, 1)):  # grate ring
            mx, mz = cx + dx * (GRATE_R - t / 2), cz + dz * (GRATE_R - t / 2)
            hx, hz = (t / 2, side / 2) if dx else (side / 2, t / 2)
            body.append(box(mx - hx, 30.08, mz - hz, mx + hx, 30.4, mz + hz, "black"))
        d = 2.6 * k / math.sqrt(2)
        for dx, dz in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            mx, mz = cx + dx * d, cz + dz * d
            body.append(box(mx - t / 2, 30.08, mz - side / 2, mx + t / 2, 30.4, mz + side / 2, "black", [0, -dx * dz * 45, 0], [mx, 30.08, mz]))
        pivot = [cx, 30.4, cz]
        for n in range(6):  # prongs, laid out toward the aisle and turned into place
            rotation = [0, turn + 60 * n, 0]
            body.append(box(cx - 2.85 * k, 30.4, cz - 0.15, cx - 1.0 * k, 30.7, cz + 0.15, "black", rotation, pivot))
            body.append(box(cx - 2.85 * k, 30.4, cz - 0.15, cx - 2.45 * k, 30.95, cz + 0.15, "black", rotation, pivot))


    # Stove (ADR 0100): the sink side is z 24, the far side z 39.5, the knobs face the aisle.
    body.append(box(8.5, 29, STOVE_Z[0], 22.8, 30, STOVE_Z[1], "steel"))  # cooktop plate
    body.append(box(8.3, 29.2, 24.2, 8.8, 30.2, 39.3, "chrome"))  # rolled front lip
    body.append(box(8.8, 30, 39.1, 22.8, 30.3, 39.5, "steel"))  # far-side flange
    body.append(box(8.8, 29.9, 24, 22.8, 30.2, 24.3, "chrome"))  # sink-side trim
    body.append(box(21.7, 30, 31.6, 22.4, 30.4, 39.1, "steel"))  # rear strip, plain half
    body.append(box(21.7, 29.95, 24.3, 22.4, 30.35, 31.6, "grille"))  # rear vent band
    for k in range(12):
        z = 24.7 + 0.55 * k
        body.append(box(21.8, 30.35, z, 22.3, 30.38, z + 0.25, "black"))
    body.append(box(22.4, 30, STOVE_Z[0], 22.8, 31, STOVE_Z[1], "ivory"))  # ledge at the wall
    burner(16, 32, 0)
    # Control panel leaning back 20 degrees with one knob in its middle, in line with the one burner
    # (ADR 0112).
    # Every cube stays at x 8 or more before and after the lean, out of the aisle.
    LEAN = ([0, 0, -20], [8.5, 26.6, 31.75])  # about its lower front edge, top toward the wall
    body.append(box(8.5, 26.6, 24.2, 8.8, 29.2, 39.3, "harvest", *LEAN))
    for y in (27.4, 28.4):  # woodgrain lines
        body.append(box(8.48, y, 24.2, 8.5, y + 0.1, 39.3, "wood", *LEAN))
    KNOB_Y = 27.9


    def knob_octagon(x0, x1, cz, half, color):
        """A knob part as an octagon about its own x axis, `half` from its center to each flat: a
        cross of two bars and the same cross turned 45 degrees. The turned cross pivots on the knob
        axis, so the sign of the game's x turn does not matter; it is moved by the gap between
        turning 20 degrees about that pivot and about the panel's lean pivot, so it leans with the
        rest of the panel (cube turns apply x before z)."""
        rotation, pivot = LEAN
        side = half * math.tan(math.pi / 8)
        s, c = math.sin(math.radians(rotation[2])), math.cos(math.radians(rotation[2]))
        up = KNOB_Y - pivot[1]  # the knob axis above the lean pivot
        dx, dy = -up * s, up * c - up
        axis = [pivot[0] + dx, KNOB_Y + dy, cz]
        for hy, hz in ((half, side), (side, half)):
            body.append(box(x0, KNOB_Y - hy, cz - hz, x1, KNOB_Y + hy, cz + hz, color, *LEAN))
            body.append(box(x0 + dx, axis[1] - hy, cz - hz, x1 + dx, axis[1] + hy, cz + hz, color, [45, 0, rotation[2]], axis))


    for z in (LEAN[1][2],):
        knob_octagon(8.07, 8.5, z, 0.75, "black")
        knob_octagon(8.4, 8.5, z, 0.85, "chrome")  # skirt
        knob_octagon(8.02, 8.07, z, 0.5, "chrome")  # face cap
        body.append(box(8.0, 27.85, z - 0.45, 8.02, 27.95, z + 0.45, "black", *LEAN))  # pointer
    body.append(box(8.45, 26.3, 24.2, 9.0, 26.6, 39.3, "chrome"))  # strip under the panel
    # Oven: a chrome bar across the top of a brushed door in a stainless frame.
    body.append(box(8.7, 26.1, 24.5, 9.0, 26.3, 39.0, "brown"))  # shadow line
    body.append(box(8.1, 25.3, 25.0, 8.45, 25.8, 38.5, "chrome"))  # handle bar
    for z in (25.3, 37.7):
        body.append(box(8.45, 25.4, z, 8.7, 25.7, z + 0.5, "chrome"))
    body.append(box(8.6, 17, 24.5, 9.0, 26.1, 39.0, "steel"))  # door frame
    body.append(box(8.5, 17.8, 25.5, 8.6, 24.8, 38.0, "chrome"))  # door face
    body.append(box(8.9, FLOOR, 24.5, 9.0, FLOOR + 1, 39.0, "black"))  # toe kick
    for z0, z1 in ((24.0, 24.4), (39.1, 39.5)):  # side trims down the range front
        body.append(box(8.5, FLOOR + 0.5, z0, 9.0, 29, z1, "steel"))
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
