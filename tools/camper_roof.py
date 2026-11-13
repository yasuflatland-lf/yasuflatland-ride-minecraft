"""Build the camper roof area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
ATLAS = kit.ATLAS
AreaCubes = kit.AreaCubes
BOLT_REGION = kit.BOLT_REGION
HW = kit.HW
REAR_OUT = kit.REAR_OUT
ROOF = kit.ROOF
TOP_FRONT = kit.TOP_FRONT
box = kit.box
disc = kit.disc

AREA = "roof"


def build() -> AreaCubes:
    body = []
    # --- Roof -------------------------------------------------------------------
    def ac_unit(z0, z1):
        out = [box(-7, ROOF, z0, 7, ROOF + 3.5, z1, "panel"), box(-6.5, ROOF + 3.5, z0 + 0.5, 6.5, ROOF + 4, z1 - 0.5, "panel")]
        for z in range(int(z0) + 2, int(z1) - 2, 2):
            out.append(box(7, ROOF + 0.8, z, 7.2, ROOF + 2.8, z + 1, "black"))
        return out


    body += ac_unit(-34, -20)
    body += ac_unit(30, 44)
    body.append(box(-4, ROOF, -2, 4, ROOF + 1.6, 6, "panel"))  # small vent
    body.append(box(-3.5, ROOF + 1.6, -1.5, 3.5, ROOF + 2, 5.5, "white"))
    # Round black fan vent near the front left
    body.append(box(-18, ROOF, -48, -10, ROOF + 2.6, -40, "black"))
    for z in (-46, -42):
        body += disc("z", -14, ROOF + 1.3, z, 1.2, 0.2, "grille", steps=(0, 45))
    for sx in (-1, 1):
        rail = box(sx * HW, ROOF - 0.6, TOP_FRONT, sx * (HW + 0.4), ROOF, REAR_OUT, "aluminium")
        # mirror_x swaps east and west with the rail position.
        outer_face = "west" if sx < 0 else "east"
        rail["uv"][outer_face] = ATLAS.face(BOLT_REGION, uv_size=(rail["size"][2], 1))
        body.append(rail)
    # Roof rack around the rear air conditioner
    RACK = (22, 55)
    for sx in (1, -1):
        body.append(box(sx * 19, ROOF + 3, RACK[0], sx * 20, ROOF + 4, RACK[1], "chrome"))
        for z in range(RACK[0], RACK[1] + 1, 8):
            body.append(box(sx * 19, ROOF, z, sx * 20, ROOF + 3, z + 1, "chrome"))
    for z in RACK:
        body.append(box(-20, ROOF + 3, z, 20, ROOF + 4, z + 1, "chrome"))
    for x in range(-17, 18, 4):
        body.append(box(x, ROOF + 0.5, RACK[0], x + 0.6, ROOF + 1, RACK[1], "slat"))


    return AreaCubes({'body': body})
