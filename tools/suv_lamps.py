"""SUV lamp pieces and their bone assignments."""

import math

from tool_loader import load_tool

dims = load_tool("suv_dims")
globals().update({k: v for k, v in vars(dims).items() if k.isupper()})
palette = load_tool("suv_palette")
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
round_face = suv_cubes.round_face
arch_side_z = dims.arch_side_z
flare_face_z = dims.flare_face_z


PART_BONES = {
    "headlight_ring": "body",
    "headlight_lens": "headlights",
    "fog_pocket": "body",
    "fog_lens": "headlights",
    "front_strip": "headlights",
    "turn_signal": "body",
    "third_brake_light": "tail_lights",
    "tail_light": "tail_lights",
    "bumper_reflector": "body",
}


# Round headlights (left and right): a rim of small blocks on a circle around a cross-shaped lens
HEADLIGHT_CENTERS = ((10.3, 12.3), (-10.3, 12.3))
HEADLIGHT_RADIUS = 2.3
HEADLIGHT_Z0, HEADLIGHT_Z1 = FRONT, FRONT + 0.6


def headlight_ring_cubes():
    cubes = []
    for cx, cy in HEADLIGHT_CENTERS:
        for a in range(0, 360, 30):
            x = cx + HEADLIGHT_RADIUS * math.cos(math.radians(a))
            y = cy + HEADLIGHT_RADIUS * math.sin(math.radians(a))
            cubes.append(box(x - 0.5, y - 0.5, HEADLIGHT_Z0, x + 0.5, y + 0.5, HEADLIGHT_Z1, "trim"))
    return cubes


def headlight_lens_cubes():
    cubes = []
    k = HEADLIGHT_RADIUS * 0.75
    for cx, cy in HEADLIGHT_CENTERS:
        cubes += [
            box(cx - k, cy - k * 0.55, HEADLIGHT_Z0, cx + k, cy + k * 0.55, HEADLIGHT_Z1 + 0.05, "light"),
            box(cx - k * 0.55, cy - k, HEADLIGHT_Z0, cx + k * 0.55, cy + k, HEADLIGHT_Z1 + 0.05, "light"),
        ]
    return cubes


def fog_pocket_cubes():
    # Round fog lamps sit in black pockets on the straight face of the front bumper.
    return [box(FOG_X - 1.3, FOG_Y - 1.05, FRONT_BUMPER_TIP_Z, FOG_X + 1.3, FOG_Y + 1.05, FRONT_BUMPER_TIP_Z + 0.05, "grille")]


def fog_lens_cubes():
    return round_face((FOG_X, FOG_Y, 0), 0.8, FRONT_BUMPER_TIP_Z + 0.05, FRONT_BUMPER_TIP_Z + 0.12, "light")


def front_strip_cubes():
    # The strip stands a little proud of the front flare's sloping front face.
    return [box(13.3, LAMP_Y0, flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y1) - 0.2, FLARE_X - 0.2, LAMP_Y1,
                flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y0) + 0.1, "light")]


def turn_signal_cubes():
    # On the front flare's outer side, beside the strip
    return [box(FLARE_X, LAMP_Y0, arch_side_z(FRONT_AXLE_Z, 1, LAMP_Y0) + 0.6, FLARE_X + 0.1, LAMP_Y1,
                flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y1) - 0.1, "amber")]


def third_brake_light_cubes():
    return [
        box(-1.5, WINDOW_TOP_Y - 0.7, REAR - 0.2, 1.5, WINDOW_TOP_Y, REAR, "tail"),
    ]


def tail_light_cubes():
    # Tall tail lights at the rear corners
    return [box(9.6, 10, REAR - 0.3, 12.8, 16, REAR, "tail")]


def bumper_reflector_cubes():
    return [
        box(REFLECTOR_X1 - 2.5, REAR_BUMPER_BOTTOM_Y + 0.8, REAR_BUMPER_TIP_Z - 0.1, REFLECTOR_X1, REAR_BUMPER_TOP_Y - 0.8, REAR_BUMPER_TIP_Z, "tail"),  # reflector
    ]
