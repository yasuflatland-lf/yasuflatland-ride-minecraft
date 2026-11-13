"""Build the camper shower area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
CEIL = kit.CEIL
FLOOR = kit.FLOOR
box = kit.box

AREA = "shower"


SHOWER_HINGE = [8, 0, 54]
# Where the spray leaves: the middle of the underside of the shower head that 2/9 modeled on the
# shower-toilet's rear wall, so the water comes out of the visible head (ADR 0094).
SHOWER_HEAD = [20.5, 44.5, 53.75]


def build() -> AreaCubes:
    body = []
    # Shower-toilet room in the rear right corner (cell z = -3, two layers), door to the aisle.
    SHOWER_Z = (40.5, 41.1)  # front partition
    body.append(box(8, FLOOR, SHOWER_Z[0], 22.8, CEIL - 0.2, SHOWER_Z[1], "ivory"))
    body.append(box(8, FLOOR, SHOWER_Z[1], 8.6, CEIL - 0.2, 42, "ivory"))  # front jamb
    body.append(box(8, FLOOR, 54, 8.6, CEIL - 0.2, 55.5, "ivory"))  # rear jamb, short of the rear wall
    body.append(box(8, 52, 42, 8.6, CEIL - 0.2, 54, "ivory"))  # header
    body.append(box(9, FLOOR, SHOWER_Z[1], 22.8, FLOOR + 0.3, 55.5, "white"))  # shower tray
    body.append(box(10.5, FLOOR + 0.3, 52, 11.5, FLOOR + 0.35, 53, "black"))  # drain
    body.append(box(14, FLOOR, 45.5, 20, 22, 50.5, "white"))  # toilet bowl
    body.append(box(13, 22, 45, 20, 23, 51, "ivory"))  # seat, 7 px up like the dinette
    body.append(box(19, 23, 45, 19.5, 31, 51, "ivory"))  # raised lid
    body.append(box(19.5, 26, 44.5, 22.6, 34, 51.5, "white"))  # tank
    body.append(box(21.5, 46, 53, 22.8, 47, 54.5, "chrome"))  # shower arm
    body.append(box(19.5, 44.5, 52.5, 21.5, 46, 55, "chrome"))  # shower head
    # The door is its own bone, hinged on its rear edge at the aisle face; it stays closed here.
    shower_door = [box(8, FLOOR + 0.5, 42.1, 8.6, 51.9, 53.9, "wood")]
    shower_door.append(box(7.4, 32, 43, 8, 33, 44.5, "chrome"))  # handle outside
    shower_door.append(box(8.6, 32, 43, 9.2, 33, 44.5, "chrome"))  # handle inside

    return AreaCubes({'body': body, 'shower_door': shower_door})
