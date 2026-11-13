"""Build the camper arches area."""

from tool_loader import load_tool

kit = load_tool("camper_kit")
ARCHES = kit.ARCHES
ARCH_TOP = kit.ARCH_TOP
AreaCubes = kit.AreaCubes
FLOOR = kit.FLOOR
HW = kit.HW
box = kit.box

AREA = "arches"


def build() -> AreaCubes:
    body = []
    for sgn in (1, -1):
        for a0, a1 in ARCHES:
            x_room, x_dark, x_wheel, x_wall = (sgn * (HW - d) for d in (5.7, 5.4, 5.1, 1))
            body.append(box(x_dark, 7, a0, x_wheel, ARCH_TOP + 0.5, a1, "black"))
            body.append(box(x_dark, ARCH_TOP, a0, x_wall, ARCH_TOP + 0.5, a1, "black"))
            for e0, e1 in ((a0, a0 + 0.3), (a1 - 0.3, a1)):
                body.append(box(x_wheel, 13, e0, x_wall, ARCH_TOP, e1, "black"))
            body.append(box(x_room, FLOOR, a0 - 0.3, x_dark, ARCH_TOP + 0.8, a1 + 0.3, "wood"))
            body.append(box(x_room, ARCH_TOP + 0.5, a0 - 0.3, x_wall, ARCH_TOP + 0.8, a1 + 0.3, "wood"))
            for e0, e1 in ((a0 - 0.3, a0), (a1, a1 + 0.3)):
                body.append(box(x_dark, 13, e0, x_wall, ARCH_TOP + 0.5, e1, "wood"))
    return AreaCubes({"body": body})


def holes():
    """Wheel-well cuts applied to the merged floor and furniture before adding panels."""
    for sgn in (1, -1):
        for a0, a1 in ARCHES:
            x_room, x_wall = (sgn * (HW - d) for d in (5.7, 1))
            yield (min(x_room, x_wall), -99, a0 - 0.3, max(x_room, x_wall), ARCH_TOP + 0.8, a1 + 0.3)
