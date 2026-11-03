"""SUV fender flares, side vents and arch liners."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box
suv_cubes = load_tool("suv_cubes")
panels = load_tool("panels")


def _piece(x0, y0, z0, x1, y1, z1, color):
    cube = panels.panel(x0, y0, z0, x1, y1, z1, suv_cubes.uv(color)["north"])
    # Body paint sizes its flake UVs per face, including narrow panel edges.
    if color == "body":
        cube["uv"] = box(x0, y0, z0, x1, y1, z1, color)["uv"]
    return cube


def fender_flare(z_center, crest, front_leg_bottom, rear_leg_bottom):
    """A flat plate and vertical legs with an abutting rubber rim on the +x side."""
    flare = DIMS.flare
    x0, x1 = DIMS.chassis.body_half_width, flare.x
    plate_bottom = crest - flare.thickness
    lip_bottom = plate_bottom - flare.lip
    cubes = [
        _piece(x0, plate_bottom, z_center - flare.leg_outer,
               x1, crest, z_center + flare.leg_outer, "body"),
        _piece(x0, lip_bottom, z_center - flare.leg_body_inner,
               x1, plate_bottom, z_center + flare.leg_body_inner, "trim"),
    ]
    for side, bottom in ((1, front_leg_bottom), (-1, rear_leg_bottom)):
        body_z = sorted((z_center + side * flare.leg_body_inner,
                         z_center + side * flare.leg_outer))
        lip_z = sorted((z_center + side * flare.leg_inner,
                        z_center + side * flare.leg_body_inner))
        cubes.extend([
            _piece(x0, bottom, body_z[0], x1, plate_bottom, body_z[1], "body"),
            _piece(x0, bottom, lip_z[0], x1, lip_bottom, lip_z[1], "trim"),
        ])
    cubes.extend(shell.arch_cut(x0, x0 + flare.inner_panel_depth,
                                DIMS.arch.foot_y, lip_bottom,
                                z_center - flare.leg_inner, z_center + flare.leg_inner,
                                z_center, "trim"))
    return cubes


def fender_vent_cubes():
    """A shallow frame stands proud of the dark centre between the flare and door."""
    flare = DIMS.flare
    x = DIMS.chassis.body_half_width
    frame_x = x + flare.vent_frame_depth
    y0, y1 = flare.vent_y0, flare.vent_y1
    z0, z1 = flare.vent_z0, flare.vent_z1
    rim = flare.vent_frame_width
    return [
        _piece(x, y0, z0, frame_x, y0 + rim, z1, "trim"),
        _piece(x, y1 - rim, z0, frame_x, y1, z1, "trim"),
        _piece(x, y0 + rim, z0, frame_x, y1 - rim, z0 + rim, "trim"),
        _piece(x, y0 + rim, z1 - rim, frame_x, y1 - rim, z1, "trim"),
        _piece(x, y0 + rim, z0 + rim, x + flare.vent_center_depth,
               y1 - rim, z1 - rim, "grille"),
    ]


def arch_liner_cubes():
    # Black inner liners behind each arch, so the cabin does not show through it. The front arch sits
    # close enough to the hood's front face that an unclipped liner would stick out ahead of the grille.
    return [
        box(DIMS.arch.liner_x, DIMS.arch.foot_y - 1, z - DIMS.arch.foot_z - 0.5, DIMS.arch.liner_x + 0.2, DIMS.arch.top_y + 0.5, min(z + DIMS.arch.foot_z + 0.5, DIMS.hood.front_z), "grille")
        for z in (DIMS.wheels.front_axle_z, DIMS.wheels.rear_axle_z)
    ]
