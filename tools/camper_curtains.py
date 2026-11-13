"""Build window curtains, interleaved with the shell in the original cube order.

The body ranges for both shell and curtains are consequently disjoint. Anchors
identify the window panes after which the orchestrator inserts each curtain pair.
"""

from tool_loader import load_tool

kit = load_tool("camper_kit")
AreaCubes = kit.AreaCubes
HW, right_windows, left_windows = kit.HW, kit.right_windows, kit.left_windows
box = kit.box

AREA = "curtains"


def windows():
    for x0, x1, windows in ((HW - 1, HW, right_windows), (-HW, -HW + 1, left_windows)):
        for z0, z1, y0, y1 in windows:
            if z0 > -40 and y1 - y0 > 5:  # curtains drawn to the window edges inside
                yield x0, x1, z0, z1, y0, y1


def anchors():
    return [kit.window_glass(x0, (z0, z1, y0, y1)) for x0, x1, z0, z1, y0, y1 in windows()]


def build() -> AreaCubes:
    body = []
    for x0, x1, z0, z1, y0, y1 in windows():
        right = x0 > 0
        sgn = 1 if right else -1
        inner = x0 - 0.2 if right else x1
        for cz0, cz1 in ((z0, z0 + 2.5), (z1 - 2.5, z1)):
            body.append(box(inner - sgn * 0.3, y0, cz0, inner, y1 + 1, cz1, "curtain"))
    return AreaCubes({"body": body})
