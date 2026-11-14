"""Build the camper cab area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
FLOOR = kit.FLOOR
FRONT = kit.FRONT
HW = kit.HW
box = kit.box

AREA = "cab"


def build() -> AreaCubes:
    body = []
    DASH_FACE = FRONT + 8
    body.extend(load_tool("camper_dash").build_dash(kit.REGISTRY)["body"])
    # Pedals in the driver's footwell
    body.append(box(12.5, FLOOR + 1, DASH_FACE + 0.5, 15, FLOOR + 3.5, DASH_FACE + 1, "black", [-25, 0, 0], [0, FLOOR + 1, DASH_FACE + 1]))
    body.append(box(8.5, FLOOR + 0.5, DASH_FACE + 1, 10.5, FLOOR + 5, DASH_FACE + 1.4, "black", [-30, 0, 0], [0, FLOOR + 0.5, DASH_FACE + 1.2]))
    # Ivory door trim with an armrest on both cab walls
    for sx in (1, -1):
        x_in = sx * (HW - 1.2)
        body.append(box(x_in, FLOOR, -53, x_in - sx * 0.3, 27, -41, "ivory"))
        body.append(box(x_in, 22, -51, x_in - sx * 1.6, 23.4, -43, "ivory"))

    return AreaCubes({'body': body})
