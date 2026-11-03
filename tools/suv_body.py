"""SUV body assembly: the Rubicon-shaped body of ADR 0214 as cubes per bone.

The parts are written in tyre diameters D in suv_hull.py, suv_front.py, suv_cab.py and suv_rear.py;
this module puts them in order, widens the body, and converts the result to construction pixels and
swatch UVs. The wheels come from suv_running_gear.py and the lamp panels from suv_lamps.py.
"""

from tool_loader import load_tool

dims = load_tool("suv_dims")
kit_module = load_tool("suv_kit")
hull = load_tool("suv_hull")
front = load_tool("suv_front")
cab = load_tool("suv_cab")
rear = load_tool("suv_rear")
lamps = load_tool("suv_lamps")
running_gear = load_tool("suv_running_gear")
suv_cubes = load_tool("suv_cubes")
kit = kit_module.kit

DOORS = tuple(f"door_{end}{side}" for end in "fr" for side in "lr")
# The cubes the body turns about more than one axis: the hood's sloped shoulder strips, which follow
# the widening body (ADR 0167, 0214).
ASSEMBLIES = {"hull_turns": 4}


def convert(cubes):
    return kit_module.to_construction(cubes, dims.D, dims.FRONT_AXLE_Z)


def build():
    """The body's cubes by bone name, in construction coordinates (forward is +z)."""
    kit.reset()
    hull.chassis()
    hull.side_walls()
    hull.hood()
    hull.intake()
    hull.cowl()
    front.grille()
    front.headlamps_and_markers()
    cab.door_skins()
    cab.upper_cabin()
    cab.pillars_and_side_windows()
    cab.windshield_frame()
    cab.wipers()
    cab.rear_window_frame()
    cab.tailgate_panel()
    cab.seams_and_fittings()
    front.bumper()
    rear.bumper_and_lamps()
    rear.spare_carrier()
    hull.widen_body()

    groups = {}
    for cube in kit.cubes:
        groups.setdefault(cube["bone"], []).append(cube)
    bones = {name: convert(cubes) for name, cubes in groups.items()}
    bones.setdefault("body", [])
    bones["body"] += running_gear.spare_wheel()
    both_sides = suv_cubes.both_sides
    bones["headlight_bezels"] = lamps.headlight_bezel_cubes()
    bones.setdefault("headlights", []).extend(lamps.headlight_lens_cubes())
    bones["tail_lights"] = [*lamps.third_brake_light_cubes(), *both_sides(lamps.tail_light_cubes())]
    bones["windows_sealed"] = convert(cab.sealed_windows())
    bones["rear_glass"] = convert(cab.rear_glass())
    for name in DOORS:
        bones.setdefault(name, [])
    return bones
