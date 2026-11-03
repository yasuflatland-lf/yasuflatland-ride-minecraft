"""Generate roof tent geometry and sixteen fabric paints, without script behavior.

    python3 -I tools/gen_roof_tent.py packs/yasu_ride_rp [--check]

Front is -z. Both soft shells have their ridge along x and slope toward +/-z.
The ground/camper shell spans 32 x 40 pixels, with a 2 px platform, 12 px eaves,
and 19 px ridge, without lift or rack. Its original +x ladder is preserved.
The wider SUV shell has a lifted rack and a ground-reaching +x ladder toward
the rear (vehicle left).
"""
import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")
tent = load_tool("gen_tent")
cube_tilt = load_tool("cube_tilt")
# Share the ground tent's swatches and paint order, including fixed bedding colors.
box = tent.box
FLY_PAINTS = {**tent.FLY_PAINTS, "khaki": (86, 94, 64)}
GEOMETRY = "models/entity/yasu_ride/roof_tent.geo.json"
TEXTURE = "textures/entity/yasu_ride/roof_tent.png"


@dataclass(frozen=True)
class Dims:
    platform_color: str = "strap"
    ladder_style: str = "reflective"
    bedding_half_width: float = 0.65
    bedding_front: float = -0.7
    bedding_back: float = 0.8
    mattress_rise: float = 1.8
    sleeping_bag_rise: float = 2.4
    sleeping_bag_back: float = 0.5
    pillow_half_width: float = 0.5
    pillow_front: float = 0.55
    pillow_back: float = 0.75
    pillow_rise: float = 3.6
    shell_lower: tuple = None
    shell_upper: tuple = None
    half_width: float = 16
    half_depth: float = 20
    shell_lift: float = 0
    host_roof_height: float = 0
    ladder_horizontal_reach: float = 7.3
    # Stepped chamfers preserve single-axis rotations on leaning sheets.
    zip_chamfer: float = 1.5
    zip_chamfer_steps: int = 5
    roof_zip_inset: float = 4
    end_zip_depth_fraction: float = 0.6
    end_zip_height_fraction: float = 0.7
    platform_height: float = 2
    wall_height: float = 12
    ridge_height: float = 19
    half_roof: float = 16
    end_inset: float = 0
    panel_thickness: float = 0.5
    frame_thickness: float = 0.25
    frame_lean: float = 0.5
    # Raised stitching stays visible without becoming structural beams.
    seam_width: float = 0.2
    # Separate overlays from fabric and frame faces to avoid coplanar flicker.
    seam_proud: float = 0.08
    # End-window coordinates run along the leaning sheet, not world height.
    end_window_bottom: float = 6
    # Leave fabric above the end window before the eave.
    end_window_top: float = 11
    # Keep the end mesh clear of the corner seams and ladder rails.
    end_window_half_depth: float = 7
    # Only the ladder end needs an additional opening.
    end_window_sides: tuple = (1,)
    # A narrow cap protects the centre roof joint without flattening the roof.
    ridge_cap_half_depth: float = 1.6
    # The cap has a shallower pitch than the main roof.
    ridge_cap_rise: float = 0.25
    # Lift the cap above the two overlapping roof panels.
    ridge_cap_lift: float = 0.55
    # Keep the protective cap as thin as the stitched edging.
    ridge_cap_thickness: float = 0.2
    # Small zip pulls sit beside the long-side window frames.
    toggle_offset: float = 1.2
    # Short horizontal toggles read separately from the frame bars.
    toggle_length: float = 0.8
    # Vertical zip tabs remain below the upper fabric course.
    toggle_height: float = 0.6
    # The rolled flap has a narrow central retaining strap.
    flap_strap_width: float = 0.3
    # Two roof-rack crossbars support the platform underneath.
    mount_bar_x: tuple = (-18, 18)
    # Crossbars stop short of the platform's front and back edges.
    mount_bar_half_depth: float = 16
    # Rack hardware remains thin compared with the platform.
    mount_bar_width: float = 1
    # Crossbars sit immediately below the shell floor.
    mount_bar_drop: float = 0.5
    # Four feet connect the crossbars to the existing roof mount.
    mount_foot_z: tuple = (-12, 12)
    # Small square feet avoid visually filling the underside.
    mount_foot_width: float = 1.5
    # Feet extend below the crossbars without changing the mount anchor.
    mount_foot_drop: float = 1.2
    # Keep rung spacing and ladder reach unchanged by shell scaling.
    ladder_rung_spacing: int = 5
    # Thin rungs leave the mesh end window readable behind the ladder.
    ladder_rung_height: float = 0.8
    # Rails retain their original one-pixel section.
    ladder_rail_width: float = 1
    # Two small reflective patches mark the ends of each dark rung.
    ladder_tape_length: float = 1.2
    # The tape is a surface detail rather than a second rung.
    ladder_tape_thickness: float = 0.1
    pole_x: tuple = (-15, 14)
    window_bottom: int = 5
    window_top: int = 10
    window_half_depth: int = 12
    doorway_half_width: int = 8
    ladder_pivot: tuple = (16, 2, 0)
    ladder_tilt: float = -15
    ladder_bottom: float = -32
    ladder_first_rung: int = -29
    ladder_rails_z: tuple = (-6, 5)
    ladder_lower: tuple = (16, -33, -31)
    ladder_upper_x: float = 27
    ladder_foot: tuple = None

    visible_bounds_width: int = 4
    visible_bounds_height: int = 4
    visible_bounds_offset: tuple = (0, -0.4, -0.3)

    def __post_init__(self):
        if self.shell_lower is None:
            object.__setattr__(self, "shell_lower", (-self.half_width-1, -self.mount_foot_drop if self.mount_bar_x else 0, -self.half_depth-1.5))
        if self.shell_upper is None:
            object.__setattr__(self, "shell_upper", (self.half_width+1, self.ridge_height+self.shell_lift+1, self.half_depth+1.5))
        if self.host_roof_height:
            drop = self.host_roof_height + self.shell_lift + self.ladder_pivot[1]
            length = math.hypot(drop, self.ladder_horizontal_reach)
            object.__setattr__(self, "ladder_bottom", self.ladder_pivot[1]-length)
            object.__setattr__(self, "ladder_tilt", -math.degrees(math.atan2(self.ladder_horizontal_reach, drop)))
        # Export the ground-contact corner for mount consumers without duplicating the rotation.
        if self.ladder_foot is None:
            x, _, z = self.ladder_pivot
            foot = tent.game_rotate((x, self.ladder_bottom, z), self.ladder_pivot, (0, 0, self.ladder_tilt))
            object.__setattr__(self, "ladder_foot", (foot[0], foot[1]+self.shell_lift, foot[2]))



GROUND_DIMS = Dims(
    half_roof=20, end_inset=5,
    window_bottom=6, window_top=10, window_half_depth=9.5,
    doorway_half_width=4.5,
    end_window_bottom=6, end_window_top=10, end_window_half_depth=7,
    pole_x=(), mount_bar_x=(), ladder_style="ground",
)
SUV_DIMS = Dims(
    # The span is 1.2 times the SUV's 1.64-block body half width, in pixels.
    half_width=1.2 * 1.64 * 16,
    # Rotation puts the former 32-pixel width along z, enlarged by 1.2.
    half_depth=1.2 * 32 / 2,
    shell_lift=5, host_roof_height=26.1 * 1.45,
    mount_bar_width=2, mount_bar_drop=3.5, mount_foot_drop=5,
    # The left shift moved the +18 px bar past the hardtop edge. Both bars now stay on the
    # hardtop (host x within +-1.64 blocks) and under the platform (tent x within +-31.5 px).
    mount_bar_x=(-26, 4),
    platform_height=1.2, wall_height=1.2 * 12, ridge_height=1.2 * 12 + 6.6,
    end_window_half_depth=12.5, end_window_top=12,
    ridge_cap_half_depth=5, ridge_cap_thickness=0.12,
    zip_chamfer=3, zip_chamfer_steps=10,
    # The eaves span the depth; the end taper continues above them toward the ridge.
    half_roof=1.2 * 16, end_inset=9,
    # Posts sit one scaled pixel inside the narrower eaves, with room for their thickness.
    pole_x=(-(1.2 * 1.64 * 16-9-1.2), 1.2 * 1.64 * 16-9-2.4),
    window_bottom=6, window_top=12,
    window_half_depth=19, doorway_half_width=6.5,
    frame_thickness=0.4, ridge_cap_rise=0.15,
    toggle_length=1.2, toggle_height=0.8,
    ladder_tape_length=2.2, ladder_tape_thickness=0.3,
    # Model +x is vehicle left; +z is the rear half.
    ladder_pivot=(1.2 * 1.64 * 16 + 0.5, 2, 6),
    # Rail length and tilt retain the outward reach while compensating for the shell lift.
    ladder_first_rung=-39,
    ladder_rails_z=(1, 12), ladder_lower=(31, -38, 1), ladder_upper_x=42,
    # Eight blocks enclose the widened shell and outward ladder; five enclose its height.
    visible_bounds_width=8, visible_bounds_height=5,
    visible_bounds_offset=(0, -0.45, 0),
)


@dataclass(frozen=True)
class Shell:
    body: list
    fabric: list
    flap: list
    sleeping_bag: list
    ladder: list
    ladder_pivot: tuple
    flap_pivot: tuple


def ground_ladder(d: Dims):
    x, y, _ = d.ladder_pivot
    near, far = d.ladder_rails_z
    ladder = [box(x, d.ladder_bottom, z, x+1, y, z+1, "strap",
                  pivot=d.ladder_pivot, rotation=(0, 0, d.ladder_tilt))
              for z in d.ladder_rails_z]
    for rung_y in range(d.ladder_first_rung, y, 5):
        ladder.append(box(x, rung_y, near+1, x+1, rung_y+0.8, far, "ring",
                          pivot=d.ladder_pivot, rotation=(0, 0, d.ladder_tilt)))
    return ladder


def reflective_ladder(d: Dims):
    x, y, _ = d.ladder_pivot
    near, far = d.ladder_rails_z
    ladder = [box(x, d.ladder_bottom, z, x+d.ladder_rail_width, y, z+d.ladder_rail_width, "strap",
                  pivot=d.ladder_pivot, rotation=(0, 0, d.ladder_tilt))
              for z in d.ladder_rails_z]
    for rung_y in range(d.ladder_first_rung, y, d.ladder_rung_spacing):
        ladder.append(box(x, rung_y, near+d.ladder_rail_width,
                          x+d.ladder_rail_width, rung_y+d.ladder_rung_height, far, "strap",
                          pivot=d.ladder_pivot, rotation=(0, 0, d.ladder_tilt)))
        for z in (near+d.ladder_rail_width, far-d.ladder_tape_length):
            ladder.append(box(x+d.ladder_rail_width, rung_y, z, x+d.ladder_rail_width+d.ladder_tape_thickness,
                              rung_y+d.ladder_rung_height, z+d.ladder_tape_length, "hook",
                              pivot=d.ladder_pivot, rotation=(0, 0, d.ladder_tilt)))
    return ladder


LADDER_BUILDERS = {"ground": ground_ladder, "reflective": reflective_ladder}


def soft_shell(d: Dims) -> Shell:
    t = d.panel_thickness
    frame = d.frame_thickness
    end = d.half_width - d.end_inset
    rise = d.wall_height - d.platform_height
    body = [box(-d.half_width, 0, -d.half_depth,
                d.half_width, d.platform_height, d.half_depth, d.platform_color)]
    for x in d.pole_x:
        for z in (-d.half_depth+1, d.half_depth-2):
            body.append(box(x, d.platform_height, z, x+1, d.wall_height, z+1, "pole"))

    for x in d.mount_bar_x:
        body.append(box(x-d.mount_bar_width/2, d.shell_lift-d.mount_bar_drop, -d.mount_bar_half_depth,
                        x+d.mount_bar_width/2, d.shell_lift, d.mount_bar_half_depth, "strap"))
        for z in d.mount_foot_z:
            body.append(box(x-d.mount_foot_width/2, d.shell_lift-d.mount_foot_drop, z-d.mount_foot_width/2,
                            x+d.mount_foot_width/2, d.shell_lift-d.mount_bar_drop, z+d.mount_foot_width/2, "strap"))

    roof_rise = d.ridge_height - d.wall_height
    roof_length = math.hypot(d.half_roof, roof_rise)
    roof_angle = math.degrees(math.atan2(roof_rise, d.half_roof))
    fabric = [box(-end, d.ridge_height, -roof_length,
                  end, d.ridge_height+t, 0, "fly",
                  pivot=(0, d.ridge_height, 0), rotation=(roof_angle, 0, 0)),
              box(-end, d.ridge_height, 0,
                  end, d.ridge_height+t, roof_length, "fly",
                  pivot=(0, d.ridge_height, 0), rotation=(-roof_angle, 0, 0))]

    def zip_loop(u0, u1, v0, v1):
        c, w = d.zip_chamfer, d.seam_width
        yield (u0, u1, v0, v0+w)
        yield (u0, u0+w, v0, v1-c)
        yield (u1-w, u1, v0, v1-c)
        yield (u0+c, u1-c, v1-w, v1)
        step = c/d.zip_chamfer_steps
        for i in range(d.zip_chamfer_steps):
            for sign in (-1, 1):
                u = u0+i*step if sign < 0 else u1-(i+1)*step-w
                v = v1-c+i*step
                yield (u, u+step+w, v, v+step+w)

    for side in (-1, 1):
        for x0, x1, z0, z1 in [
                (-end, end, roof_length-1, roof_length-1+d.seam_width),
                (-end, end, roof_length-5, roof_length-5+d.seam_width),
                (-end+1, -end+1+d.seam_width, 0, roof_length),
                (end-1-d.seam_width, end-1, 0, roof_length),
                *zip_loop(-end+d.roof_zip_inset, end-d.roof_zip_inset,
                          d.roof_zip_inset, roof_length-d.roof_zip_inset)]:
            fabric.append(box(x0, d.ridge_height+t+d.seam_proud, min(side*z0, side*z1),
                              x1, d.ridge_height+t+d.seam_proud+d.seam_width, max(side*z0, side*z1),
                              "strap", pivot=(0, d.ridge_height, 0), rotation=(-side*roof_angle, 0, 0)))

    cap_length = math.hypot(d.ridge_cap_half_depth, d.ridge_cap_rise)
    cap_angle = math.degrees(math.atan2(d.ridge_cap_rise, d.ridge_cap_half_depth))
    cap_y = d.ridge_height + d.ridge_cap_lift
    for side in (-1, 1):
        fabric.append(box(-end, cap_y, min(0, side*cap_length),
                          end, cap_y+d.ridge_cap_thickness, max(0, side*cap_length),
                          "fly_dark", pivot=(0, cap_y, 0), rotation=(-side*cap_angle, 0, 0)))
        z = side*d.half_depth
        fabric.append(box(-end, d.wall_height+t, z-d.seam_width/2,
                          end, d.wall_height+t+d.seam_width, z+d.seam_width/2, "strap"))
    fabric.append(box(-end, cap_y+d.ridge_cap_thickness, -d.seam_width/2,
                      end, cap_y+d.ridge_cap_thickness+d.seam_width, d.seam_width/2, "strap"))

    def outer_x(y):
        return d.half_width - (y-d.platform_height) * d.end_inset / rise

    # Half-pixel courses describe a trapezoid without a forbidden two-axis cube tilt.
    courses = math.ceil((d.window_top-d.window_bottom) / t)
    for side in (-1, 1):
        z = -d.half_depth if side < 0 else d.half_depth-t
        frame_z0 = z-frame if side < 0 else z
        frame_z1 = z+t if side < 0 else z+t+frame
        for bottom, top in ((d.platform_height, d.platform_height+t),
                            (d.window_top, d.wall_height)):
            rows = math.ceil((top-bottom) / t)
            for i in range(rows):
                low = bottom + i*(top-bottom)/rows
                high = bottom + (i+1)*(top-bottom)/rows
                fabric.append(box(-outer_x(low), low, z, outer_x(low), high, z+t, "fly"))
        for i in range(courses):
            low = d.window_bottom + i * (d.window_top-d.window_bottom) / courses
            high = d.window_bottom + (i+1) * (d.window_top-d.window_bottom) / courses
            inner = d.window_half_depth - d.frame_lean * (low-d.window_bottom) / (d.window_top-d.window_bottom)
            fabric += [box(-outer_x(low), low, z, -inner, high, z+t, "fly"),
                       box(inner, low, z, outer_x(low), high, z+t, "fly")]
        for sign in (-1, 1):
            lo, hi = ((-outer_x(d.window_bottom-frame), -d.doorway_half_width)
                      if sign < 0 else (d.doorway_half_width, outer_x(d.window_bottom-frame)))
            rows = math.ceil((d.window_bottom-d.platform_height-t) / t)
            for i in range(rows):
                low = d.platform_height+t + i*(d.window_bottom-d.platform_height-t)/rows
                high = d.platform_height+t + (i+1)*(d.window_bottom-d.platform_height-t)/rows
                left, right = ((-outer_x(low), -d.doorway_half_width) if sign < 0
                               else (d.doorway_half_width, outer_x(low)))
                fabric.append(box(left, low, z, right, high, z+t, "fly"))
            fabric.append(box(lo, d.window_bottom-frame, frame_z0,
                              hi, d.window_bottom, frame_z1, "strap"))
            pivot = (sign*d.window_half_depth, d.window_bottom, z)
            angle = math.degrees(math.atan2(d.frame_lean, d.window_top-d.window_bottom))
            length = math.hypot(d.frame_lean, d.window_top-d.window_bottom)
            fabric.append(box(pivot[0]-frame/2, d.window_bottom, frame_z0,
                              pivot[0]+frame/2, d.window_bottom+length, frame_z1,
                              "strap", pivot=pivot, rotation=(0, 0, -sign*angle)))
        fabric += [box(-d.window_half_depth+d.frame_lean, d.window_top-frame, frame_z0,
                       d.window_half_depth-d.frame_lean, d.window_top, frame_z1, "strap"),
                   box(-d.window_half_depth+d.frame_lean, d.window_bottom, z+t/3,
                       d.window_half_depth-d.frame_lean, d.window_top-frame, z+2*t/3, "glass")]
        fabric += [box(-frame/2, d.window_bottom, z-frame if side < 0 else z+t,
                       frame/2, d.window_top, z if side < 0 else z+t+frame, "strap"),
                   box(-d.window_half_depth-frame, d.window_top, z-1.2 if side < 0 else z+t+0.7,
                       d.window_half_depth+frame, d.window_top+1.5,
                       z-0.7 if side < 0 else z+t+1.2, "strap")]
        fabric.append(box(-d.window_half_depth-frame, d.window_top+1.5-t, z-1.2 if side < 0 else z,
                          d.window_half_depth+frame, d.window_top+1.5,
                          z+t if side < 0 else z+t+1.2, "strap"))
        # Single-axis strips follow the trapezoid and frame without compound rotations.
        seam_z = z-d.seam_proud-d.seam_width if side < 0 else z+t+d.seam_proud
        seam_top = seam_z+d.seam_width
        corner_angle = math.degrees(math.atan2(d.end_inset, rise))
        corner_length = math.hypot(d.end_inset, rise)
        for sign in (-1, 1):
            pivot = (sign*d.half_width, d.platform_height, z)
            fabric.append(box(pivot[0]-t/2, d.platform_height, z,
                              pivot[0]+t/2, d.platform_height+corner_length, z+t,
                              "fly_dark", pivot=pivot, rotation=(0, 0, -sign*corner_angle)))
            fabric.append(box(pivot[0]-d.seam_width/2, d.platform_height, seam_z,
                              pivot[0]+d.seam_width/2, d.platform_height+corner_length, seam_top,
                              "strap", pivot=pivot, rotation=(0, 0, -sign*corner_angle)))
            pivot = (sign*d.window_half_depth, d.window_bottom, z)
            fabric.append(box(pivot[0]-d.seam_width/2, d.window_bottom, seam_z,
                              pivot[0]+d.seam_width/2, d.window_bottom+length, seam_top,
                              "strap", pivot=pivot, rotation=(0, 0, -sign*angle)))
            toggle_x = sign*(d.window_half_depth+d.toggle_offset)
            fabric.append(box(toggle_x-d.toggle_length/2, d.window_top-d.toggle_height, seam_z,
                              toggle_x+d.toggle_length/2, d.window_top, seam_top, "strap"))
            low = d.window_bottom + (d.window_top-d.window_bottom)/2
            fabric.append(box(toggle_x-d.toggle_length/2, low, seam_z,
                              toggle_x+d.toggle_length/2, low+d.toggle_height, seam_top, "strap"))
        for low in (d.window_bottom-frame, d.window_top-frame):
            fabric.append(box(-d.window_half_depth+d.frame_lean, low, seam_z,
                              d.window_half_depth-d.frame_lean, low+d.seam_width, seam_top, "strap"))
        if side > 0:
            fabric.append(box(-d.doorway_half_width, d.platform_height+t, z,
                              d.doorway_half_width, d.window_bottom, z+t, "fly"))

    # End sheets and gable courses share the same inward taper; the roof overhangs the gables.
    end_angle = math.degrees(math.atan2(d.end_inset, rise))
    end_length = math.hypot(d.end_inset, rise)
    for side in (-1, 1):
        x = side*d.half_width
        pivot = (x, d.platform_height, 0)
        rotation = (0, 0, -side*end_angle)
        if side in d.end_window_sides:
            # Split the leaning sheet in its local plane so the mesh is a real opening.
            for low, high, z0, z1 in (
                    (d.platform_height, d.end_window_bottom, -d.half_depth, d.half_depth),
                    (d.end_window_top, d.platform_height+end_length, -d.half_depth, d.half_depth),
                    (d.end_window_bottom, d.end_window_top, -d.half_depth, -d.end_window_half_depth),
                    (d.end_window_bottom, d.end_window_top, d.end_window_half_depth, d.half_depth)):
                fabric.append(box(x-t/2, low, z0, x+t/2, high, z1, "fly",
                                  pivot=pivot, rotation=rotation))
            fabric.append(box(x-t/6, d.end_window_bottom, -d.end_window_half_depth,
                              x+t/6, d.end_window_top, d.end_window_half_depth, "glass",
                              pivot=pivot, rotation=rotation))
            face_x = x+side*(t/2+d.seam_proud)
            for low, high, z0, z1 in (
                    (d.end_window_bottom-frame, d.end_window_bottom, -d.end_window_half_depth-frame, d.end_window_half_depth+frame),
                    (d.end_window_top, d.end_window_top+frame, -d.end_window_half_depth-frame, d.end_window_half_depth+frame),
                    (d.end_window_bottom, d.end_window_top, -d.end_window_half_depth-frame, -d.end_window_half_depth),
                    (d.end_window_bottom, d.end_window_top, d.end_window_half_depth, d.end_window_half_depth+frame)):
                fabric.append(box(face_x-frame/2, low, z0, face_x+frame/2, high, z1,
                                  "strap", pivot=pivot, rotation=rotation))
            fabric.append(box(face_x-frame/2, d.end_window_bottom, -frame/2,
                              face_x+frame/2, d.end_window_top, frame/2,
                              "strap", pivot=pivot, rotation=rotation))
            hood_x = x+side*(t/2+0.95)
            fabric.append(box(hood_x-0.25, d.end_window_top+frame, -d.end_window_half_depth-frame,
                              hood_x+0.25, d.end_window_top+frame+1.5, d.end_window_half_depth+frame,
                              "fly_dark", pivot=pivot, rotation=rotation))
            fabric.append(box(min(x, hood_x-0.25), d.end_window_top+frame+1.5-t, -d.end_window_half_depth-frame,
                              max(x, hood_x+0.25), d.end_window_top+frame+1.5, d.end_window_half_depth+frame,
                              "fly_dark", pivot=pivot, rotation=rotation))
            for sign in (-1, 1):
                tab_z = sign*(d.end_window_half_depth+d.toggle_offset)
                fabric.append(box(face_x-frame/2, d.end_window_top-d.toggle_height, tab_z-d.toggle_length/2,
                                  face_x+frame/2, d.end_window_top, tab_z+d.toggle_length/2,
                                  "strap", pivot=pivot, rotation=rotation))
                low = (d.end_window_bottom+d.end_window_top)/2
                fabric.append(box(face_x-frame/2, low, tab_z-d.toggle_length/2,
                                  face_x+frame/2, low+d.toggle_height, tab_z+d.toggle_length/2,
                                  "strap", pivot=pivot, rotation=rotation))
        else:
            fabric.append(box(x-t/2, d.platform_height, -d.half_depth,
                              x+t/2, d.platform_height+end_length, d.half_depth,
                              "fly", pivot=pivot, rotation=rotation))
            face_x = x+side*(t/2+d.seam_proud)
            half_zip = d.half_depth*d.end_zip_depth_fraction
            bottom = d.platform_height+end_length*(1-d.end_zip_height_fraction)/2
            top = bottom+end_length*d.end_zip_height_fraction
            for z0, z1, low, high in zip_loop(-half_zip, half_zip, bottom, top):
                fabric.append(box(face_x-d.seam_width/2, low, z0,
                                  face_x+d.seam_width/2, high, z1, "strap",
                                  pivot=pivot, rotation=rotation))
        courses = math.ceil(roof_rise / t)
        for i in range(courses):
            low = d.wall_height + i*roof_rise/courses
            high = d.wall_height + (i+1)*roof_rise/courses
            half_z = d.half_roof*(d.ridge_height-low)/roof_rise
            x = side*outer_x(low)
            fabric.append(box(x-t/2, low, -half_z, x+t/2, high, half_z, "fly"))
            face_x = x+side*(t/2+d.seam_proud)
            for slope in (-1, 1):
                z = slope*half_z
                fabric.append(box(face_x-d.seam_width/2, low, z-d.seam_width/2,
                                  face_x+d.seam_width/2, high, z+d.seam_width/2, "strap"))

    ladder = LADDER_BUILDERS[d.ladder_style](d)
    flap_pivot = (0, d.platform_height+t, -d.half_depth)
    flap = [box(-d.doorway_half_width, flap_pivot[1], -d.half_depth,
                d.doorway_half_width, d.window_bottom, -d.half_depth+t, "fly")]
    flap_z = -d.half_depth-d.seam_proud-d.seam_width
    for x in (-d.doorway_half_width, d.doorway_half_width-d.seam_width):
        flap.append(box(x, flap_pivot[1], flap_z, x+d.seam_width,
                        d.window_bottom, -d.half_depth-d.seam_proud, "strap"))
    for y in (flap_pivot[1], d.window_bottom-d.seam_width,
              flap_pivot[1]+(d.window_bottom-flap_pivot[1])/3,
              flap_pivot[1]+2*(d.window_bottom-flap_pivot[1])/3):
        flap.append(box(-d.doorway_half_width, y, flap_z, d.doorway_half_width,
                        y+d.seam_width, -d.half_depth-d.seam_proud, "strap"))
    flap.append(box(-d.flap_strap_width/2, flap_pivot[1], flap_z-d.seam_proud,
                    d.flap_strap_width/2, d.window_bottom, flap_z, "strap"))
    for cube in flap[1:]:
        mirrored = dict(cube)
        mirrored["origin"] = [cube["origin"][0], cube["origin"][1], -cube["origin"][2]-cube["size"][2]]
        fabric.append(mirrored)
    return Shell(body, fabric, flap,
                 [box(-d.half_width*d.bedding_half_width, d.platform_height, d.half_depth*d.bedding_front,
                      d.half_width*d.bedding_half_width, d.platform_height+d.mattress_rise, d.half_depth*d.bedding_back, "mattress_edge"),
                  box(-d.half_width*d.bedding_half_width, d.platform_height+d.mattress_rise, d.half_depth*d.bedding_front,
                      d.half_width*d.bedding_half_width, d.platform_height+d.sleeping_bag_rise, d.half_depth*d.sleeping_bag_back, "mattress"),
                  box(-d.half_width*d.pillow_half_width, d.platform_height+d.mattress_rise, d.half_depth*d.pillow_front,
                      d.half_width*d.pillow_half_width, d.platform_height+d.pillow_rise, d.half_depth*d.pillow_back, "inner")],
                 ladder, d.ladder_pivot, flap_pivot)


def parts(suv=False):
    d = SUV_DIMS if suv else GROUND_DIMS
    shell = soft_shell(d)
    rack_start = 1+2*len(d.pole_x)
    for cubes in (shell.body[:rack_start], shell.fabric, shell.flap, shell.sleeping_bag, shell.ladder):
        for cube in cubes:
            cube["origin"][1] += d.shell_lift
            if "pivot" in cube:
                cube["pivot"][1] += d.shell_lift
    def lifted(pivot):
        return (pivot[0], pivot[1]+d.shell_lift, pivot[2])
    def bone(name, cubes, pivot=(0, 0, 0), parent="body"):
        return {"name": name, "parent": parent, "pivot": list(pivot), "cubes": cubes}
    return [{"name": "root", "pivot": [0, 0, 0]},
            bone("body", shell.body, parent="root"),
            bone("fabric", shell.fabric),
            bone("flap", shell.flap, lifted(shell.flap_pivot)),
            bone("sleeping_bag", shell.sleeping_bag),
            bone("ladder", shell.ladder, lifted(shell.ladder_pivot))]


def geometry():
    geometries = []
    for suv in (False, True):
        d = SUV_DIMS if suv else GROUND_DIMS
        bones = tent.rounded(parts(suv=suv))
        cubes = [c for bone in bones for c in bone.get("cubes", [])]
        cube_tilt.assert_axes(cubes, {})
        for bone in bones:
            for cube in bone.get("cubes", []):
                for point in tent.corners(cube):
                    lower = d.ladder_lower if bone["name"] == "ladder" else d.shell_lower
                    upper = (d.ladder_upper_x, d.shell_upper[1], d.shell_upper[2]) if bone["name"] == "ladder" else d.shell_upper
                    assert all(lo <= v <= hi for v, lo, hi in zip(point, lower, upper)), bone["name"]
                for face in cube["uv"].values():
                    u, v = face["uv"]
                    slot = int(u // 4 + 4 * (v // 4))
                    assert slot > 1 or bone["name"] in ("fabric", "flap"), bone["name"]
        geometries.append({
            "description": {"identifier": "geometry.yasu_ride.roof_tent" + ("_suv" if suv else ""),
                            "texture_width": 16, "texture_height": 16,
                            "visible_bounds_width": d.visible_bounds_width,
                            "visible_bounds_height": d.visible_bounds_height,
                            "visible_bounds_offset": list(d.visible_bounds_offset)},
            "bones": bones,
        })
    return {"format_version": "1.12.0", "minecraft:geometry": geometries}


# The slots the roof tent used before the ground tent gained mesh, zip, and inner floor
# colours; later tent slots stay transparent here so its texture does not change with them.
ROOF_TENT_SLOTS = 12


def texture_pixel(paint):
    palette = tent.paint_palette(paint)
    if paint == "khaki":
        for slot, shade in tent.FLY_SHADES.items():
            palette[slot] = tent.scale(FLY_PAINTS[paint], shade) + (255,)
    # The tent's glass swatch becomes a dark translucent woven window mesh.
    def pixel(x, y):
        slot = (y // 4) * 4 + x // 4
        if slot == tent.SLOTS.index("glass"):
            return (24, 28, 30, 160 if x % 2 == 0 or y % 2 == 0 else 64)
        return palette[tent.SLOTS[slot]] if slot < ROOF_TENT_SLOTS else (0, 0, 0, 0)
    return pixel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry())
    for paint in FLY_PAINTS:
        path = TEXTURE if paint == "khaki" else TEXTURE.replace(".png", f"_{paint}.png")
        out.png(args.resource_pack / path, 16, 16, texture_pixel(paint), compress_level=9)
    out.finish("Roof tent outputs are stale. Run `pnpm model`:", "roof tent model and textures are up to date")


if __name__ == "__main__":
    main()
