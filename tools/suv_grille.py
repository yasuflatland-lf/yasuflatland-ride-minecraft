"""SUV eight-slot grille."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box
SLOTS, SLOT_W, BAR_W = 8, 1.1, 0.6
assert SLOTS == 8, "ADR 0009: the grille has eight slots"


def grille_cubes():
    result = []
    # Vertical-slot grille: body-colored bars over a black back panel, so the gaps look like black slots
    grille_w = SLOTS * SLOT_W + (SLOTS + 1) * BAR_W
    gx0 = -grille_w / 2
    result += [
        box(gx0, DIMS.front_bumper.grille_bottom_y + 0.5, DIMS.hood.front_z, -gx0, DIMS.hood.top_y - 2.5, DIMS.hood.front_z + 0.2, "grille"),  # back panel
        box(gx0 - 0.5, DIMS.hood.top_y - 2.5, DIMS.hood.front_z, -gx0 + 0.5, DIMS.hood.top_y, DIMS.hood.front_z + 0.6, "body"),  # top frame
        box(gx0 - 0.5, DIMS.front_bumper.grille_bottom_y, DIMS.hood.front_z, -gx0 + 0.5, DIMS.front_bumper.grille_bottom_y + 0.5, DIMS.hood.front_z + 0.6, "body"),  # bottom frame
    ]
    for i in range(SLOTS + 1):
        x = gx0 + i * (SLOT_W + BAR_W)
        result.append(box(x, DIMS.front_bumper.grille_bottom_y + 0.5, DIMS.hood.front_z + 0.2, x + BAR_W, DIMS.hood.top_y - 2.5, DIMS.hood.front_z + 0.6, "body"))
    return result
