"""Helpers shared by the SUV body part modules."""

import math

from tool_loader import load_tool

dims = load_tool("suv_dims")
DIMS = dims.DIMS
suv_cubes = load_tool("suv_cubes")
body_paint = load_tool("suv_paint_body")
MIN_FLAKE_FACE_PX = body_paint.MIN_FLAKE_FACE_PX
turned = suv_cubes.turned
both_sides = suv_cubes.both_sides


def face_size(cube, face):
    w, h, d = cube["size"]
    return {"north": (w, h), "south": (w, h), "east": (d, h),
            "west": (d, h), "up": (w, d), "down": (w, d)}[face]


def box(x0, y0, z0, x1, y1, z1, color):
    cube = suv_cubes.box(x0, y0, z0, x1, y1, z1, color)
    if color not in ("body", "hardtop", "hardtop_rib"):
        return cube
    scale = suv_cubes.atlas.TEXELS_PER_PIXEL
    for face in ("north", "south", "east", "west", "up", "down"):
        a, b = face_size(cube, face)
        if color == "body" and min(a, b) < MIN_FLAKE_FACE_PX:
            continue
        if color == "body":
            name, face_scale = "flake", scale
        elif color == "hardtop_rib":
            name = "hardtop_rib" if face in ("up", "down") else "hardtop_rib_side"
            face_scale = body_paint.HARDTOP_FLAT_DENSITY if face in ("up", "down") else scale
        elif face in ("up", "down"):
            name, face_scale = "hardtop", body_paint.HARDTOP_FLAT_DENSITY
        else:
            name, face_scale = "hardtop_side", scale
        r = suv_cubes.atlas.region("body", name)
        cube["uv"][face] = suv_cubes.atlas.ATLAS.face(r, uv_size=(a * face_scale, b * face_scale))
    return cube


def panel_face(cube, name, face, offset=(0, 0)):
    r = suv_cubes.atlas.region("body", name)
    a, b = face_size(cube, face)
    scale_u, scale_v = (body_paint.panel_scale(name) if name in body_paint.PANEL_EXTENTS
                        else (suv_cubes.atlas.TEXELS_PER_PIXEL,) * 2)
    cube["uv"][face] = suv_cubes.atlas.ATLAS.face(
        r, (offset[0] * scale_u, offset[1] * scale_v), (a * scale_u, b * scale_v))
    return cube


def windshield_part(x0, y0, z0, x1, y1, z1, color):
    return turned(box(x0, y0, z0, x1, y1, z1, color), DIMS.windshield.pivot, (DIMS.windshield.lean_degrees, 0, 0))


def leaning_top(y):
    """The unturned top of a windshield part whose face 0.5 px off the pivot should end at height y:
    leaning shortens its rise and lifts that face by its depth."""
    return DIMS.hood.top_y + (y - DIMS.hood.top_y - 0.5 * DIMS.windshield.lean_sin) / DIMS.windshield.lean_cos


def arch_cut(x0, x1, y0, y1, z_back, z_front, z_center, color, step=0.5):
    """A side panel from z_back to z_front whose part below the arch top stops at the arch's slope: strips
    `step` tall, each ending at the slope's z at its lower edge so none pokes into the arch. The slope
    moves toward the axle as it rises, so each step leaves a sliver of at most 0.35 px outside the arch,
    which the flare covers; the panel's edge reads as the flare's outline."""
    cubes = []
    if y1 > DIMS.arch.top_y:
        cubes.append(box(x0, max(y0, DIMS.arch.top_y), z_back, x1, y1, z_front, color))
    y = y0
    while y < min(y1, DIMS.arch.top_y) - 1e-6:
        top = min(y + step, y1, DIMS.arch.top_y)
        front_cut, rear_cut = DIMS.arch.side_z(z_center, 1, y), DIMS.arch.side_z(z_center, -1, y)
        # The panel lies ahead of the arch, behind it, or on both sides of it
        if z_front > front_cut:
            cubes.append(box(x0, y, max(z_back, front_cut), x1, top, z_front, color))
        if z_back < rear_cut:
            cubes.append(box(x0, y, z_back, x1, top, min(z_front, rear_cut), color))
        y = top
    if color == "body":
        if z_back in (DIMS.cabin.front_door_hinge_z, DIMS.chassis.rear_z + 1):
            name = "flake"
        else:
            name = "door_front" if z_front > 0 else "door_rear"
        for cube in cubes:
            _, bottom, back = cube["origin"]
            strip_top = bottom + cube["size"][1]
            panel_face(cube, name, "east", (back - z_back, y1 - strip_top))
    return cubes


def chamfered_bar(y0, y1, z_back, z_tip, z_end_back, half_width, chamfer, angle=30):
    """A bar across the car whose front corners are cut back at `angle` degrees, so it reads as a
    trapezoid from above. Between the body's sides it runs back to z_back; outboard of them it is a
    shallow end piece from z_end_back, clear of the tire behind it. Each cut is a block turned back
    around the cut's inner front end (a positive y rotation turns +x toward -z), just deep enough to
    fill the triangle the cut leaves over the end piece, so its turned back corner stays ahead of
    z_end_back. The cut must start outboard of the body's side."""
    cx = half_width - chamfer
    assert cx > DIMS.chassis.body_half_width
    radians = math.radians(angle)
    corner = turned(box(cx, y0, z_tip - chamfer * math.sin(radians), cx + chamfer / math.cos(radians), y1, z_tip, "trim"),
                    (cx, y0, z_tip), (0, angle, 0))
    side = box(cx, y0, z_end_back, half_width, y1, z_tip - chamfer * math.tan(radians), "trim")
    end = box(DIMS.chassis.body_half_width, y0, z_end_back, cx, y1, z_tip, "trim")
    return [box(-DIMS.chassis.body_half_width, y0, z_back, DIMS.chassis.body_half_width, y1, z_tip, "trim"), *both_sides([corner, side, end])]
