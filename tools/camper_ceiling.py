"""Build the camper ceiling area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
CEIL = kit.CEIL
LAMP_GROUPS = kit.LAMP_GROUPS
box = kit.box

AREA = "ceiling"


def build() -> AreaCubes:
    body = []
    # Ceiling hook above the dinette table (cell x = 1, z = 0, layer 2): a cord and a hook run from
    # the ceiling plate down to the top of that cell, where a hanging decor item's top sits. The
    # block model stays inside the cell, so the model draws the part above it (ADR 0099).
    HOOK_CELL_TOP = 3 * 16  # the top of layer 2
    body.append(box(-17, CEIL - 0.4, -1, -15, CEIL - 0.2, 1, "chrome"))  # base plate
    body.append(box(-16.2, HOOK_CELL_TOP + 1.5, -0.2, -15.8, CEIL - 0.4, 0.2, "ivory"))  # cord
    body.append(box(-16.5, HOOK_CELL_TOP, -0.5, -15.5, HOOK_CELL_TOP + 1.5, 0.5, "chrome"))  # hook
    # Two ceiling lights over the aisle (cell x = 0, layer 2 under them), at local cell z 1 and -3:
    # model z is -16 times the cell z. A chrome rim holds each lens to the ceiling liner. Both are
    # their own bone, so the render controller can light the lenses; the rim is opaque, so the
    # emissive material leaves it unlit (ADR 0115).
    CEILING_LIGHT_ZS = (-16, 48)
    CEILING_LIGHT_HALF = 4
    ceiling_lights = []
    dome_swatch = LAMP_GROUPS["ceiling_lights"][0]
    for zc in CEILING_LIGHT_ZS:
        h = CEILING_LIGHT_HALF
        ceiling_lights.append(box(-h - 0.5, CEIL - 0.6, zc - h - 0.5, h + 0.5, CEIL - 0.2, zc + h + 0.5, "chrome"))
        ceiling_lights.append(box(-h, CEIL - 1.4, zc - h, h, CEIL - 0.6, zc + h, dome_swatch))

    return AreaCubes({'body': body, 'ceiling_lights': ceiling_lights})
