"""SUV construction dimensions and numeric geometry relationships, grouped by part.

Each group is a frozen dataclass. A value that follows from others is a property or a method, so no
derived number is written twice. `DIMS` is the one aggregate the other tools read.
"""

import math
from dataclasses import dataclass


# The seated player replaces the wheel diameter as the size anchor (ADR 0170).
# Keep construction coordinates unscaled until export so every length shares one transform.
# ADR 0194 raises the initial estimate after the owner observed clipping in game.
SIZE_SCALE = 1.45


@dataclass(frozen=True)
class Chassis:
    """Chassis and ground clearance: the chassis runs from the sill (its underside, which also sets
    where the side steps hang) up to the cabin floor. The floor and interior rise with the hood;
    the sill follows the reference ground clearance (ADR 0213).
    """

    hood: "Hood"

    # The cabin width stays anchored to two seated riders while D grows (ADR 0213).
    rear_z: float = -39.025  # z of the tailgate's outer face
    cargo_front_z: float = -19  # z where the rear doors end and the cargo area's fixed panels begin
    sill_y: float = 8.875
    body_half_width: float = 13
    cabin_half_width: float = 12

    @property
    def floor_y(self):
        return 8 + self.hood.interior_rise

    @property
    def door_frame_mid_x(self):
        return (self.body_half_width + self.cabin_half_width) / 2


@dataclass(frozen=True)
class Greenhouse:
    """The sealed rear pane supplies the measured belt and clear window height (ADR 0170, 6/7).
    Roof ribs add 0.3 px above the roof top to the measured overall height.
    """

    belt_y: float = 23
    window_height: float = 8.125

    @property
    def window_bottom_y(self):
        return self.belt_y

    @property
    def window_top_y(self):
        return self.window_bottom_y + self.window_height

    @property
    def roof_y(self):
        """Underside of the roof."""
        return self.window_top_y + 0.5

    @property
    def roof_top(self):
        return self.roof_y + 0.2


@dataclass(frozen=True)
class Hood:
    """The target hood stands above the belt line, so its cowl has its own height (ADR 0170)."""

    top_y: float = 23.75
    front_z: float = 28.375  # z of the hood's front face
    rear_z: float = 7.75  # z of the cowl, where the hood meets the windshield frame

    dome_height: float = 0.7
    dome_half_width: float = 8.0
    dome_side_run: float = 1.5
    dome_rear_inset: float = 2.0
    dome_front_inset: float = 0.9
    panel_thickness: float = 0.16
    # Scoop length, opening height and width follow the reference's 0.22 D, 0.07 D and 0.64 D
    # with D the 15 px road wheel (ADR 0213); the opening starts a quarter of the hood back.
    scoop_length: float = 3.3
    scoop_half_width: float = 4.8
    scoop_height: float = 0.85
    scoop_slots: int = 3

    @property
    def dome_top_y(self):
        return self.top_y + self.dome_height

    @property
    def dome_front_z(self):
        return self.front_z - self.dome_front_inset

    @property
    def dome_rear_z(self):
        return self.rear_z + self.dome_rear_inset

    @property
    def scoop_front_z(self):
        return self.front_z - (self.front_z - self.rear_z) / 4

    @property
    def scoop_rear_z(self):
        return self.scoop_front_z - self.scoop_length

    @property
    def interior_rise(self):
        """Keep the cabin fittings at the same height relative to the hood (ADR 0213)."""
        return self.top_y - 19


@dataclass(frozen=True)
class Windshield:
    """The windshield leans back: its frame turns around the lower frame's edge. Written here, a
    positive x rotation tips +y toward the rear (-z) in game; a negative one leaned the frame out over
    the hood. The roof starts where the A-pillars meet it.
    """

    hood: Hood
    greenhouse: Greenhouse
    rail_height: float = 0.3
    lean_degrees: float = 24  # degrees back from vertical

    @property
    def foot_z(self):
        """The windshield's lower frame pivot, before it leans back."""
        return self.hood.rear_z - 0.5

    @property
    def pivot(self):
        return (0, self.hood.top_y, self.foot_z)

    @property
    def lean_sin(self):
        return math.sin(math.radians(self.lean_degrees))

    @property
    def lean_cos(self):
        return math.cos(math.radians(self.lean_degrees))

    @property
    def lean_tan(self):
        return math.tan(math.radians(self.lean_degrees))

    @property
    def roof_front(self):
        return self.foot_z - (self.greenhouse.roof_top - self.hood.top_y) * self.lean_tan + 0.6

    @property
    def front_post_length(self):
        """The front door's window frame leans with the windshield, so its window is a trapezoid. The
        frame's front post sits just behind the A-pillar, turned around the same pivot."""
        return (self.greenhouse.roof_y - self.hood.top_y) / self.lean_cos


@dataclass(frozen=True)
class Cabin:
    """The door hinges follow the cowl; the pillars keep their cabin positions (ADR 0170)."""

    hood: Hood
    b_pillar_rear_z: float = -6
    b_pillar_front_z: float = -5

    @property
    def front_door_hinge_z(self):
        return self.hood.rear_z - 1

    @property
    def roof_seam_z(self):
        return self.b_pillar_front_z


@dataclass(frozen=True)
class Dash:
    """The dashboard follows the cowl."""

    hood: Hood
    gauge_drop: float = 1.25

    @property
    def bottom_y(self):
        return self.hood.top_y - 6

    @property
    def face_z(self):
        return self.hood.rear_z - 0.75

    @property
    def shift_z(self):
        return self.face_z - 10


@dataclass(frozen=True)
class Wheels:
    """The tires stand out from the body's side, under over-fenders."""

    chassis: Chassis
    road_radius: float = 7.5
    tire_half_width: float = 3
    front_axle_z: float = 21
    rear_axle_z: float = -26.6

    @property
    def hub_x(self):
        """Distance of the wheel hubs from the center line."""
        return self.chassis.body_half_width + 0.85

    @property
    def hub_y(self):
        return self.road_radius

    @property
    def bumper_half_width(self):
        """Both bumper bars reach out over the tires like the reference's."""
        return self.chassis.body_half_width + 3.65

    @property
    def bumper_end_clearance(self):
        """Outboard end pieces stop ahead of the tire's farthest spinning corner; only the
        center bar runs back to the body."""
        return self.road_radius + 0.2


@dataclass(frozen=True)
class Flare:
    """Squared body-colour panels with a rubber lip outside the existing arch cut."""

    chassis: Chassis
    arch: "Arch"
    wheels: Wheels
    cabin: Cabin
    thickness: float = 1.875
    lip: float = 0.5
    reach: float = 3.8125
    front_crest_y: float = 21.75
    rear_crest_y: float = 18.5
    inner_panel_depth: float = 0.1
    vent_frame_depth: float = 0.15
    vent_center_depth: float = 0.08
    vent_frame_width: float = 0.3
    vent_hinge_gap: float = 0.5
    vent_leg_gap: float = 0.25
    vent_bottom_drop: float = 1.5
    vent_top_drop: float = 2.5
    strip_inset_y: float = 0.35
    strip_back_depth: float = 0.05
    strip_front_depth: float = 0.1

    @property
    def x(self):
        return self.chassis.body_half_width + self.reach

    @property
    def leg_inner(self):
        """The lip starts at the existing arch foot to clear the spinning tyre."""
        return self.arch.foot_z

    @property
    def leg_body_inner(self):
        return self.leg_inner + self.lip

    @property
    def leg_outer(self):
        return self.leg_body_inner + self.thickness

    @property
    def vent_z0(self):
        return self.cabin.front_door_hinge_z + self.vent_hinge_gap

    @property
    def vent_z1(self):
        return self.wheels.front_axle_z - self.leg_outer - self.vent_leg_gap

    @property
    def vent_y0(self):
        return self.arch.top_y - self.vent_bottom_drop

    @property
    def vent_y1(self):
        return self.front_crest_y - self.vent_top_drop

    @property
    def strip_y0(self):
        return self.front_crest_y - self.thickness + self.strip_inset_y

    @property
    def strip_y1(self):
        return self.front_crest_y - self.strip_inset_y

    @property
    def strip_z0(self):
        return self.wheels.front_axle_z + self.leg_outer - self.strip_back_depth

    @property
    def strip_z1(self):
        return self.wheels.front_axle_z + self.leg_outer + self.strip_front_depth


@dataclass(frozen=True)
class Arch:
    """Wheel arch: the inside of each flare. Its flat top's underside, the top's half length, and the
    inner lower end of each slope, ahead of and behind the axle. The opening scales with the road
    radius while the liner sits inboard of the wider tire (ADR 0213).
    """

    top_y: float = 15.375
    top_half: float = 4.375
    foot_y: float = 10
    foot_z: float = 7.75
    liner_x: float = 10.45  # the arch liners hide the cabin through the arches

    @property
    def run_per_rise(self):
        return (self.foot_z - self.top_half) / (self.top_y - self.foot_y)

    def side_z(self, z_center, side, y):
        """z of the arch's inner edge at height y on its front (side +1) or rear (side -1) slope."""
        return z_center + side * (self.foot_z - (y - self.foot_y) * self.run_per_rise)


@dataclass(frozen=True)
class FrontBumper:
    """A low bar sized to the side-view reference (ADR 0170, 7/7). A length is the bar's run along
    the car between the body and its tip. The bar's top meets the grille's bottom frame, which sits
    just under the round headlights; its lower lip, top edge and fog lamps follow the bar.
    """

    hood: Hood
    wheels: Wheels
    length: float = 4.375
    grille_bottom_y: float = 11.25
    height: float = 5.25
    winch_half_width: float = 4.5
    winch_recess: float = 1.0
    fairlead_width: float = 5.0
    fairlead_height: float = 1.6
    fairlead_depth: float = 0.3
    fairlead_slot_width: float = 2.4
    fairlead_slot_height: float = 0.4
    fairlead_slot_depth: float = 0.05
    winch_hook_width: float = 0.7
    winch_hook_height: float = 1.1
    winch_hook_depth: float = 0.3
    winch_drum_half_width: float = 4.2
    winch_drum_drop: float = 0.5
    winch_drum_rise: float = 1.5
    winch_drum_back_offset: float = 0.4
    winch_drum_depth: float = 2.0
    winch_bell_inner_x: float = 3.4
    winch_bell_outer_x: float = 4.4
    winch_bell_overhang: float = 0.1
    shackle_x: float = 6.5
    shackle_thickness: float = 0.4
    shackle_height: float = 1.8
    shackle_rear_offset: float = 2.4
    shackle_front_offset: float = 1.0

    @property
    def winch_face_z(self):
        return self.tip_z - self.winch_recess

    @property
    def fairlead_front_z(self):
        return self.winch_face_z + self.fairlead_depth

    @property
    def winch_drum_bottom_y(self):
        return self.top_y - self.winch_drum_drop

    @property
    def winch_drum_top_y(self):
        return self.top_y + self.winch_drum_rise

    @property
    def winch_drum_back_z(self):
        return self.back_z + self.winch_drum_back_offset

    @property
    def winch_drum_front_z(self):
        return self.winch_drum_back_z + self.winch_drum_depth

    @property
    def top_y(self):
        return self.grille_bottom_y

    @property
    def bottom_y(self):
        return self.top_y - self.height

    @property
    def tip_z(self):
        return self.hood.front_z + 5.625

    @property
    def back_z(self):
        return self.tip_z - self.length

    @property
    def band_bottom_y(self):
        return self.bottom_y + 0.7

    @property
    def band_top_y(self):
        return self.top_y - 0.6

    @property
    def end_back_z(self):
        return max(self.back_z, self.wheels.front_axle_z + self.wheels.bumper_end_clearance)


@dataclass(frozen=True)
class RearBumper:
    chassis: Chassis
    wheels: Wheels
    length: float = 6.25
    height: float = 3.75
    chamfer: float = 2
    step_half_width: float = 6
    step_proud: float = 0.4
    step_inset_y: float = 0.6
    tread_height: float = 0.2
    recess_width: float = 3
    recess_inset_y: float = 0.6
    recess_proud: float = 0.05
    reflector_width: float = 1
    reflector_height: float = 1.6
    reflector_outer_inset: float = 0.3
    reflector_proud: float = 0.05

    @property
    def bottom_y(self):
        return self.chassis.sill_y - 0.5

    @property
    def top_y(self):
        return self.bottom_y + self.height

    @property
    def tip_z(self):
        return self.chassis.rear_z - 1.875

    @property
    def end_back_z(self):
        return max(-self.tip_z - self.length,
                   -self.wheels.rear_axle_z + self.wheels.bumper_end_clearance)

    @property
    def reflector_x1(self):
        """The reflectors end where the bar's straight face meets its cut corners."""
        return self.wheels.bumper_half_width - self.chamfer


@dataclass(frozen=True)
class Steps:
    """The side steps stop short of the flares' legs."""

    chassis: Chassis
    wheels: Wheels
    arch: Arch

    @property
    def rear_z(self):
        return self.wheels.rear_axle_z + self.arch.foot_z + 1

    @property
    def front_z(self):
        return self.wheels.front_axle_z - self.arch.foot_z

    @property
    def top_y(self):
        """Flush with the doors' lower edge, so an opening door clears the step."""
        return self.chassis.floor_y


@dataclass(frozen=True)
class Seats:
    """Two seats in front and a rear bench made of two halves. A front rider sits 5.2 px ahead of the
    seat's back, the same as on the rear bench (ADR 0117). The front seats and riders sit 3.75 px
    farther back than ADR 0117 put them: 2 px so the rider's torso clears the steering wheel under the
    rearward cowl, and 1.75 px more so the scaled rider's head clears the raked windshield glass
    (ADR 0170). The grown head still clears it at scale 1.45 (ADR 0194).
    """

    chassis: Chassis
    front_z: float = -5.75

    @property
    def cushion_y(self):
        return 10 + self.chassis.hood.interior_rise

    @property
    def rear_z(self):
        return self.chassis.cargo_front_z + 1


@dataclass(frozen=True)
class Steering:
    """Steering wheel (+x side; shown in game as right-hand drive), tilted 20 degrees with its top
    away from the driver, toward the dashboard (a negative x rotation tips +y toward +z in game, see
    Windshield). The wheel follows the dashboard face so its column stays inside the cabin as the
    cowl moves.
    """

    dash: Dash
    radius: float = 2.4
    tilt: float = -20

    @property
    def center(self):
        return (6.0, self.dash.hood.top_y - 2.5)

    @property
    def z(self):
        return 8.1 + self.dash.shift_z

    @property
    def pivot(self):
        return [self.center[0], self.center[1], self.z]

    @property
    def column_end_z(self):
        """Inside the dashboard."""
        return 11.0 + self.dash.shift_z


@dataclass(frozen=True)
class Fold:
    """The folded wheels hang out from the body on arms in flight, like a hovering DeLorean (ADR
    0043): the hover animation moves each wheel `out` outward and `drop` down. The dive and submerged
    animations move each rear wheel `sub_out` out, which the submarine arms reach to (ADR 0040); it
    equals `out` but is set by a different animation. Timing and angles in suv.anim.json stay
    hand-authored; export rebuilds its translations from these lengths to keep the assemblies
    attached.
    """

    chassis: Chassis
    wheels: Wheels
    out: float = 7.5
    drop: float = 5
    sub_out: float = 7.5
    arm_thick: float = 1.4

    @property
    def arm_root_x(self):
        return self.chassis.cabin_half_width

    @property
    def arm_root_y(self):
        return self.chassis.floor_y + 2

    @property
    def folded_wheel_top_y(self):
        return self.wheels.hub_y - self.drop + self.wheels.tire_half_width


@dataclass(frozen=True)
class Lamps:
    """Round fog lamps sit in rectangular black pockets near the front bumper's ends, inboard of the bar's cut
    corners so they are on its straight face."""

    front_bumper: FrontBumper
    y0: float = 14.25
    y1: float = 15.25
    fog_x: float = 10.4
    fog_pocket_width: float = 4.4
    fog_pocket_height: float = 2.4
    fog_lens_radius: float = 0.9

    @property
    def fog_y(self):
        return (self.front_bumper.band_bottom_y + self.front_bumper.band_top_y) / 2


@dataclass(frozen=True)
class Spare:
    """Rear spare tire (on the tailgate, axle along z)."""

    chassis: Chassis
    wheels: Wheels
    half_width: float = 1.875

    @property
    def radius(self):
        return self.wheels.road_radius * 5 / 6

    @property
    def center(self):
        return (0, 16.875, self.chassis.rear_z - self.half_width)


@dataclass(frozen=True)
class Envelope:
    """The rounded game probe shared with SUV_SPEC.bodyHalfWidth, in blocks."""

    half_width_blocks: float = 1.58


@dataclass(frozen=True)
class SuvDims:
    chassis: Chassis
    greenhouse: Greenhouse
    hood: Hood
    windshield: Windshield
    cabin: Cabin
    dash: Dash
    wheels: Wheels
    flare: Flare
    arch: Arch
    front_bumper: FrontBumper
    rear_bumper: RearBumper
    steps: Steps
    seats: Seats
    steering: Steering
    fold: Fold
    lamps: Lamps
    spare: Spare
    envelope: Envelope


def _build():
    hood = Hood()
    chassis = Chassis(hood)
    greenhouse = Greenhouse()
    dash = Dash(hood)
    wheels = Wheels(chassis)
    arch = Arch()
    cabin = Cabin(hood)
    flare = Flare(chassis, arch, wheels, cabin)
    front_bumper = FrontBumper(hood, wheels)
    return SuvDims(
        chassis=chassis,
        greenhouse=greenhouse,
        hood=hood,
        windshield=Windshield(hood, greenhouse),
        cabin=cabin,
        dash=dash,
        wheels=wheels,
        flare=flare,
        arch=arch,
        front_bumper=front_bumper,
        rear_bumper=RearBumper(chassis, wheels),
        steps=Steps(chassis, wheels, arch),
        seats=Seats(chassis),
        steering=Steering(dash),
        fold=Fold(chassis, wheels),
        lamps=Lamps(front_bumper),
        spare=Spare(chassis, wheels),
        envelope=Envelope(),
    )


DIMS = _build()
