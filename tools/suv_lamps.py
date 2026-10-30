"""SUV lamp pieces and color-based lens extraction."""

import math

from tool_loader import load_tool

dims = load_tool("suv_dims")
globals().update({k: v for k, v in vars(dims).items() if k.isupper()})
uv = load_tool("suv_atlas").uv
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
round_face = suv_cubes.round_face
arch_side_z = dims.arch_side_z
flare_face_z = dims.flare_face_z


def round_lamp(cx, cy, r, ring, lens, z0, z1):
    """Make a round-looking lamp from a rim of small blocks on a circle plus a cross-shaped lens."""
    cubes = []
    for a in range(0, 360, 30):
        x = cx + r * math.cos(math.radians(a))
        y = cy + r * math.sin(math.radians(a))
        cubes.append(box(x - 0.5, y - 0.5, z0, x + 0.5, y + 0.5, z1, ring))
    k = r * 0.75
    cubes += [
        box(cx - k, cy - k * 0.55, z0, cx + k, cy + k * 0.55, z1 + 0.05, lens),
        box(cx - k * 0.55, cy - k, z0, cx + k * 0.55, cy + k, z1 + 0.05, lens),
    ]
    return cubes


def headlight_cubes():
    result = []
    # Round headlights (left and right)
    for side in (+1, -1):
        result += round_lamp(10.3 * side, 12.3, 2.3, "trim", "light", FRONT, FRONT + 0.6)
    return result


def fog_lamp_cubes():
    # Round fog lamps in black pockets near the front bumper's ends, inboard of the bar's cut corners so
    # they sit on its straight face
    return [
        box(FOG_X - 1.3, FOG_Y - 1.05, FRONT_BUMPER_TIP_Z, FOG_X + 1.3, FOG_Y + 1.05, FRONT_BUMPER_TIP_Z + 0.05, "grille"),
        *round_face((FOG_X, FOG_Y, 0), 0.8, FRONT_BUMPER_TIP_Z + 0.05, FRONT_BUMPER_TIP_Z + 0.12, "light"),
    ]


def lamp_strip_and_turn_signal_cubes():
    return [
        # Beside the headlights (center y 12.3): a light strip standing a little proud of the front flare's
        # sloping front face, and the turn signal on the flare's outer side
        box(13.3, LAMP_Y0, flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y1) - 0.2, FLARE_X - 0.2, LAMP_Y1,
            flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y0) + 0.1, "light"),
        box(FLARE_X, LAMP_Y0, arch_side_z(FRONT_AXLE_Z, 1, LAMP_Y0) + 0.6, FLARE_X + 0.1, LAMP_Y1,
            flare_face_z(FRONT_AXLE_Z, 1, LAMP_Y1) - 0.1, "amber"),
    ]


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


def split_lamps(cubes):
    # Lamp lenses (the "light" swatch: headlights and fog lamps) get a bone of their own, so the render
    # controller can give them a glowing material while the headlights are on (ADR 0020)
    light_uv = uv("light")
    headlights = [c for c in cubes if c["uv"] == light_uv]
    body = [c for c in cubes if c["uv"] != light_uv]
    return body, headlights
