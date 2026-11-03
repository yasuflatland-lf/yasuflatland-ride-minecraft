"""Shared dimensions in model pixels for the ground tent's part builders."""
from dataclasses import dataclass
from typing import TypedDict


class Part(TypedDict):
    cubes: list[dict]
    bones: dict[str, dict]


@dataclass(frozen=True)
class Dims:
    half_width: int = 52
    wall_height: int = 32
    arch_rise: int = 39
    arch_segments: int = 32
    front_z: int = -135
    rear_z: int = 8
    shell_thickness: int = 1
    side_gap_front_z: int = -88
    side_gap_rear_z: int = -72
    door_half_width: int = 8
    strip_width: int = 1

    tarp_run: int = 49
    tarp_rise: int = 20
    tarp_half_width: int = 41
    tarp_top_y: int = 60
    binding_height: int = 1
    binding_proud: float = 0.1
    pole_thickness: float = 1.5
    arch_pole_z: tuple = (-134, -58, 4)
    tarp_pole_inner_x: int = 40

    inner_half_width: int = 41
    inner_front_z: int = -55
    inner_rear_z: int = -7
    inner_height: int = 48
    inner_wall_thickness: int = 1
    inner_roof_thickness: int = 2
    bedroom_rim_width: float = 0.5
    mattress_x: tuple = (16, -16)
    mattress_half_width: int = 7
    mattress_front_z: int = -39
    mattress_rear_z: int = -9
    mattress_edge_height: int = 8
    mattress_height: int = 9

    strap_bounds: tuple = (-1, 69, -134, 1, 70, 4)
    ring_first_z: int = -132
    ring_stop_z: int = 5
    ring_spacing: int = 24
    ring_outer_x: float = 1.05
    ring_inner_half_width: float = 0.6
    ring_half_depth: int = 1
    ring_bottom_y: float = 68.75
    ring_top_y: float = 69.25
    lantern_hook_bounds: tuple = (-0.5, 44, -64.5, 0.5, 69, -63.5)
    lantern_cap_bounds: tuple = (-3, 44, -67, 3, 45, -61)
    lantern_pivot: tuple = (0, 69, -64)
    glass_radius: int = 4
    glass_bottom_y: int = 36
    glass_top_y: int = 44
    glass_pivot: tuple = (0, 40, -64)


DIMS = Dims()
