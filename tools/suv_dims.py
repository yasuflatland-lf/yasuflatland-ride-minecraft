"""SUV construction dimensions and numeric geometry relationships."""

import math


# The seated player replaces the wheel diameter as the size anchor (ADR 0170).
# Keep construction coordinates unscaled until export so every length shares one transform.
SIZE_SCALE = 1.3

# The wheelbase and overhang ratios follow the side-view reference (ADR 0170).
REAR = -31  # z of the tailgate's outer face
CARGO_FRONT = -19  # z where the rear doors end and the cargo area's fixed panels begin
# Chassis and ground clearance: the chassis runs from the sill (its underside, which also sets where
# the side steps and bumpers hang) up to the cabin floor. The sill sits at the target's clearance
# (ADR 0170, 4/7). The floor sits only as high as the side steps' thickness needs, and the seats do not
# follow it: higher seats would take the riders' head room under the lowered roof.
SILL_Y = 6.875
FLOOR_Y = 8
BODY_HALF_WIDTH = 13
CABIN_HALF_WIDTH = 12
DOOR_FRAME_MID_X = (BODY_HALF_WIDTH + CABIN_HALF_WIDTH) / 2

# The sealed rear pane supplies the measured belt and clear window height (ADR 0170, 6/7).
# Roof ribs add 0.3 px above ROOF_TOP to the measured overall height.
BELT_Y = 18.4
WINDOW_BOTTOM_Y = BELT_Y
WINDOW_TOP_Y = WINDOW_BOTTOM_Y + 6.5
ROOF_Y = WINDOW_TOP_Y + 1  # underside of the roof
ROOF_TOP = ROOF_Y + 0.2

# The target hood stands above the belt line, so its cowl has its own height (ADR 0170).
HOOD_TOP_Y = 19
FRONT = 25  # z of the hood's front face
HOOD_REAR_Z = 7.75  # z of the cowl, where the hood meets the windshield frame
WINDSHIELD_FOOT_Z = HOOD_REAR_Z - 0.5  # the windshield's lower frame pivot, before it leans back

# The door hinges and dashboard follow the cowl; the pillars keep their cabin positions (ADR 0170).
FRONT_DOOR_HINGE_Z = HOOD_REAR_Z - 1
B_PILLAR_REAR_Z, B_PILLAR_FRONT_Z = -6, -5
DASH_BOTTOM_Y = 13
DASH_FACE_Z = HOOD_REAR_Z - 0.75
DASH_GAUGE_DROP = 1.25
DASH_SHIFT_Z = DASH_FACE_Z - 10
REAR_SEAT_Z = CARGO_FRONT + 1

# The windshield leans back: its frame turns around the lower frame's edge. Written here, a positive x
# rotation tips +y toward the rear (-z) in game; a negative one leaned the frame out over the hood.
# The roof starts where the A-pillars meet it.
WINDSHIELD_LEAN = 35  # degrees back from vertical
WINDSHIELD_PIVOT = (0, HOOD_TOP_Y, WINDSHIELD_FOOT_Z)
_LEAN_SIN = math.sin(math.radians(WINDSHIELD_LEAN))
_LEAN_COS = math.cos(math.radians(WINDSHIELD_LEAN))
_LEAN_TAN = math.tan(math.radians(WINDSHIELD_LEAN))
ROOF_FRONT = WINDSHIELD_FOOT_Z - (ROOF_TOP - HOOD_TOP_Y) * _LEAN_TAN + 0.6

# Distance of the wheel hubs from the center line. The tires stand out from the body's side, under
# over-fenders.
HUB_X = BODY_HALF_WIDTH + 2.5
ROAD_WHEEL_RADIUS = 6
HUB_Y = ROAD_WHEEL_RADIUS
TIRE_HALF_WIDTH = 2
FRONT_AXLE_Z, REAR_AXLE_Z = 21, -21.5
# Outer face of the flares, over the inner half of the tires
FLARE_X = BODY_HALF_WIDTH + 2.75
FLARE_THICKNESS = 1.5
# Wheel arch: the inside of each flare. Its flat top's underside, the top's half length, and the inner
# lower end of each slope, ahead of and behind the axle. The slope stays over 6.3 px from the
# hub while the slimmer foot fits behind the target's 8.38 px front overhang (ADR 0170).
ARCH_TOP_Y, ARCH_TOP_HALF = 12.3, 3.5
ARCH_FOOT_Y, ARCH_FOOT_Z = 8, 6.2
ARCH_RUN_PER_RISE = (ARCH_FOOT_Z - ARCH_TOP_HALF) / (ARCH_TOP_Y - ARCH_FOOT_Y)

# Bumpers: low bars sized to the side-view reference (ADR 0170, 7/7). A length is the bar's run along
# the car between the body and its tip. The front bar's top meets the grille's bottom frame, which sits
# just under the round headlights; its lower lip, top edge and fog lamps follow the bar.
FRONT_BUMPER_LENGTH = 4
GRILLE_BOTTOM_Y = 9
FRONT_BUMPER_HEIGHT = 4.2
FRONT_BUMPER_TOP_Y = GRILLE_BOTTOM_Y
FRONT_BUMPER_BOTTOM_Y = FRONT_BUMPER_TOP_Y - FRONT_BUMPER_HEIGHT
FRONT_BUMPER_TIP_Z = FRONT + 4.5
FRONT_BUMPER_BACK_Z = FRONT_BUMPER_TIP_Z - FRONT_BUMPER_LENGTH
FRONT_BUMPER_BAND_BOTTOM_Y = FRONT_BUMPER_BOTTOM_Y + 0.7
FRONT_BUMPER_BAND_TOP_Y = FRONT_BUMPER_TOP_Y - 0.6
REAR_BUMPER_LENGTH = 5
REAR_BUMPER_BOTTOM_Y = SILL_Y - 0.5
REAR_BUMPER_HEIGHT = 3
REAR_BUMPER_TOP_Y = REAR_BUMPER_BOTTOM_Y + REAR_BUMPER_HEIGHT
REAR_BUMPER_TIP_Z = REAR - 1.5
# Both bars reach out over the tires like the reference's, but only as far back as the tire's
# farthest spinning corner (6.07 px from the hub at D=12.05 px, on its inner face) allows: outboard
# of the body they are shallow end pieces, and only the part between the tires runs back to the body.
BUMPER_HALF_WIDTH = HUB_X + 1
BUMPER_END_CLEARANCE = ROAD_WHEEL_RADIUS + 0.2

# The arch liners hide the cabin through the arches; the side steps stop short of the flares' legs.
ARCH_LINER_X = 11.4
STEP_REAR_Z = REAR_AXLE_Z + ARCH_FOOT_Z + 1
STEP_FRONT_Z = FRONT_AXLE_Z - ARCH_FOOT_Z
STEP_TOP_Y = FLOOR_Y  # flush with the doors' lower edge, so an opening door clears the step

# The folded wheels hang out from the body on arms in flight, like a hovering DeLorean (ADR 0043): the
# hover animation moves each wheel FOLD_OUT outward and FOLD_DROP down. The dive and submerged
# animations move each rear wheel SUB_OUT out, which the submarine arms reach to (ADR 0040); it equals
# FOLD_OUT but is set by a different animation. Timing and angles in suv.anim.json stay hand-authored;
# export rebuilds its translations from these lengths to keep the assemblies attached.
FOLD_OUT = 6
FOLD_DROP = 4
SUB_OUT = 6
ARM_THICK = 1.4
ARM_ROOT_X, ARM_ROOT_Y = CABIN_HALF_WIDTH, FLOOR_Y + 2
FOLDED_WHEEL_TOP_Y = HUB_Y - FOLD_DROP + TIRE_HALF_WIDTH

LAMP_Y0, LAMP_Y1 = 11.4, 12.2
FRONT_BUMPER_END_BACK_Z = FRONT_AXLE_Z + BUMPER_END_CLEARANCE
REAR_BUMPER_CHAMFER = 2
# The reflectors end where the bar's straight face meets its cut corners
REFLECTOR_X1 = BUMPER_HALF_WIDTH - REAR_BUMPER_CHAMFER

# Seats: 2 in front and a rear bench made of two halves. A front rider sits 5.2 px ahead of the seat's
# back, the same as on the rear bench (ADR 0117). The front seats and riders sit 3.75 px farther back
# than ADR 0117 put them: 2 px so the rider's torso clears the steering wheel under the rearward cowl,
# and 1.75 px more so the scaled rider's head clears the raked windshield glass (ADR 0170).
FRONT_SEAT_Z = -5.75

# Steering wheel (+x side; shown in game as right-hand drive), tilted 20° with its top away from the
# driver, toward the dashboard (a negative x rotation tips +y toward +z in game, see WINDSHIELD_LEAN).
# The wheel follows the dashboard face so its column stays inside the cabin as the cowl moves.
WHEEL_CENTER = (6.0, 16.5)  # (x, y)
WHEEL_Z = 8.1 + DASH_SHIFT_Z
WHEEL_PIVOT = [WHEEL_CENTER[0], WHEEL_CENTER[1], WHEEL_Z]
WHEEL_RADIUS = 2.4
WHEEL_TILT = -20
COLUMN_END_Z = 11.0 + DASH_SHIFT_Z  # inside the dashboard

FOG_X = 10.5
FOG_Y = (FRONT_BUMPER_BAND_BOTTOM_Y + FRONT_BUMPER_BAND_TOP_Y) / 2
ROOF_SEAM = B_PILLAR_FRONT_Z

# The front door's window frame leans with the windshield, so its window is a trapezoid. The frame's
# front post sits just behind the A-pillar, turned around the same pivot.
FRONT_POST_LENGTH = (ROOF_Y - HOOD_TOP_Y) / _LEAN_COS

# Rear spare tire (on the tailgate, axle along z)
SPARE = (0, 13.5, REAR - 1.5)


def arch_side_z(z_center, side, y):
    """z of the arch's inner edge at height y on its front (side +1) or rear (side -1) slope."""
    return z_center + side * (ARCH_FOOT_Z - (y - ARCH_FOOT_Y) * ARCH_RUN_PER_RISE)


def flare_face_z(z_center, side, y):
    """z of the flare's outer face at height y on its front (side +1) or rear (side -1) slope."""
    return arch_side_z(z_center, side, y) + side * FLARE_THICKNESS * math.hypot(1, ARCH_RUN_PER_RISE)
