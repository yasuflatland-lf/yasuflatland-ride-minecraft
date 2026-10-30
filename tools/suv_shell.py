"""SUV body shell, panels, bumpers, doors and sealed windows."""

import math

from tool_loader import load_tool

dims = load_tool("suv_dims")
globals().update({k: v for k, v in vars(dims).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
body_paint = load_tool("suv_paint_body")
MIN_FLAKE_FACE_PX = body_paint.MIN_FLAKE_FACE_PX
HANDLE_BOTTOM_Y, HANDLE_TOP_Y = 14.4, 15.1
HANDLE_REAR_OFFSET, HANDLE_FRONT_OFFSET = 1.5, 4.5
HANDLE_OUTER_X = 13.35


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
arch_side_z = dims.arch_side_z


def windshield_part(x0, y0, z0, x1, y1, z1, color):
    return turned(box(x0, y0, z0, x1, y1, z1, color), WINDSHIELD_PIVOT, (WINDSHIELD_LEAN, 0, 0))


def leaning_top(y):
    """The unturned top of a windshield part whose face 0.5 px off the pivot should end at height y:
    leaning shortens its rise and lifts that face by its depth."""
    return HOOD_TOP_Y + (y - HOOD_TOP_Y - 0.5 * _LEAN_SIN) / _LEAN_COS


def fender_flare(z_center, front_leg_bottom, rear_leg_bottom):
    """A black trapezoid flare over a wheel on the +x side, like a Wrangler's: a flat top over the tire,
    a side sloping down and out at each end, and a leg under each slope that drops toward the bumper or
    the side step."""
    length = math.hypot(ARCH_TOP_Y - ARCH_FOOT_Y, ARCH_FOOT_Z - ARCH_TOP_HALF) + 0.6  # closes the corner
    slope = round(math.degrees(math.atan(ARCH_RUN_PER_RISE)), 3)
    x1 = FLARE_X
    cubes = [box(BODY_HALF_WIDTH, ARCH_TOP_Y, z_center - ARCH_TOP_HALF - 0.8, x1, ARCH_TOP_Y + FLARE_THICKNESS,
                 z_center + ARCH_TOP_HALF + 0.8, "trim")]
    # Each slope stands on its lower inner end and tips its top toward the wheel's center; a positive x
    # rotation here tips +y toward -z in game (see WINDSHIELD_LEAN).
    for side in (1, -1):
        z0 = z_center + side * ARCH_FOOT_Z
        z1 = z0 + side * FLARE_THICKNESS
        cubes.append(turned(box(BODY_HALF_WIDTH, ARCH_FOOT_Y, min(z0, z1), x1, ARCH_FOOT_Y + length, max(z0, z1), "trim"),
                            (BODY_HALF_WIDTH, ARCH_FOOT_Y, z0), (side * slope, 0, 0)))
    for side, leg_bottom in ((1, front_leg_bottom), (-1, rear_leg_bottom)):
        z0 = z_center + side * ARCH_FOOT_Z
        z1 = z0 + side * (FLARE_THICKNESS - 0.1)
        cubes.append(box(BODY_HALF_WIDTH, leg_bottom, min(z0, z1), x1, ARCH_FOOT_Y + 0.5, max(z0, z1), "trim"))
    return cubes


def arch_cut(x0, x1, y0, y1, z_back, z_front, z_center, color, step=0.5):
    """A side panel from z_back to z_front whose part below the arch top stops at the arch's slope: strips
    `step` tall, each ending at the slope's z at its lower edge so none pokes into the arch. The slope
    moves toward the axle as it rises, so each step leaves a sliver of at most 0.35 px outside the arch,
    which the flare covers; the panel's edge reads as the flare's outline."""
    cubes = []
    if y1 > ARCH_TOP_Y:
        cubes.append(box(x0, max(y0, ARCH_TOP_Y), z_back, x1, y1, z_front, color))
    y = y0
    while y < min(y1, ARCH_TOP_Y) - 1e-6:
        top = min(y + step, y1, ARCH_TOP_Y)
        front_cut, rear_cut = arch_side_z(z_center, 1, y), arch_side_z(z_center, -1, y)
        # The panel lies ahead of the arch, behind it, or on both sides of it
        if z_front > front_cut:
            cubes.append(box(x0, y, max(z_back, front_cut), x1, top, z_front, color))
        if z_back < rear_cut:
            cubes.append(box(x0, y, z_back, x1, top, min(z_front, rear_cut), color))
        y = top
    if color == "body":
        if z_back in (FRONT_DOOR_HINGE_Z, REAR + 1):
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
    assert cx > BODY_HALF_WIDTH
    radians = math.radians(angle)
    corner = turned(box(cx, y0, z_tip - chamfer * math.sin(radians), cx + chamfer / math.cos(radians), y1, z_tip, "trim"),
                    (cx, y0, z_tip), (0, angle, 0))
    side = box(cx, y0, z_end_back, half_width, y1, z_tip - chamfer * math.tan(radians), "trim")
    end = box(BODY_HALF_WIDTH, y0, z_end_back, cx, y1, z_tip, "trim")
    return [box(-BODY_HALF_WIDTH, y0, z_back, BODY_HALF_WIDTH, y1, z_tip, "trim"), *both_sides([corner, side, end])]


# Doors (ADR 0009). The +x side of this definition becomes the right side in game. The pivot sits on the hinge (front edge)
DOORS = {
    "door_fr": (+1, FRONT_DOOR_HINGE_Z, B_PILLAR_FRONT_Z),  # (side, front-edge z, rear-edge z)
    "door_rr": (+1, B_PILLAR_REAR_Z, CARGO_FRONT),
    "door_fl": (-1, FRONT_DOOR_HINGE_Z, B_PILLAR_FRONT_Z),
    "door_rl": (-1, B_PILLAR_REAR_Z, CARGO_FRONT),
}


def window_frame_piece(y0, z0, y1, z1):
    """A window frame bar: body-colored outside and black inside, like the door cards."""
    return [box(DOOR_FRAME_MID_X, y0, z0, BODY_HALF_WIDTH, y1, z1, "body"), box(CABIN_HALF_WIDTH, y0, z0, DOOR_FRAME_MID_X, y1, z1, "trim")]


def door(name):
    """A door with its window frame and a black door card inside, hinged at its front edge. The front
    doors carry the side mirrors, so the mirrors swing open with them."""
    side, z_front, z_back = DOORS[name]
    # Each door's lower corner nearest a wheel follows that wheel's arch
    axle = FRONT_AXLE_Z if z_front > 0 else REAR_AXLE_Z
    panel = arch_cut(CABIN_HALF_WIDTH, BODY_HALF_WIDTH, FLOOR_Y, BELT_Y, z_back, z_front, axle, "body")
    card = arch_cut(11.8, CABIN_HALF_WIDTH, FLOOR_Y + 1, BELT_Y - 1, z_back + 0.6, z_front - 0.6, axle, "trim")
    if z_front > 0:
        front_post = [windshield_part(x0, HOOD_TOP_Y, HOOD_REAR_Z - 2, x0 + 0.5, HOOD_TOP_Y + FRONT_POST_LENGTH, HOOD_REAR_Z - 1, color)
                      for x0, color in ((DOOR_FRAME_MID_X, "body"), (CABIN_HALF_WIDTH, "trim"))]
        front_post += window_frame_piece(BELT_Y, z_front - 1, HOOD_TOP_Y, z_front)
        top_front = ROOF_FRONT + 0.1
        side_mirror = [
            box(BODY_HALF_WIDTH, BELT_Y, z_front - 2, 14, BELT_Y + 1, z_front - 1, "body"),
            box(14, BELT_Y - 0.5, z_front - 2.5, 16.5, BELT_Y + 2.5, z_front - 1, "body"),
            box(14.2, BELT_Y, z_front - 2.7, 16.3, BELT_Y + 2, z_front - 2.5, "rim"),
        ]
    else:
        front_post = window_frame_piece(BELT_Y, z_front - 1, ROOF_Y, z_front)
        top_front = z_front
        side_mirror = []
    cubes = [
        *panel,
        *card,
        *front_post,
        box(BODY_HALF_WIDTH, HANDLE_BOTTOM_Y, z_back + HANDLE_REAR_OFFSET, HANDLE_OUTER_X, HANDLE_TOP_Y, z_back + HANDLE_FRONT_OFFSET, "grille"),  # door handle, near the rear edge
        *window_frame_piece(BELT_Y, z_back, ROOF_Y, z_back + 1),  # rear post
        *window_frame_piece(WINDOW_TOP_Y, z_back, ROOF_Y, top_front),  # top rail
        *side_mirror,
    ]
    return {
        "name": name,
        "parent": "body",
        "pivot": [DOOR_FRAME_MID_X * side, 12, z_front],
        "cubes": cubes if side > 0 else [mirrored(c) for c in cubes],
    }


# The side windows and the windshield are open frames. Under water (ADR 0040) plates fill them, flush
# with the outside of the frames, in the same blue as the rear glass. The front side window is a
# trapezoid, so 1 px strips step down along the leaning front post. Each strip reaches from its lower
# end a little into the post, which the post hides, and sits 0.05 px inside the frame's outer face so
# the overlap does not fight the post for the same plane.
def front_post_back(y):
    """z of the rear face of the front door's leaning post at height y, which starts 1.5 px behind the pivot."""
    y0, z0 = WINDSHIELD_PIVOT[1] - 1.5 * _LEAN_SIN, WINDSHIELD_PIVOT[2] - 1.5 * _LEAN_COS
    return z0 - (y - y0) * _LEAN_TAN


def front_side_panes():
    # Split at the cowl height as well as each pixel: every strip end stays hidden in either
    # the upright foot or the raked post, even when the belt and roof are fractional pixels.
    panes = []
    y = WINDOW_BOTTOM_Y
    while y < WINDOW_TOP_Y - 1e-6:
        if y < HOOD_TOP_Y:
            top = min(y + 1, HOOD_TOP_Y)
            front = FRONT_DOOR_HINGE_Z - 1
        else:
            top = min(y + 1, WINDOW_TOP_Y)
            front = front_post_back(y) + 0.2
        panes.append(box(12.85, y, -4, 12.95, top, front, "rear_glass"))
        y = top
    return panes


def windows_sealed():
    return [
        windshield_part(-CABIN_HALF_WIDTH, HOOD_TOP_Y + 1, HOOD_REAR_Z - 0.1, CABIN_HALF_WIDTH, leaning_top(ROOF_Y), HOOD_REAR_Z, "rear_glass"),
        *both_sides([
            *front_side_panes(),
            box(12.9, WINDOW_BOTTOM_Y, CARGO_FRONT + 1, BODY_HALF_WIDTH, WINDOW_TOP_Y, -7, "rear_glass"),
        ]),
    ]


def chassis_cubes():
    return [
        # Chassis and floor
        box(-BODY_HALF_WIDTH, SILL_Y, REAR + 1, BODY_HALF_WIDTH, FLOOR_Y, FRONT - 1, "trim"),
    ]


def hood_cubes():
    return [
        # Hood (engine compartment) above the front arches; its lower sides follow the arches below
        panel_face(box(-BODY_HALF_WIDTH, ARCH_TOP_Y, HOOD_REAR_Z, BODY_HALF_WIDTH, HOOD_TOP_Y, FRONT, "body"), "hood_top", "up"),
        box(-ARCH_LINER_X, FLOOR_Y, HOOD_REAR_Z, ARCH_LINER_X, ARCH_TOP_Y, FRONT, "body"),
    ]


def windshield_frame_cubes():
    return [
        # Windshield lower frame and A-pillars, leaning back
        windshield_part(-CABIN_HALF_WIDTH, HOOD_TOP_Y, WINDSHIELD_FOOT_Z, CABIN_HALF_WIDTH, HOOD_TOP_Y + 1, HOOD_REAR_Z, "trim"),
    ]


def a_pillar_cubes():
    return [windshield_part(CABIN_HALF_WIDTH, HOOD_TOP_Y, HOOD_REAR_Z - 1, BODY_HALF_WIDTH, leaning_top(ROOF_TOP), HOOD_REAR_Z, "body")]


def rearview_mirror_cubes():
    return [
        # Rearview mirror (center of the windshield's top edge, behind the leaning glass)
        box(-0.5, ROOF_Y - 2.5, ROOF_FRONT - 0.8, 0.5, ROOF_Y, ROOF_FRONT - 0.3, "trim"),
        box(-2.5, ROOF_Y - 4, ROOF_FRONT - 1.3, 2.5, ROOF_Y - 2.5, ROOF_FRONT - 0.8, "rim"),
    ]


def roof_cubes():
    return [
        # Black hardtop roof
        box(-BODY_HALF_WIDTH, ROOF_Y, REAR, BODY_HALF_WIDTH, ROOF_TOP, ROOF_FRONT, "hardtop"),
    ]


def b_pillar_cubes():
    # B-pillars run down to the floor so they close the gap between the front and rear doors.
    return [box(CABIN_HALF_WIDTH, FLOOR_Y, B_PILLAR_REAR_Z, BODY_HALF_WIDTH, ROOF_Y, B_PILLAR_FRONT_Z, "body")]


def cargo_upper_side_cubes():
    # Cargo area sides: body-colored below the belt line, the black hardtop above it with a closed,
    # tinted quarter window
    return [
        box(CABIN_HALF_WIDTH, BELT_Y, REAR, BODY_HALF_WIDTH, ROOF_Y, CARGO_FRONT, "hardtop"),
        box(BODY_HALF_WIDTH, WINDOW_BOTTOM_Y, REAR + 2.5, 13.1, WINDOW_TOP_Y, CARGO_FRONT - 1.5, "glass"),
    ]


def cargo_floor_cubes():
    return [
        # Cargo floor
        box(-CABIN_HALF_WIDTH, FLOOR_Y, REAR + 1, CABIN_HALF_WIDTH, FLOOR_Y + 0.3, CARGO_FRONT, "hardtop"),
    ]


def tailgate_cubes():
    return [
        # Rear: body-colored tailgate, and the hardtop's header over the rear window with the third brake
        # light under it. On the ground the rear window stays open; the rear_glass bone closes it in the
        # other forms (ADR 0026).
        panel_face(box(-BODY_HALF_WIDTH, FLOOR_Y, REAR, BODY_HALF_WIDTH, BELT_Y, REAR + 1, "body"), "tailgate", "north"),
        box(-BODY_HALF_WIDTH, WINDOW_TOP_Y, REAR, BODY_HALF_WIDTH, ROOF_Y, REAR + 1, "hardtop"),
    ]


def tailgate_hinge_cubes():
    # The tailgate hinges sit on the right.
    return [
        box(6.2, 14.2, REAR - 0.3, 9.0, 15.2, REAR, "body"),
        box(6.2, 10.4, REAR - 0.3, 9.0, 11.4, REAR, "body"),
    ]


def exhaust_cubes():
    return [
        # Exhaust pipe (rear right = +x side, sticking out backward from under the rear bumper)
        box(8, SILL_Y - 2.2, REAR - 2, 10, SILL_Y - 0.6, REAR_AXLE_Z - 1, "trim"),
        box(7.75, SILL_Y - 2.45, REAR - 2.5, 10.25, SILL_Y - 0.35, REAR - 2, "rim"),
    ]


def side_step_cubes():
    # Side steps run between the fender flares.
    return [box(BODY_HALF_WIDTH, SILL_Y, STEP_REAR_Z, HUB_X, STEP_TOP_Y, STEP_FRONT_Z, "trim")]


def hood_dome_and_cowl_cubes():
    # Hood: a raised power dome, a black mesh vent on each side of it, washer nozzles, the cowl's vent
    # strip with the wipers parked on it, and the latches at the rear corners
    return [
        box(-9.5, HOOD_TOP_Y, HOOD_REAR_Z + 2, 9.5, HOOD_TOP_Y + 0.4, FRONT - 0.4, "body"),
        box(-8.5, HOOD_TOP_Y + 0.4, HOOD_REAR_Z + 2.6, 8.5, HOOD_TOP_Y + 0.7, FRONT - 0.9, "body"),
        box(-BODY_HALF_WIDTH, HOOD_TOP_Y, HOOD_REAR_Z, BODY_HALF_WIDTH, HOOD_TOP_Y + 0.3, HOOD_REAR_Z + 1.6, "trim"),  # cowl
        box(-3, HOOD_TOP_Y + 0.3, HOOD_REAR_Z + 0.4, 3, HOOD_TOP_Y + 0.4, HOOD_REAR_Z + 1.3, "grille"),  # cowl vent
    ]


def hood_detail_cubes():
    return [
        box(10, HOOD_TOP_Y, FRONT - 7.5, 12.2, HOOD_TOP_Y + 0.5, FRONT - 2.5, "grille"),  # vent
        *[box(10.2, HOOD_TOP_Y + 0.5, z, 12.0, HOOD_TOP_Y + 0.6, z + 0.35, "trim") for z in (FRONT - d for d in (7, 6.1, 5.2, 4.3, 3.4))],  # vent mesh
        box(2.4, HOOD_TOP_Y + 0.7, FRONT - 4, 3.2, HOOD_TOP_Y + 1.1, FRONT - 3, "grille"),  # washer nozzle
        box(11.4, HOOD_TOP_Y - 0.8, HOOD_REAR_Z + 0.8, 12.6, HOOD_TOP_Y + 0.7, HOOD_REAR_Z + 2.2, "grille"),  # latch
        turned(box(1, HOOD_TOP_Y + 0.3, HOOD_REAR_Z + 0.6, 9.5, HOOD_TOP_Y + 0.6, HOOD_REAR_Z + 0.9, "grille"), (1, HOOD_TOP_Y + 0.3, HOOD_REAR_Z + 0.75), (0, -8, 0)),  # wiper
    ]


def hood_lower_side_cubes():
    # The hood's lower sides, cut along the front arch, outside the liners. They reach back to the front
    # door's hinge: with the front arch moved forward, its flare no longer hides the gap under the cowl.
    return arch_cut(ARCH_LINER_X, BODY_HALF_WIDTH, FLOOR_Y, ARCH_TOP_Y, FRONT_DOOR_HINGE_Z, FRONT, FRONT_AXLE_Z, "body")


def cowl_side_cubes():
    return [box(ARCH_LINER_X, ARCH_TOP_Y, FRONT_DOOR_HINGE_Z, BODY_HALF_WIDTH, HOOD_TOP_Y, HOOD_REAR_Z, "body")]


def cargo_lower_side_cubes():
    # The cargo area's body-colored side below the belt line, cut along the rear arch
    return arch_cut(CABIN_HALF_WIDTH, BODY_HALF_WIDTH, FLOOR_Y, BELT_Y, REAR + 1, CARGO_FRONT, REAR_AXLE_Z, "body")


def fuel_door_cubes():
    # Round fuel door on the left side of the cargo area, behind the rear flare and under the belt line
    return disc("x", (-BODY_HALF_WIDTH, 14.8, REAR + 2.7), 1.2, -BODY_HALF_WIDTH - 0.25, -BODY_HALF_WIDTH, [i * 11.25 for i in range(8)], "grille")  # 32 sides


def arch_liner_cubes():
    # Black inner liners behind each arch, so the cabin does not show through it. The front arch sits
    # close enough to the hood's front face that an unclipped liner would stick out ahead of the grille.
    return [
        box(ARCH_LINER_X, ARCH_FOOT_Y - 1, z - ARCH_FOOT_Z - 0.5, 11.6, ARCH_TOP_Y + 0.5, min(z + ARCH_FOOT_Z + 0.5, FRONT), "grille")
        for z in (FRONT_AXLE_Z, REAR_AXLE_Z)
    ]


def front_bumper_lower_cubes():
    # Front bumper: a low bar under the grille, between a tucked-in lower lip and a slightly set-back top
    # edge, standing on two frame horns that reach forward from the chassis
    return chamfered_bar(FRONT_BUMPER_BOTTOM_Y, FRONT_BUMPER_BAND_BOTTOM_Y, FRONT_BUMPER_BACK_Z, FRONT_BUMPER_TIP_Z - 1,
                          FRONT_BUMPER_END_BACK_Z, BUMPER_HALF_WIDTH - 1, 1.2)


def front_bumper_band_cubes():
    return chamfered_bar(FRONT_BUMPER_BAND_BOTTOM_Y, FRONT_BUMPER_BAND_TOP_Y, FRONT_BUMPER_BACK_Z, FRONT_BUMPER_TIP_Z,
                          FRONT_BUMPER_END_BACK_Z, BUMPER_HALF_WIDTH, 2)


def front_bumper_top_cubes():
    return chamfered_bar(FRONT_BUMPER_BAND_TOP_Y, FRONT_BUMPER_TOP_Y, FRONT_BUMPER_BACK_Z, FRONT_BUMPER_TIP_Z - 0.5,
                          FRONT_BUMPER_END_BACK_Z, BUMPER_HALF_WIDTH - 0.5, 1.7)


def rear_bumper_cubes():
    # Rear bumper: the same kind of bar facing backward, with red reflectors at its ends and red tow
    # hooks under it
    return [facing_back(c) for c in chamfered_bar(REAR_BUMPER_BOTTOM_Y, REAR_BUMPER_TOP_Y, -REAR_BUMPER_TIP_Z - REAR_BUMPER_LENGTH, -REAR_BUMPER_TIP_Z,
                                                   -REAR_AXLE_Z + BUMPER_END_CLEARANCE, BUMPER_HALF_WIDTH, REAR_BUMPER_CHAMFER)]


def frame_horn_cubes():
    return [box(5, SILL_Y, FRONT - 1.5, 7, FLOOR_Y, FRONT_BUMPER_BACK_Z + 0.5, "trim")]


def front_tow_hook_cubes():
    # Tow hooks standing on the bar's top, outboard of the grille's middle slots
    return [box(5.2, FRONT_BUMPER_TOP_Y, FRONT_BUMPER_TIP_Z - 2, 5.9, FRONT_BUMPER_TOP_Y + 1, FRONT_BUMPER_TIP_Z - 0.8, "rim")]


def rear_tow_hook_cubes():
    return [
        box(7.4, SILL_Y - 2.2, REAR - 1.2, 8.4, REAR_BUMPER_BOTTOM_Y, REAR + 1, "tail"),  # tow hook
    ]


def grille_cubes():
    result = []
    # Vertical-slot grille: body-colored bars over a black back panel, so the gaps look like black slots
    SLOTS, SLOT_W, BAR_W = 8, 1.1, 0.6
    grille_w = SLOTS * SLOT_W + (SLOTS + 1) * BAR_W
    gx0 = -grille_w / 2
    result += [
        box(gx0, GRILLE_BOTTOM_Y + 0.5, FRONT, -gx0, 16.5, FRONT + 0.2, "grille"),  # back panel
        box(gx0 - 0.5, 16.5, FRONT, -gx0 + 0.5, HOOD_TOP_Y, FRONT + 0.6, "body"),  # top frame
        box(gx0 - 0.5, GRILLE_BOTTOM_Y, FRONT, -gx0 + 0.5, GRILLE_BOTTOM_Y + 0.5, FRONT + 0.6, "body"),  # bottom frame
    ]
    for i in range(SLOTS + 1):
        x = gx0 + i * (SLOT_W + BAR_W)
        result.append(box(x, GRILLE_BOTTOM_Y + 0.5, FRONT + 0.2, x + BAR_W, 16.5, FRONT + 0.6, "body"))
    return result


def roof_edge_cubes():
    # The hardtop's thick side edge stands a little proud of the doors and drops over their frames' top rails
    return [box(BODY_HALF_WIDTH, ROOF_Y - 0.4, REAR, 13.4, ROOF_TOP + 0.2, ROOF_FRONT, "hardtop")]


def roof_rib_cubes():
    # Ribs on the hardtop: two front panels split down the middle over the front seats, a seam across,
    # and long ribs running back over the rear panel
    return [
        box(-0.15, ROOF_TOP, ROOF_SEAM, 0.15, ROOF_TOP + 0.05, ROOF_FRONT - 0.5, "grille"),
        box(-BODY_HALF_WIDTH, ROOF_TOP, ROOF_SEAM - 0.15, BODY_HALF_WIDTH, ROOF_TOP + 0.05, ROOF_SEAM + 0.15, "grille"),
        *both_sides([box(x - 0.4, ROOF_TOP, ROOF_SEAM + 1.5, x + 0.4, ROOF_TOP + 0.3, ROOF_FRONT - 1.5, "hardtop_rib")
                     for x in (3, 6.5, 10)]),
        *[box(x - 0.4, ROOF_TOP, REAR + 2, x + 0.4, ROOF_TOP + 0.3, ROOF_SEAM - 1.5, "hardtop_rib")
          for x in (-10.5, -7, -3.5, 0, 3.5, 7, 10.5)],
    ]


def spare_rim_cubes():
    result = []
    result += disc("z", SPARE, 2.3, REAR - 3.3, REAR - 3, (0, 30, 60), "rim")
    result += disc("z", SPARE, 0.9, REAR - 3.5, REAR - 3.3, (0, 45), "trim")
    return result


def rear_glass_cubes():
    return [box(-CABIN_HALF_WIDTH, WINDOW_BOTTOM_Y, REAR, CABIN_HALF_WIDTH, WINDOW_TOP_Y, REAR + 1, "rear_glass")]
