"""Shared dimensions in model pixels for the ground tent's part builders."""
from dataclasses import dataclass
from typing import TypedDict


class Part(TypedDict):
    cubes: list[dict]
    bones: dict[str, dict]


@dataclass(frozen=True)
class Dims:
    half_width: int = 56  # Seven cells include the half-cell margins at both sides.
    front_z: int = -88  # Depth 3 starts the body behind the three-cell tarp.
    rear_z: int = 8  # The anchor is the rear wall's middle cell (ADR 0130).
    ridge_height: int = 48  # Three layers provide the body's headroom.
    lean: float = 19.2  # Each face leans 1.2 cells over the full ridge height.
    shell_thickness: float = 0.5  # Thin panels follow the roof tent's construction.
    band_height: int = 2  # Short bands approximate trapezoids without hundreds of cubes.
    seam_width: int = 1  # Dark frames make each panel boundary visible in previews.
    seam_proud: float = 0.08  # Offset frames prevent coplanar faces from flickering.
    door_half_width: int = 24  # Three front flap cells span the doorway at the floor.
    door_height: int = 35  # The opening meets the underside of the tarp.
    strip_width: int = 1

    tarp_front_z: int = -136  # Depth 0 includes the front half-cell margin.
    tarp_underside: int = 35  # The tarp clears the two-layer entrance.
    tarp_foot_x: int = 48  # An inward foot keeps the screen below the roof's outer edge.
    tarp_foot_depth: int = 16  # A short front foot leaves the rear approach open.
    pole_thickness: float = 1.5
    window_bottom: int = 8  # The window stays within the two depth-4 flap cells.
    window_top: int = 28  # Leave clearance below the eave seam.
    window_front_z: int = -70  # Inset the window from the depth-4 cell edges.
    window_rear_z: int = -58
    window_proud: float = 0.12
    flap_proud: float = 0.9
    mesh_width: float = 0.25
    mesh_spacing: int = 6
    entrance_frame_width: int = 1
    entrance_bundle_half_width: int = 26

    inner_half_width: int = 40
    inner_lean: int = 4
    inner_front_z: int = -42
    inner_rear_z: float = -8.5
    inner_height: int = 40  # The roof clears the bedroom while staying under the outer shell.
    inner_door_half_width: int = 8
    inner_door_top_half_width: int = 6
    wall_height: int = 32
    inner_wall_thickness: float = 0.5
    inner_roof_thickness: float = 0.5
    inner_floor_thickness: float = 0.5
    rear_window_half_width: int = 16
    rear_window_bottom: int = 14
    rear_window_top: int = 30
    rear_window_corner: int = 3
    bedroom_rim_width: float = 0.5
    mattress_x: tuple = (16, -16)
    mattress_half_width: int = 7
    mattress_front_z: int = -39
    mattress_rear_z: int = -9
    mattress_edge_height: int = 8
    mattress_height: int = 9

    strap_bounds: tuple = (-1, 46.5, -68, 1, 47.5, -12)
    ring_first_z: int = -66
    ring_stop_z: int = -12
    ring_spacing: int = 24
    ring_outer_x: float = 1.05
    ring_inner_half_width: float = 0.6
    ring_half_depth: int = 1
    ring_bottom_y: float = 46.25
    ring_top_y: float = 46.75
    lantern_hook_bounds: tuple = (-0.5, 44, -64.5, 0.5, 47.5, -63.5)
    lantern_cap_bounds: tuple = (-3, 44, -67, 3, 45, -61)
    lantern_pivot: tuple = (0, 47.5, -64)
    glass_radius: int = 4
    glass_bottom_y: int = 36
    glass_top_y: int = 44
    glass_pivot: tuple = (0, 40, -64)


DIMS = Dims()
