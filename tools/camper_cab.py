"""Build the camper cab area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
FLOOR = kit.FLOOR
FRONT = kit.FRONT
HW = kit.HW
box = kit.box

AREA = "cab"


# The front cushions sit 0.4 blocks above where they started, with minecraft:rideable's
# front seats at 1.5, so a seated player's eyes clear the windshield's lower frame (36).
FRONT_SEAT_RISE = 6.4


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




    def bucket_seat(x0, x1):
        """A green tweed bucket seat with horizontal pleats and lighter piping."""
        r = FRONT_SEAT_RISE
        out = [box(x0 + 1, FLOOR, -39, x1 - 1, 18 + r, -30, "black")]  # pedestal
        out.append(box(x0, 18 + r, -41, x1, 21.5 + r, -29, "tweed"))
        for z in [-40 + i * 1.4 for i in range(8)]:
            out.append(box(x0 + 0.6, 21.5 + r, z, x1 - 0.6, 21.7 + r, z + 0.4, "tweed_line"))
        out.append(box(x0 - 0.2, 21.2 + r, -41.2, x1 + 0.2, 21.8 + r, -40.8, "piping"))
        pivot = [0, 21.5 + r, -29.5]
        lean = [-12, 0, 0]
        out.append(box(x0, 21.5 + r, -30, x1, 38 + r, -28, "tweed", lean, pivot))
        for y in [23 + r + i * 1.5 for i in range(10)]:
            out.append(box(x0 + 0.6, y, -30.2, x1 - 0.6, y + 0.5, -30, "tweed_line", lean, pivot))
        out.append(box(x0 - 0.2, 37.6 + r, -30.2, x1 + 0.2, 38.3 + r, -27.8, "piping", lean, pivot))
        for xs in (x0 - 0.2, x1 - 0.4):
            out.append(box(xs, 21.5 + r, -30.2, xs + 0.6, 38.3 + r, -27.8, "piping", lean, pivot))
        return out

    seat0 = bucket_seat(7, 18)
    seat1 = bucket_seat(-18, -7)

    return AreaCubes({'body': body, 'seat_0': seat0, 'seat_1': seat1})
