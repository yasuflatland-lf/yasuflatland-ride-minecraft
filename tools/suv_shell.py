"""SUV body shell, panels, bumpers, doors and sealed windows."""

import math

from tool_loader import load_tool

dims = load_tool("suv_dims")
DIMS = dims.DIMS
suv_cubes = load_tool("suv_cubes")
body_paint = load_tool("suv_paint_body")
MIN_FLAKE_FACE_PX = body_paint.MIN_FLAKE_FACE_PX
HANDLE_BOTTOM_Y, HANDLE_TOP_Y = 14.4, 15.1
HANDLE_REAR_OFFSET, HANDLE_FRONT_OFFSET = 1.5, 4.5
HANDLE_OUTER_X = 13.35
REARVIEW_STAY_LENGTH = 2.5 / 3


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
            name, face_scale = "hardtop_rib" if face in ("up", "down") else "hardtop_rib_side", scale
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


disc = suv_cubes.disc
turned = suv_cubes.turned
mirrored = suv_cubes.mirrored
both_sides = suv_cubes.both_sides
facing_back = suv_cubes.facing_back


def windshield_part(x0, y0, z0, x1, y1, z1, color):
    return turned(box(x0, y0, z0, x1, y1, z1, color), DIMS.windshield.pivot, (DIMS.windshield.lean_degrees, 0, 0))


def leaning_top(y):
    """The unturned top of a windshield part whose face 0.5 px off the pivot should end at height y:
    leaning shortens its rise and lifts that face by its depth."""
    return DIMS.hood.top_y + (y - DIMS.hood.top_y - 0.5 * DIMS.windshield.lean_sin) / DIMS.windshield.lean_cos


def fender_flare(z_center, front_leg_bottom, rear_leg_bottom):
    """A black trapezoid flare over a wheel on the +x side, like a Wrangler's: a flat top over the tire,
    a side sloping down and out at each end, and a leg under each slope that drops toward the bumper or
    the side step."""
    length = math.hypot(DIMS.arch.top_y - DIMS.arch.foot_y, DIMS.arch.foot_z - DIMS.arch.top_half) + 0.6  # closes the corner
    slope = round(math.degrees(math.atan(DIMS.arch.run_per_rise)), 3)
    x1 = DIMS.flare.x
    cubes = [box(DIMS.chassis.body_half_width, DIMS.arch.top_y, z_center - DIMS.arch.top_half - 0.8, x1, DIMS.arch.top_y + DIMS.flare.thickness,
                 z_center + DIMS.arch.top_half + 0.8, "trim")]
    # Each slope stands on its lower inner end and tips its top toward the wheel's center; a positive x
    # rotation here tips +y toward -z in game (see WINDSHIELD_LEAN).
    for side in (1, -1):
        z0 = z_center + side * DIMS.arch.foot_z
        z1 = z0 + side * DIMS.flare.thickness
        cubes.append(turned(box(DIMS.chassis.body_half_width, DIMS.arch.foot_y, min(z0, z1), x1, DIMS.arch.foot_y + length, max(z0, z1), "trim"),
                            (DIMS.chassis.body_half_width, DIMS.arch.foot_y, z0), (side * slope, 0, 0)))
    for side, leg_bottom in ((1, front_leg_bottom), (-1, rear_leg_bottom)):
        z0 = z_center + side * DIMS.arch.foot_z
        z1 = z0 + side * (DIMS.flare.thickness - 0.1)
        cubes.append(box(DIMS.chassis.body_half_width, leg_bottom, min(z0, z1), x1, DIMS.arch.foot_y + 0.5, max(z0, z1), "trim"))
    return cubes


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


# Doors (ADR 0009). The +x side of this definition becomes the right side in game. The pivot sits on the hinge (front edge)
DOORS = {
    "door_fr": (+1, DIMS.cabin.front_door_hinge_z, DIMS.cabin.b_pillar_front_z),  # (side, front-edge z, rear-edge z)
    "door_rr": (+1, DIMS.cabin.b_pillar_rear_z, DIMS.chassis.cargo_front_z),
    "door_fl": (-1, DIMS.cabin.front_door_hinge_z, DIMS.cabin.b_pillar_front_z),
    "door_rl": (-1, DIMS.cabin.b_pillar_rear_z, DIMS.chassis.cargo_front_z),
}


def window_frame_piece(y0, z0, y1, z1):
    """A window frame bar: body-colored outside and black inside, like the door cards."""
    return [box(DIMS.chassis.door_frame_mid_x, y0, z0, DIMS.chassis.body_half_width, y1, z1, "body"), box(DIMS.chassis.cabin_half_width, y0, z0, DIMS.chassis.door_frame_mid_x, y1, z1, "trim")]


def door(name):
    """A door with its window frame and a black door card inside, hinged at its front edge. The front
    doors carry the side mirrors, so the mirrors swing open with them."""
    side, z_front, z_back = DOORS[name]
    # Each door's lower corner nearest a wheel follows that wheel's arch
    axle = DIMS.wheels.front_axle_z if z_front > 0 else DIMS.wheels.rear_axle_z
    panel = arch_cut(DIMS.chassis.cabin_half_width, DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.greenhouse.belt_y, z_back, z_front, axle, "body")
    card = arch_cut(11.8, DIMS.chassis.cabin_half_width, DIMS.chassis.floor_y + 1, DIMS.greenhouse.belt_y - 1, z_back + 0.6, z_front - 0.6, axle, "trim")
    if z_front > 0:
        front_post = [windshield_part(x0, DIMS.hood.top_y, DIMS.hood.rear_z - 2, x0 + 0.5, DIMS.hood.top_y + DIMS.windshield.front_post_length, DIMS.hood.rear_z - 1, color)
                      for x0, color in ((DIMS.chassis.door_frame_mid_x, "body"), (DIMS.chassis.cabin_half_width, "trim"))]
        front_post += window_frame_piece(DIMS.greenhouse.belt_y, z_front - 1, DIMS.hood.top_y, z_front)
        top_front = DIMS.windshield.roof_front + 0.1
        side_mirror = [
            box(DIMS.chassis.body_half_width, DIMS.greenhouse.belt_y, z_front - 2, 14, DIMS.greenhouse.belt_y + 1, z_front - 1, "body"),
            box(14, DIMS.greenhouse.belt_y - 0.5, z_front - 2.5, 16.5, DIMS.greenhouse.belt_y + 2.5, z_front - 1, "body"),
            box(14.2, DIMS.greenhouse.belt_y, z_front - 2.7, 16.3, DIMS.greenhouse.belt_y + 2, z_front - 2.5, "rim"),
        ]
    else:
        front_post = window_frame_piece(DIMS.greenhouse.belt_y, z_front - 1, DIMS.greenhouse.roof_y, z_front)
        top_front = z_front
        side_mirror = []
    cubes = [
        *panel,
        *card,
        *front_post,
        box(DIMS.chassis.body_half_width, HANDLE_BOTTOM_Y, z_back + HANDLE_REAR_OFFSET, HANDLE_OUTER_X, HANDLE_TOP_Y, z_back + HANDLE_FRONT_OFFSET, "grille"),  # door handle, near the rear edge
        *window_frame_piece(DIMS.greenhouse.belt_y, z_back, DIMS.greenhouse.roof_y, z_back + 1),  # rear post
        *window_frame_piece(DIMS.greenhouse.window_top_y, z_back, DIMS.greenhouse.roof_y, top_front),  # top rail
        *side_mirror,
    ]
    return {
        "name": name,
        "parent": "body",
        "pivot": [DIMS.chassis.door_frame_mid_x * side, 12, z_front],
        "cubes": cubes if side > 0 else [mirrored(c) for c in cubes],
    }


# The side windows and the windshield are open frames. Under water (ADR 0040) plates fill them, flush
# with the outside of the frames, in the same blue as the rear glass. The front side window is a
# trapezoid, so 1 px strips step down along the leaning front post. Each strip reaches from its lower
# end a little into the post, which the post hides, and sits 0.05 px inside the frame's outer face so
# the overlap does not fight the post for the same plane.
def front_post_back(y):
    """z of the rear face of the front door's leaning post at height y, which starts 1.5 px behind the pivot."""
    y0, z0 = DIMS.windshield.pivot[1] - 1.5 * DIMS.windshield.lean_sin, DIMS.windshield.pivot[2] - 1.5 * DIMS.windshield.lean_cos
    return z0 - (y - y0) * DIMS.windshield.lean_tan


def front_side_panes():
    # Split at the cowl height as well as each pixel: every strip end stays hidden in either
    # the upright foot or the raked post, even when the belt and roof are fractional pixels.
    panes = []
    y = DIMS.greenhouse.window_bottom_y
    while y < DIMS.greenhouse.window_top_y - 1e-6:
        if y < DIMS.hood.top_y:
            top = min(y + 1, DIMS.hood.top_y)
            front = DIMS.cabin.front_door_hinge_z - 1
        else:
            top = min(y + 1, DIMS.greenhouse.window_top_y)
            front = front_post_back(y) + 0.2
        panes.append(box(12.85, y, -4, 12.95, top, front, "rear_glass"))
        y = top
    return panes


def windows_sealed():
    return [
        windshield_part(-DIMS.chassis.cabin_half_width, DIMS.hood.top_y + DIMS.windshield.rail_height, DIMS.hood.rear_z - 0.1, DIMS.chassis.cabin_half_width, leaning_top(DIMS.greenhouse.roof_y), DIMS.hood.rear_z, "rear_glass"),
        *both_sides([
            *front_side_panes(),
            box(12.9, DIMS.greenhouse.window_bottom_y, DIMS.chassis.cargo_front_z + 1, DIMS.chassis.body_half_width, DIMS.greenhouse.window_top_y, -7, "rear_glass"),
        ]),
    ]


def chassis_cubes():
    return [
        # Chassis and floor
        box(-DIMS.chassis.body_half_width, DIMS.chassis.sill_y, DIMS.chassis.rear_z + 1, DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.hood.front_z - 1, "trim"),
    ]


def hood_cubes():
    return [
        # Hood (engine compartment) above the front arches; its lower sides follow the arches below
        panel_face(box(-DIMS.chassis.body_half_width, DIMS.arch.top_y, DIMS.hood.rear_z, DIMS.chassis.body_half_width, DIMS.hood.top_y, DIMS.hood.front_z, "body"), "hood_top", "up"),
        box(-DIMS.arch.liner_x, DIMS.chassis.floor_y, DIMS.hood.rear_z, DIMS.arch.liner_x, DIMS.arch.top_y, DIMS.hood.front_z, "body"),
    ]


def windshield_frame_cubes():
    return [
        windshield_part(-DIMS.chassis.cabin_half_width, DIMS.hood.top_y, DIMS.windshield.foot_z, DIMS.chassis.cabin_half_width, DIMS.hood.top_y + DIMS.windshield.rail_height, DIMS.hood.rear_z, "trim"),
    ]


def a_pillar_cubes():
    return [windshield_part(DIMS.chassis.cabin_half_width, DIMS.hood.top_y, DIMS.hood.rear_z - 1, DIMS.chassis.body_half_width, leaning_top(DIMS.greenhouse.roof_top), DIMS.hood.rear_z, "body")]


def rearview_mirror_cubes():
    return [
        # Rearview mirror (center of the windshield's top edge, behind the leaning glass)
        box(-0.5, DIMS.greenhouse.roof_y - REARVIEW_STAY_LENGTH, DIMS.windshield.roof_front - 0.8, 0.5, DIMS.greenhouse.roof_y, DIMS.windshield.roof_front - 0.3, "trim"),
        box(-2.5, DIMS.greenhouse.roof_y - REARVIEW_STAY_LENGTH - 1.5, DIMS.windshield.roof_front - 1.3, 2.5, DIMS.greenhouse.roof_y - REARVIEW_STAY_LENGTH, DIMS.windshield.roof_front - 0.8, "rim"),
    ]


def roof_cubes():
    return [
        # Black hardtop roof
        box(-DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y, DIMS.chassis.rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_top, DIMS.windshield.roof_front, "hardtop"),
    ]


def b_pillar_cubes():
    # B-pillars run down to the floor so they close the gap between the front and rear doors.
    return [box(DIMS.chassis.cabin_half_width, DIMS.chassis.floor_y, DIMS.cabin.b_pillar_rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y, DIMS.cabin.b_pillar_front_z, "body")]


def cargo_upper_side_cubes():
    # Cargo area sides: body-colored below the belt line, the black hardtop above it with a closed,
    # tinted quarter window
    return [
        box(DIMS.chassis.cabin_half_width, DIMS.greenhouse.belt_y, DIMS.chassis.rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y, DIMS.chassis.cargo_front_z, "hardtop"),
        box(DIMS.chassis.body_half_width, DIMS.greenhouse.window_bottom_y, DIMS.chassis.rear_z + 2.5, 13.1, DIMS.greenhouse.window_top_y, DIMS.chassis.cargo_front_z - 1.5, "glass"),
    ]


def cargo_floor_cubes():
    return [
        # Cargo floor
        box(-DIMS.chassis.cabin_half_width, DIMS.chassis.floor_y, DIMS.chassis.rear_z + 1, DIMS.chassis.cabin_half_width, DIMS.chassis.floor_y + 0.3, DIMS.chassis.cargo_front_z, "hardtop"),
    ]


def tailgate_cubes():
    return [
        # Rear: body-colored tailgate, and the hardtop's header over the rear window with the third brake
        # light under it. On the ground the rear window stays open; the rear_glass bone closes it in the
        # other forms (ADR 0026).
        panel_face(box(-DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.chassis.rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.belt_y, DIMS.chassis.rear_z + 1, "body"), "tailgate", "north"),
        box(-DIMS.chassis.body_half_width, DIMS.greenhouse.window_top_y, DIMS.chassis.rear_z, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y, DIMS.chassis.rear_z + 1, "hardtop"),
    ]


def tailgate_hinge_cubes():
    # The tailgate hinges sit on the right.
    return [
        box(6.2, 14.2, DIMS.chassis.rear_z - 0.3, 9.0, 15.2, DIMS.chassis.rear_z, "body"),
        box(6.2, 10.4, DIMS.chassis.rear_z - 0.3, 9.0, 11.4, DIMS.chassis.rear_z, "body"),
    ]


def exhaust_cubes():
    return [
        # Exhaust pipe (rear right = +x side, sticking out backward from under the rear bumper)
        box(8, DIMS.chassis.sill_y - 2.2, DIMS.chassis.rear_z - 2, 10, DIMS.chassis.sill_y - 0.6, DIMS.wheels.rear_axle_z - 1, "trim"),
        box(7.75, DIMS.chassis.sill_y - 2.45, DIMS.chassis.rear_z - 2.5, 10.25, DIMS.chassis.sill_y - 0.35, DIMS.chassis.rear_z - 2, "rim"),
    ]


def side_step_cubes():
    # Side steps run between the fender flares.
    return [box(DIMS.chassis.body_half_width, DIMS.chassis.sill_y, DIMS.steps.rear_z, DIMS.wheels.hub_x, DIMS.steps.top_y, DIMS.steps.front_z, "trim")]


def hood_dome_and_cowl_cubes():
    # Hood: a raised power dome, a black mesh vent on each side of it, washer nozzles, the cowl's vent
    # strip with the wipers parked on it, and the latches at the rear corners
    return [
        box(-9.5, DIMS.hood.top_y, DIMS.hood.rear_z + 2, 9.5, DIMS.hood.top_y + 0.4, DIMS.hood.front_z - 0.4, "body"),
        box(-8.5, DIMS.hood.top_y + 0.4, DIMS.hood.rear_z + 2.6, 8.5, DIMS.hood.top_y + 0.7, DIMS.hood.front_z - 0.9, "body"),
        box(-DIMS.chassis.body_half_width, DIMS.hood.top_y, DIMS.hood.rear_z, DIMS.chassis.body_half_width, DIMS.hood.top_y + 0.3, DIMS.hood.rear_z + 1.6, "trim"),  # cowl
        box(-3, DIMS.hood.top_y + 0.3, DIMS.hood.rear_z + 0.4, 3, DIMS.hood.top_y + 0.4, DIMS.hood.rear_z + 1.3, "grille"),  # cowl vent
    ]


def hood_detail_cubes():
    return [
        box(10, DIMS.hood.top_y, DIMS.hood.front_z - 7.5, 12.2, DIMS.hood.top_y + 0.5, DIMS.hood.front_z - 2.5, "grille"),  # vent
        *[box(10.2, DIMS.hood.top_y + 0.5, z, 12.0, DIMS.hood.top_y + 0.6, z + 0.35, "trim") for z in (DIMS.hood.front_z - d for d in (7, 6.1, 5.2, 4.3, 3.4))],  # vent mesh
        box(2.4, DIMS.hood.top_y + 0.7, DIMS.hood.front_z - 4, 3.2, DIMS.hood.top_y + 1.1, DIMS.hood.front_z - 3, "grille"),  # washer nozzle
        box(11.4, DIMS.hood.top_y - 0.8, DIMS.hood.rear_z + 0.8, 12.6, DIMS.hood.top_y + 0.7, DIMS.hood.rear_z + 2.2, "grille"),  # latch
        turned(box(1, DIMS.hood.top_y + 0.3, DIMS.hood.rear_z + 0.6, 9.5, DIMS.hood.top_y + 0.6, DIMS.hood.rear_z + 0.9, "grille"), (1, DIMS.hood.top_y + 0.3, DIMS.hood.rear_z + 0.75), (0, -8, 0)),  # wiper
    ]


def hood_lower_side_cubes():
    # The hood's lower sides, cut along the front arch, outside the liners. They reach back to the front
    # door's hinge: with the front arch moved forward, its flare no longer hides the gap under the cowl.
    return arch_cut(DIMS.arch.liner_x, DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.arch.top_y, DIMS.cabin.front_door_hinge_z, DIMS.hood.front_z, DIMS.wheels.front_axle_z, "body")


def cowl_side_cubes():
    return [box(DIMS.arch.liner_x, DIMS.arch.top_y, DIMS.cabin.front_door_hinge_z, DIMS.chassis.body_half_width, DIMS.hood.top_y, DIMS.hood.rear_z, "body")]


def cargo_lower_side_cubes():
    # The cargo area's body-colored side below the belt line, cut along the rear arch
    return arch_cut(DIMS.chassis.cabin_half_width, DIMS.chassis.body_half_width, DIMS.chassis.floor_y, DIMS.greenhouse.belt_y, DIMS.chassis.rear_z + 1, DIMS.chassis.cargo_front_z, DIMS.wheels.rear_axle_z, "body")


def fuel_door_cubes():
    # Round fuel door on the left side of the cargo area, behind the rear flare and under the belt line
    return disc("x", (-DIMS.chassis.body_half_width, 14.8, DIMS.chassis.rear_z + 2.7), 1.2, -DIMS.chassis.body_half_width - 0.25, -DIMS.chassis.body_half_width, [i * 11.25 for i in range(8)], "grille")  # 32 sides


def arch_liner_cubes():
    # Black inner liners behind each arch, so the cabin does not show through it. The front arch sits
    # close enough to the hood's front face that an unclipped liner would stick out ahead of the grille.
    return [
        box(DIMS.arch.liner_x, DIMS.arch.foot_y - 1, z - DIMS.arch.foot_z - 0.5, 11.6, DIMS.arch.top_y + 0.5, min(z + DIMS.arch.foot_z + 0.5, DIMS.hood.front_z), "grille")
        for z in (DIMS.wheels.front_axle_z, DIMS.wheels.rear_axle_z)
    ]


def front_bumper_lower_cubes():
    # Front bumper: a low bar under the grille, between a tucked-in lower lip and a slightly set-back top
    # edge, standing on two frame horns that reach forward from the chassis
    return chamfered_bar(DIMS.front_bumper.bottom_y, DIMS.front_bumper.band_bottom_y, DIMS.front_bumper.back_z, DIMS.front_bumper.tip_z - 1,
                          DIMS.front_bumper.end_back_z, DIMS.wheels.bumper_half_width - 1, 1.2)


def front_bumper_band_cubes():
    return chamfered_bar(DIMS.front_bumper.band_bottom_y, DIMS.front_bumper.band_top_y, DIMS.front_bumper.back_z, DIMS.front_bumper.tip_z,
                          DIMS.front_bumper.end_back_z, DIMS.wheels.bumper_half_width, 2)


def front_bumper_top_cubes():
    return chamfered_bar(DIMS.front_bumper.band_top_y, DIMS.front_bumper.top_y, DIMS.front_bumper.back_z, DIMS.front_bumper.tip_z - 0.5,
                          DIMS.front_bumper.end_back_z, DIMS.wheels.bumper_half_width - 0.5, 1.7)


def rear_bumper_cubes():
    # Rear bumper: the same kind of bar facing backward, with red reflectors at its ends and red tow
    # hooks under it
    return [facing_back(c) for c in chamfered_bar(DIMS.rear_bumper.bottom_y, DIMS.rear_bumper.top_y, -DIMS.rear_bumper.tip_z - DIMS.rear_bumper.length, -DIMS.rear_bumper.tip_z,
                                                   -DIMS.wheels.rear_axle_z + DIMS.wheels.bumper_end_clearance, DIMS.wheels.bumper_half_width, DIMS.rear_bumper.chamfer)]


def frame_horn_cubes():
    return [box(5, DIMS.chassis.sill_y, DIMS.hood.front_z - 1.5, 7, DIMS.chassis.floor_y, DIMS.front_bumper.back_z + 0.5, "trim")]


def front_tow_hook_cubes():
    # Tow hooks standing on the bar's top, outboard of the grille's middle slots
    return [box(5.2, DIMS.front_bumper.top_y, DIMS.front_bumper.tip_z - 2, 5.9, DIMS.front_bumper.top_y + 1, DIMS.front_bumper.tip_z - 0.8, "rim")]


def rear_tow_hook_cubes():
    return [
        box(7.4, DIMS.chassis.sill_y - 2.2, DIMS.chassis.rear_z - 1.2, 8.4, DIMS.rear_bumper.bottom_y, DIMS.chassis.rear_z + 1, "tail"),  # tow hook
    ]


def grille_cubes():
    result = []
    # Vertical-slot grille: body-colored bars over a black back panel, so the gaps look like black slots
    SLOTS, SLOT_W, BAR_W = 8, 1.1, 0.6
    grille_w = SLOTS * SLOT_W + (SLOTS + 1) * BAR_W
    gx0 = -grille_w / 2
    result += [
        box(gx0, DIMS.front_bumper.grille_bottom_y + 0.5, DIMS.hood.front_z, -gx0, 16.5, DIMS.hood.front_z + 0.2, "grille"),  # back panel
        box(gx0 - 0.5, 16.5, DIMS.hood.front_z, -gx0 + 0.5, DIMS.hood.top_y, DIMS.hood.front_z + 0.6, "body"),  # top frame
        box(gx0 - 0.5, DIMS.front_bumper.grille_bottom_y, DIMS.hood.front_z, -gx0 + 0.5, DIMS.front_bumper.grille_bottom_y + 0.5, DIMS.hood.front_z + 0.6, "body"),  # bottom frame
    ]
    for i in range(SLOTS + 1):
        x = gx0 + i * (SLOT_W + BAR_W)
        result.append(box(x, DIMS.front_bumper.grille_bottom_y + 0.5, DIMS.hood.front_z + 0.2, x + BAR_W, 16.5, DIMS.hood.front_z + 0.6, "body"))
    return result


def roof_edge_cubes():
    # The hardtop's thick side edge stands a little proud of the doors and drops over their frames' top rails
    return [box(DIMS.chassis.body_half_width, DIMS.greenhouse.roof_y - 0.4, DIMS.chassis.rear_z, 13.4, DIMS.greenhouse.roof_top + 0.2, DIMS.windshield.roof_front, "hardtop")]


def roof_rib_cubes():
    # Ribs on the hardtop: two front panels split down the middle over the front seats, a seam across,
    # and long ribs running back over the rear panel
    return [
        box(-0.15, DIMS.greenhouse.roof_top, DIMS.cabin.roof_seam_z, 0.15, DIMS.greenhouse.roof_top + 0.05, DIMS.windshield.roof_front - 0.5, "grille"),
        box(-DIMS.chassis.body_half_width, DIMS.greenhouse.roof_top, DIMS.cabin.roof_seam_z - 0.15, DIMS.chassis.body_half_width, DIMS.greenhouse.roof_top + 0.05, DIMS.cabin.roof_seam_z + 0.15, "grille"),
        *both_sides([box(x - 0.4, DIMS.greenhouse.roof_top, DIMS.cabin.roof_seam_z + 1.5, x + 0.4, DIMS.greenhouse.roof_top + 0.3, DIMS.windshield.roof_front - 1.5, "hardtop_rib")
                     for x in (3, 6.5, 10)]),
        *[box(x - 0.4, DIMS.greenhouse.roof_top, DIMS.chassis.rear_z + 2, x + 0.4, DIMS.greenhouse.roof_top + 0.3, DIMS.cabin.roof_seam_z - 1.5, "hardtop_rib")
          for x in (-10.5, -7, -3.5, 0, 3.5, 7, 10.5)],
    ]


def spare_rim_cubes():
    result = []
    result += disc("z", DIMS.spare.center, 2.3, DIMS.chassis.rear_z - 3.3, DIMS.chassis.rear_z - 3, (0, 30, 60), "rim")
    result += disc("z", DIMS.spare.center, 0.9, DIMS.chassis.rear_z - 3.5, DIMS.chassis.rear_z - 3.3, (0, 45), "trim")
    return result


def rear_glass_cubes():
    return [box(-DIMS.chassis.cabin_half_width, DIMS.greenhouse.window_bottom_y, DIMS.chassis.rear_z, DIMS.chassis.cabin_half_width, DIMS.greenhouse.window_top_y, DIMS.chassis.rear_z + 1, "rear_glass")]
