"""Vertical windshield with yawed panes, frame and wipers, and fixed corner glass."""

import math

from tool_loader import load_tool
from .context import FrontContext

cube_tilt = load_tool("cube_tilt")

WS_POST_HALF_WIDTH = 0.6
WS_FOOT_Y = 36
WS_HEADER_Y = 49.5
WS_FRAME_BOTTOM_Y = 35.4
WIPER_ANGLE = 25
WIPER_OFFSETS = (-14, 5)
WIPER_LENGTH = 8


def build(ctx: FrontContext, assemblies: dict) -> dict[str, list[dict]]:
    FW, WS_Z = ctx.FW, ctx.WS_Z
    box = ctx.box
    ridge = ctx.shape.windshield_ridge_px
    angle = math.degrees(math.atan2(ridge, FW - WS_POST_HALF_WIDTH))
    stretch = 1 / math.cos(math.radians(angle))
    ridge_z = WS_Z - ridge
    members = {}

    for sx, name, wiper_x in zip((-1, 1), ("windshield_left", "windshield_right"), WIPER_OFFSETS):
        corners = [
            ctx.corner(sx, WS_Z, WS_FOOT_Y, WS_HEADER_Y, "glass"),
            ctx.corner(sx, WS_Z, WS_FRAME_BOTTOM_Y, WS_FOOT_Y, "black", inset=0.2),
        ]

        def pane_x(x):
            return sx * FW + (x - sx * FW) * stretch

        x0, x1 = sorted((sx * WS_POST_HALF_WIDTH, sx * FW))
        f0, f1 = sorted((sx * (FW - WS_POST_HALF_WIDTH), sx * FW))
        # Center the glass at +0.2 so the 45-degree corner seam stays within 0.2 px in z.
        panes = [
            box(pane_x(x0), WS_FOOT_Y, WS_Z + 0.1, pane_x(x1), WS_HEADER_Y, WS_Z + 0.3,
                "glass"),
            box(pane_x(f0), WS_FOOT_Y, WS_Z - 0.2, pane_x(f1), WS_HEADER_Y, WS_Z + 0.6,
                "black"),
            box(pane_x(wiper_x), WS_FOOT_Y + 0.6, WS_Z - 0.6,
                pane_x(wiper_x + WIPER_LENGTH), WS_FOOT_Y + 1.2, WS_Z, "black",
                [0, 0, WIPER_ANGLE], [pane_x(wiper_x), WS_FOOT_Y + 1, WS_Z]),
        ]
        fixed = corners
        if sx == 1:
            fixed.append(box(-0.7, WS_FOOT_Y, ridge_z - 0.2,
                             0.7, WS_HEADER_Y, ridge_z + 0.6, "chrome"))
        yawed = cube_tilt.yaw_cubes(
            panes, pivot=[sx * FW, WS_FOOT_Y, WS_Z], degrees=-sx * angle,
            assembly=name, assemblies=assemblies,
        )
        members[name] = fixed + yawed
        ctx.glass_corners[sx] = members[name][:2]
        ctx.front.extend(members[name][2:])
    return members
