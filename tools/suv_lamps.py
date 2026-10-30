"""SUV lamp pieces and their bone assignments."""

from typing import NamedTuple

from tool_loader import load_tool

dims = load_tool("suv_dims")
globals().update({k: v for k, v in vars(dims).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
round_face = suv_cubes.round_face
arch_side_z = dims.arch_side_z
flare_face_z = dims.flare_face_z


class LampPart(NamedTuple):
    name: str
    bone: str


# The only place that maps a lamp part to its bone: headlights, headlight_bezels,
# tail_lights, or body.
LAMP_PARTS: tuple[LampPart, ...] = (
    LampPart("headlight_bezel", "headlight_bezels"),
    LampPart("headlight_lens", "headlights"),
    LampPart("fog_pocket", "body"),
    LampPart("fog_lens", "headlights"),
    LampPart("front_strip", "headlights"),
    LampPart("turn_signal", "body"),
    LampPart("third_brake_light", "tail_lights"),
    LampPart("tail_light", "tail_lights"),
    LampPart("bumper_reflector", "body"),
)


HEADLIGHT_CENTERS = ((10.3, 12.3), (-10.3, 12.3))
HEADLIGHT_DIAMETER = 5.6
HEADLIGHT_THICKNESS = 0.1
HEADLIGHT_FRONT = FRONT + 0.65
BEZEL_SCALE = 1.25
BEZEL_THICKNESS = 0.05
BEZEL_FRONT_GAP = 0.05


def headlight_panel(region, diameter, front, thickness):
    spec = load_tool("suv_atlas").region_spec("headlight", region)
    # The back face needs the same hole so the thin panel cannot cover the lens behind it.
    mapped = ("north", "south") if region == "bezel" else ("south",)
    faces = suv_cubes.region_faces("headlight", region,
                                   {face: (0, 0, spec.w, spec.h) for face in mapped})
    half = diameter / 2
    return [box(cx - half, cy - half, front - thickness,
                cx + half, cy + half, front, faces)
            for cx, cy in HEADLIGHT_CENTERS]


def headlight_bezel_cubes():
    return headlight_panel("bezel", HEADLIGHT_DIAMETER * BEZEL_SCALE,
                           HEADLIGHT_FRONT + BEZEL_FRONT_GAP, BEZEL_THICKNESS)


def headlight_lens_cubes():
    return headlight_panel("lens", HEADLIGHT_DIAMETER, HEADLIGHT_FRONT, HEADLIGHT_THICKNESS)


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
