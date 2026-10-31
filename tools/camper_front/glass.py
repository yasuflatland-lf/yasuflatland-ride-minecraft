"""Windshield, frame and corner glass."""

import math

from tool_loader import load_tool
from .context import FrontContext
from .shape import ridge_dz

cube_tilt = load_tool("cube_tilt")


def build(ctx: FrontContext, assemblies: dict) -> dict[str, list[dict]]:
    FW, WS_Z = ctx.FW, ctx.WS_Z
    box = ctx.box
    pivot = [0, 36, WS_Z]
    ridge = ctx.shape.windshield_ridge_px
    angle = math.degrees(math.atan2(ridge, FW - 0.6))
    stretch = 1 / math.cos(math.radians(angle))
    ridge_z = WS_Z + ridge_dz(0, ridge, FW)
    members = {}

    for sx, name, wiper_x in ((-1, "windshield_left", -14), (1, "windshield_right", 5)):
        # Keep the projected width fixed so the 45-degree corner still meets the pane.
        outer_dz = ridge_dz(FW, ridge, FW)
        corners = [
            ctx.corner(sx, WS_Z + outer_dz, 36, 49.5, "glass"),
            ctx.corner(sx, WS_Z + outer_dz, 35.4, 36, "black", inset=0.2),
        ]
        yaw = -sx * angle
        pane_pivot = [sx * 0.6, 36, ridge_z]

        def pane_x(x):
            return sx * 0.6 + (x - sx * 0.6) * stretch
        x0, x1 = sorted((sx * 0.6, sx * FW))
        f0, f1 = sorted((sx * (FW - 0.6), sx * FW))
        cubes = corners + [
            box(pane_x(x0), 36, ridge_z + 0.2, pane_x(x1), 49.5, ridge_z + 0.4,
                "glass", [0, yaw, 0], pane_pivot),
            box(pane_x(f0), 36, ridge_z - 0.2, pane_x(f1), 49.5, ridge_z + 0.6,
                "black", [0, yaw, 0], pane_pivot),
        ]
        if sx == 1:
            cubes.append(box(-0.7, 36, ridge_z - 0.2, 0.7, 49.5, ridge_z + 0.6, "chrome"))
        # Preserve the blade's diagonal in its pane's plane, including its original pivot.
        wiper = box(pane_x(wiper_x), 36.6, ridge_z - 0.6,
                    pane_x(wiper_x + 8), 37.2, ridge_z, "black",
                    [0, 0, 25], [pane_x(wiper_x), 37, ridge_z])
        yaw_matrix = cube_tilt.cube_matrix([0, yaw, 0])
        old_pivot = wiper["pivot"]
        new_pivot = [pane_pivot[i] + d for i, d in enumerate(cube_tilt._apply(
            yaw_matrix, [old_pivot[i] - pane_pivot[i] for i in range(3)]))]
        wiper["origin"] = [new_pivot[i] + wiper["origin"][i] - old_pivot[i] for i in range(3)]
        wiper["pivot"] = new_pivot
        wiper["rotation"] = cube_tilt._rotation_of(cube_tilt._mul(
            yaw_matrix, cube_tilt.cube_matrix(wiper["rotation"])))
        cubes.append(wiper)
        members[name] = cube_tilt.tilt_assembly(
            cubes, pivot=pivot, axis="x", degrees=-8,
            assembly=name, assemblies=assemblies,
        )
        ctx.glass_corners[sx] = members[name][:2]
        ctx.front.extend(members[name][2:])
    return members
