"""SUV construction dimensions and numeric geometry relationships.

The body is the Rubicon-shaped model of ADR 0214. It is written in units of the road tyre's outside
diameter D (D = 1, see suv_kit.py) and every length here is in construction pixels, so D is the
one size anchor: it is the length that puts the top of the roof ribs at ROOF_TOP.
"""

import math


# Construction coordinates stay unscaled until export, so every length shares one transform
# (ADR 0170, 0194). The model has kept this scale since ADR 0194.
SIZE_SCALE = 1.45

# Size anchor (ADR 0214): the height of the roof ribs, 2.064 tyre diameters, stays at the old
# model's 26.1 px, so the roof tent, the roof margin above the collision box and the placement
# clearance keep their meaning. The tyre diameter D follows from it.
ROOF_TOP = 26.1
ROOF_TOP_D = 2.064
D = ROOF_TOP / ROOF_TOP_D

# Front axle z. The riders sit at the entity's fixed seat positions until the interior is refitted,
# and this puts the leaning windshield far enough ahead of the front riders' heads (ADR 0170, 0214).
FRONT_AXLE_Z = 17.2
WHEELBASE = 3.02 * D
REAR_AXLE_Z = FRONT_AXLE_Z - WHEELBASE


def z_at(z_d):
    """Construction z of a model position z_d, in D units from the front axle toward the rear."""
    return FRONT_AXLE_Z - z_d * D


# Heights from the ground, in D units (ADR 0214).
SILL_Y = 0.68 * D  # underside of the rock rails
FLOOR_Y = 0.80 * D  # top of the cabin floor
BELT_Y = 1.49 * D  # bottom of the side windows
WINDOW_BOTTOM_Y = BELT_Y
WINDOW_TOP_Y = 1.97 * D
HARDTOP_TOP_Y = 2.060 * D
HARDTOP_FRONT_Z = z_at(1.16)
HARDTOP_REAR_Z = z_at(3.44)
ROOF_Y = 2.018 * D  # underside of the hardtop
HOOD_TOP_Y = 1.485 * D
WINDSHIELD_RAIL_HEIGHT = 0.035 * D

BODY_NOSE_HALF_WIDTH = 0.755 * D
MIRROR_OUTER_X = 0.995 * D  # housing before the hull widening transform
BODY_HALF_WIDTH = 0.885 * D  # side wall behind the windshield base
CABIN_HALF_WIDTH = 0.70 * D
SHELL_OUTER_HALF_WIDTH = MIRROR_OUTER_X * BODY_HALF_WIDTH / BODY_NOSE_HALF_WIDTH

REAR = z_at(3.56)  # z of the tailgate's outer face
CARGO_FRONT = z_at(2.68)  # z where the rear doors end and the cargo area's fixed panels begin
HOOD_REAR_Z = z_at(0.80)  # z of the cowl, where the hood meets the windshield frame
WINDSHIELD_FOOT_Z = z_at(0.77)  # the windshield's lower frame, which then leans back
FRONT_BUMPER_TIP_Z = z_at(-1.033 + 0.055)  # the winch plate, the farthest-forward part (see suv_front.BUMPER_SETBACK)

# The windshield leans back about 35.8 degrees from vertical: 0.40 D back over 0.555 D up.
WINDSHIELD_RUN = 0.40
WINDSHIELD_RISE = 0.555
WINDSHIELD_LEAN = math.degrees(math.atan2(WINDSHIELD_RUN, WINDSHIELD_RISE))

# The door hinges and the dashboard follow the cowl.
FRONT_DOOR_HINGE_Z = z_at(0.83)
REAR_DOOR_HINGE_Z = z_at(1.91)
DASH_BOTTOM_Y = 13
# The windshield's foot stands 0.38 px ahead of the cowl's rear edge, so the dash sits further back than the
# old model's 0.75 px behind it.
DASH_FACE_Z = HOOD_REAR_Z - 1.3
DASH_GAUGE_DROP = 1.25
DASH_SHIFT_Z = DASH_FACE_Z - 10
# The floor console and pedals were built for a dash shift of -3.
INTERIOR_SHIFT_Z = DASH_SHIFT_Z + 3

# Seats keep the positions the entity file gives them until the interior is refitted (ADR 0170, 0194).
FRONT_SEAT_Z = -5.75
REAR_SEAT_Z = -18
SEAT_OUTER_X = 9.2  # the seats' outer edge, inboard of the side windows and the rear tyres' inner faces

# Wheels: the road wheel is the 133-cube construction of the earlier SUV, drawn at radius 6 and half
# tread width 2 and then scaled to D (radially) and to a tread of 0.43 D (along the axle).
ROAD_WHEEL_RADIUS = D / 2
HUB_Y = ROAD_WHEEL_RADIUS
WHEEL_DRAWN_RADIUS = 6
WHEEL_DRAWN_HALF_WIDTH = 2
RADIAL_SCALE = ROAD_WHEEL_RADIUS / WHEEL_DRAWN_RADIUS
TIRE_HALF_WIDTH = 0.215 * D
AXIAL_SCALE = TIRE_HALF_WIDTH / WHEEL_DRAWN_HALF_WIDTH
HUB_X = 0.975 * D  # the wheel's centre, from the centre line
HUB_CAP_OUT = 2.5 * AXIAL_SCALE  # the hub cap's outer face, beyond HUB_X
WHEEL_OUTER_X = HUB_X + HUB_CAP_OUT

# The folded wheels hang out from the body on arms in flight, like a hovering DeLorean (ADR 0043): the
# hover animation moves each wheel FOLD_OUT outward and FOLD_DROP down. The dive and submerged
# animations move each rear wheel SUB_OUT out, which the submarine arms reach to (ADR 0040); it equals
# FOLD_OUT but is set by a different animation. Timing and angles in suv.anim.json stay hand-authored;
# export rebuilds its translations from these lengths to keep the assemblies attached.
FOLD_OUT = 6
FOLD_DROP = 4
SUB_OUT = 8
ARM_THICK = 1.4
ARM_ROOT_X, ARM_ROOT_Y = CABIN_HALF_WIDTH, FLOOR_Y + 2
FOLDED_WHEEL_TOP_Y = HUB_Y - FOLD_DROP + TIRE_HALF_WIDTH
# Radius of the disc under each folded wheel; it sets how far the hover glow reaches (ADR 0122).
GLOW_RADIUS = 5

# The spare is the road wheel turned to face rearward, on the tailgate. Its front face clears the
# tailgate, the rear window and the rear bumper (ADR 0214).
SPARE_Y = 1.35 * D
SPARE_Z = z_at(3.80)

# Steering wheel (+x side; shown in game as right-hand drive), tilted 20° with its top away from the
# driver, toward the dashboard (a negative x rotation tips +y toward +z in game).
# The wheel follows the dashboard face so its column stays inside the cabin as the cowl moves.
WHEEL_CENTER = (6.0, 16.5)  # (x, y)
WHEEL_Z = 8.1 + DASH_SHIFT_Z
WHEEL_PIVOT = [WHEEL_CENTER[0], WHEEL_CENTER[1], WHEEL_Z]
WHEEL_RADIUS = 2.4
WHEEL_TILT = -20
COLUMN_END_Z = 11.0 + DASH_SHIFT_Z  # inside the dashboard

# The doors hinge on the body side, ahead of each door; the exhaust locator sits at the right tip of the muffler.
DOOR_HINGE_X = 0.80 * D
EXHAUST_X = 0.52 * D
EXHAUST_Y = 0.45 * D
EXHAUST_Z = z_at(3.72)
BUMPER_HALF_WIDTH = 1.06 * D  # the front bumper's end pieces, over the wheel hubs
