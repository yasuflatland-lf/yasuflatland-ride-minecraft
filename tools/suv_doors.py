"""SUV doors and their window frames."""

from tool_loader import load_tool

DIMS = load_tool("suv_dims").DIMS
shell = load_tool("suv_shell")
box = shell.box
windshield_part = shell.windshield_part
arch_cut = shell.arch_cut
suv_cubes = load_tool("suv_cubes")
mirrored = suv_cubes.mirrored
HANDLE_BOTTOM_Y, HANDLE_TOP_Y = DIMS.greenhouse.belt_y - 4, DIMS.greenhouse.belt_y - 3.3
HANDLE_REAR_OFFSET, HANDLE_FRONT_OFFSET = 1.5, 4.5
HANDLE_OUTER_X = 13.5
HANDLE_POST_DEPTH = 0.15
HANDLE_POST_LENGTH = 0.5
SKIN_INNER_X = DIMS.chassis.door_frame_mid_x
HINGE_HEIGHT = 1.6
HINGE_LEAF_DEPTH, HINGE_KNUCKLE_DEPTH = 0.3, 0.5
HINGE_LEAF_REAR_OFFSET, HINGE_KNUCKLE_REAR_OFFSET = 1.8, 0.5
HINGE_UPPER_CENTER_Y = DIMS.greenhouse.belt_y - 3.7
HINGE_LOWER_CENTER_Y = DIMS.chassis.floor_y + 3.4


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
    skin = arch_cut(SKIN_INNER_X, DIMS.chassis.body_half_width, DIMS.chassis.floor_y + 1, DIMS.greenhouse.belt_y, z_back, z_front, axle, "body")
    for bottom_offset, rear_offset in ((0, 0.75), (0.5, 0.25)):
        skin += arch_cut(SKIN_INNER_X, DIMS.chassis.body_half_width, DIMS.chassis.floor_y + bottom_offset, DIMS.chassis.floor_y + bottom_offset + 0.5, z_back + rear_offset, z_front, axle, "body")
    # The stepped corner shares the full panel's texture coordinates to keep its seams aligned.
    for cube in skin:
        _, bottom, back = cube["origin"]
        shell.panel_face(cube, "door_front" if z_front > 0 else "door_rear", "east",
                         (back - z_back, DIMS.greenhouse.belt_y - bottom - cube["size"][1]))
    frame = arch_cut(DIMS.chassis.cabin_half_width, SKIN_INNER_X, DIMS.chassis.floor_y, DIMS.greenhouse.belt_y, z_back, z_front, axle, "body")
    hinges = []
    for center_y in (HINGE_UPPER_CENTER_Y, HINGE_LOWER_CENTER_Y):
        bottom, top = center_y - HINGE_HEIGHT / 2, center_y + HINGE_HEIGHT / 2
        hinges += [
            box(DIMS.chassis.body_half_width, bottom, z_front - HINGE_LEAF_REAR_OFFSET, DIMS.chassis.body_half_width + HINGE_LEAF_DEPTH, top, z_front - HINGE_KNUCKLE_REAR_OFFSET, "body"),
            box(DIMS.chassis.body_half_width, bottom, z_front - HINGE_KNUCKLE_REAR_OFFSET, DIMS.chassis.body_half_width + HINGE_KNUCKLE_DEPTH, top, z_front, "body"),
        ]
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
        *skin,
        *frame,
        *card,
        *front_post,
        *hinges,
        box(DIMS.chassis.body_half_width + HANDLE_POST_DEPTH, HANDLE_BOTTOM_Y, z_back + HANDLE_REAR_OFFSET, HANDLE_OUTER_X, HANDLE_TOP_Y, z_back + HANDLE_FRONT_OFFSET, "grille"),
        *[box(DIMS.chassis.body_half_width, HANDLE_BOTTOM_Y, z, DIMS.chassis.body_half_width + HANDLE_POST_DEPTH, HANDLE_TOP_Y, z + HANDLE_POST_LENGTH, "grille")
          for z in (z_back + HANDLE_REAR_OFFSET, z_back + HANDLE_FRONT_OFFSET - HANDLE_POST_LENGTH)],
        *window_frame_piece(DIMS.greenhouse.belt_y, z_back, DIMS.greenhouse.roof_y, z_back + 1),  # rear post
        *window_frame_piece(DIMS.greenhouse.window_top_y, z_back, DIMS.greenhouse.roof_y, top_front),  # top rail
        *side_mirror,
    ]
    return {
        "name": name,
        "parent": "body",
        "pivot": [DIMS.chassis.door_frame_mid_x * side, DIMS.chassis.floor_y + 4, z_front],
        "cubes": cubes if side > 0 else [mirrored(c) for c in cubes],
    }
