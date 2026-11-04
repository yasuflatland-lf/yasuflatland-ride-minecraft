"""SUV lamp pieces that carry painted lamp faces: the headlight lens, the tail lamps and the
third brake light (ADR 0192).

The plain lamp lenses (fog and marker lenses) are built with the body in suv_front.py. suv_body.py puts
the headlight lens in `headlights` and the tail faces in `tail_lights`.
Construction frame: forward is +z, so a tail face looks toward -z (north).
"""

from tool_loader import load_tool

dims = load_tool("suv_dims")
hull = load_tool("suv_hull")
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
D = dims.D


HEADLIGHT_X = 0.589 * D
HEADLIGHT_Y = 1.31 * D
HEADLIGHT_CENTERS = ((HEADLIGHT_X, HEADLIGHT_Y), (-HEADLIGHT_X, HEADLIGHT_Y))
HEADLIGHT_DIAMETER = 0.21 * D
# The lens keeps the proportion ADR 0192 gave it: 0.1/5.6 of its diameter thick.
HEADLIGHT_THICKNESS = HEADLIGHT_DIAMETER * 0.1 / 5.6
HEADLIGHT_FRONT = dims.z_at(-0.700)


def headlight_panel(region, diameter, front, thickness, faces: tuple[str, ...]):
    spec = load_tool("suv_atlas").region_spec("headlight", region)
    uv = suv_cubes.region_faces("headlight", region,
                                {face: (0, 0, spec.w, spec.h) for face in faces})
    half = diameter / 2
    return [box(cx - half, cy - half, front - thickness,
                cx + half, cy + half, front, uv)
            for cx, cy in HEADLIGHT_CENTERS]


def headlight_lens_cubes():
    return headlight_panel("lens", HEADLIGHT_DIAMETER, HEADLIGHT_FRONT, HEADLIGHT_THICKNESS, ("south",))


# The tail lamps sit behind the body's widest point, so the widening scale applies to them.
TAIL_LAMP_X = 0.645 * hull.K_REAR
TAIL_LAMP_HALF_WIDTH = 0.083 * hull.K_REAR
TAIL_LAMP_Y = (1.095, 1.33)
TAIL_LAMP_Z = 3.632  # the outer face of the lamp housing
THIRD_BRAKE_Y = (2.0, 2.03)
THIRD_BRAKE_HALF_WIDTH = 0.15
THIRD_BRAKE_Z = 3.495  # just behind the hardtop's rear cap


def third_brake_light_cubes():
    return [
        box(-THIRD_BRAKE_HALF_WIDTH * D, THIRD_BRAKE_Y[0] * D, dims.z_at(THIRD_BRAKE_Z + 0.01),
            THIRD_BRAKE_HALF_WIDTH * D, THIRD_BRAKE_Y[1] * D, dims.z_at(THIRD_BRAKE_Z),
            suv_cubes.region_faces("tail_lamp", "third_brake", {"north": (0, 0, 12, 3)})),
    ]


def tail_light_cubes():
    # Built for the +x side; the caller mirrors it.
    return [box((TAIL_LAMP_X - TAIL_LAMP_HALF_WIDTH) * D, TAIL_LAMP_Y[0] * D, dims.z_at(TAIL_LAMP_Z + 0.01),
                (TAIL_LAMP_X + TAIL_LAMP_HALF_WIDTH) * D, TAIL_LAMP_Y[1] * D, dims.z_at(TAIL_LAMP_Z),
                suv_cubes.region_faces("tail_lamp", "tail_face", {"north": (0, 0, 12, 24)}))]
