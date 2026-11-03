"""SUV lamp pieces and their bone assignments."""

from typing import NamedTuple

from tool_loader import load_tool

dims = load_tool("suv_dims")
DIMS = dims.DIMS
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
round_face = suv_cubes.round_face


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
    LampPart("tail_resin", "body"),
    LampPart("bumper_reflector", "body"),
)


HEADLIGHT_CENTERS = ((10.3, DIMS.arch.top_y), (-10.3, DIMS.arch.top_y))
HEADLIGHT_DIAMETER = 5.6
HEADLIGHT_THICKNESS = 0.1
HEADLIGHT_FRONT = DIMS.hood.front_z + 0.65
BEZEL_SCALE = 1.25
BEZEL_THICKNESS = 0.05
BEZEL_FRONT_GAP = 0.05


def headlight_panel(region, diameter, front, thickness, faces: tuple[str, ...]):
    spec = load_tool("suv_atlas").region_spec("headlight", region)
    uv = suv_cubes.region_faces("headlight", region,
                                {face: (0, 0, spec.w, spec.h) for face in faces})
    half = diameter / 2
    return [box(cx - half, cy - half, front - thickness,
                cx + half, cy + half, front, uv)
            for cx, cy in HEADLIGHT_CENTERS]


def headlight_bezel_cubes():
    # The back face needs the same hole so the thin panel cannot cover the lens behind it.
    return headlight_panel("bezel", HEADLIGHT_DIAMETER * BEZEL_SCALE,
                           HEADLIGHT_FRONT + BEZEL_FRONT_GAP, BEZEL_THICKNESS, ("north", "south"))


def headlight_lens_cubes():
    return headlight_panel("lens", HEADLIGHT_DIAMETER, HEADLIGHT_FRONT, HEADLIGHT_THICKNESS, ("south",))


def fog_pocket_cubes():
    lamps = DIMS.lamps
    return [box(lamps.fog_x - lamps.fog_pocket_width / 2, lamps.fog_y - lamps.fog_pocket_height / 2,
                DIMS.front_bumper.tip_z,
                lamps.fog_x + lamps.fog_pocket_width / 2, lamps.fog_y + lamps.fog_pocket_height / 2,
                DIMS.front_bumper.tip_z + 0.05, "grille")]


def fog_lens_cubes():
    # The reference keeps round lamps inside its rectangular pockets.
    return round_face((DIMS.lamps.fog_x, DIMS.lamps.fog_y, 0), DIMS.lamps.fog_lens_radius,
                      DIMS.front_bumper.tip_z + 0.05, DIMS.front_bumper.tip_z + 0.12, "light")


def front_strip_cubes():
    # The strip stands a little proud of the front flare's sloping front face.
    return [box(13.3, DIMS.lamps.y0, DIMS.arch.flare_face_z(DIMS.wheels.front_axle_z, 1, DIMS.lamps.y1) - 0.2, DIMS.flare.x - 0.2, DIMS.lamps.y1,
                DIMS.arch.flare_face_z(DIMS.wheels.front_axle_z, 1, DIMS.lamps.y0) + 0.1, "light")]


def turn_signal_cubes():
    # On the front flare's outer side, beside the strip
    return [box(DIMS.flare.x, DIMS.lamps.y0, DIMS.arch.side_z(DIMS.wheels.front_axle_z, 1, DIMS.lamps.y0) + 0.6, DIMS.flare.x + 0.1, DIMS.lamps.y1,
                DIMS.arch.flare_face_z(DIMS.wheels.front_axle_z, 1, DIMS.lamps.y1) - 0.1, "amber")]


def third_brake_light_cubes():
    return [
        box(-1.5, DIMS.greenhouse.window_top_y - 0.7, DIMS.chassis.rear_z - 0.2, 1.5, DIMS.greenhouse.window_top_y, DIMS.chassis.rear_z,
            suv_cubes.region_faces("tail_lamp", "third_brake", {"north": (0, 0, 12, 3)})),
    ]


def tail_light_cubes():
    return [box(9.6, DIMS.chassis.floor_y + 2, DIMS.chassis.rear_z - 0.3, 12.6, DIMS.greenhouse.belt_y - 2, DIMS.chassis.rear_z,
                suv_cubes.region_faces("tail_lamp", "tail_face", {"north": (0, 0, 12, 24)}))]


def tail_resin_cubes():
    return [box(12.6, DIMS.chassis.floor_y + 2, DIMS.chassis.rear_z - 0.3, 13, DIMS.greenhouse.belt_y - 2, DIMS.chassis.rear_z, "resin")]


def bumper_reflector_cubes():
    bumper = DIMS.rear_bumper
    x1 = bumper.reflector_x1 - bumper.reflector_outer_inset
    center_y = (bumper.bottom_y + bumper.top_y) / 2
    plate_z = bumper.tip_z - bumper.recess_proud
    return [
        box(x1 - bumper.reflector_width, center_y - bumper.reflector_height / 2,
            plate_z - bumper.reflector_proud, x1, center_y + bumper.reflector_height / 2,
            plate_z, "tail"),
    ]
