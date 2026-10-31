"""Windshield, frame and corner glass."""

from .context import FrontContext


def build(ctx: FrontContext) -> None:
    body = ctx.front
    FW = ctx.FW
    WS_Z = ctx.WS_Z
    box = ctx.box
    corner = ctx.corner

    for sx in (1, -1):
        # Wraparound corner glass beside the windshield, in black rubber
        ctx.glass_corners[sx] = [
            corner(sx, WS_Z, 36, 49.5, "glass"),
            corner(sx, WS_Z, 35.4, 36, "black", inset=0.2),
        ]
    # Split windshield leaning back in a black rubber frame.
    WS_LEAN = [-8, 0, 0]
    pivot = [0, 36, WS_Z]
    for x0, x1 in ((-FW, -0.6), (0.6, FW)):
        body.append(box(x0, 36, WS_Z + 0.2, x1, 49.5, WS_Z + 0.4, "glass", WS_LEAN, pivot))
    for x0, x1, color in ((-0.7, 0.7, "chrome"), (-FW, -FW + 0.6, "black"), (FW - 0.6, FW, "black")):
        body.append(box(x0, 36, WS_Z - 0.2, x1, 49.5, WS_Z + 0.6, color, WS_LEAN, pivot))
    for x in (-14, 5):
        body.append(box(x, 36.6, WS_Z - 0.6, x + 8, 37.2, WS_Z, "black", [0, 0, 25], [x, 37, WS_Z]))
