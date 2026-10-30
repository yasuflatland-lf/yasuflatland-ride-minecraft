"""SUV dashboard slab and passenger fittings."""

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
translate = suv_cubes.translate


def dash_slab_cubes():
    return [
        # Dashboard
        box(-CABIN_HALF_WIDTH, DASH_BOTTOM_Y, DASH_FACE_Z, CABIN_HALF_WIDTH, HOOD_TOP_Y, HOOD_REAR_Z, "trim"),
    ]


def passenger_dash_cubes():
    # Passenger side of the dashboard, like an old utility 4x4: a flat body-colored panel under a black
    # pad along the top, a chrome windshield latch at the outer end of the pad, a black grab bar standing
    # off the panel on two posts, a black box under the bar, and a glovebox lid a little proud of the panel
    # at the outer end with a chrome knob. The driver's side keeps its gauges and wheel.
    passenger_dash = [
        box(-CABIN_HALF_WIDTH, 13, 9.9, -1, 16.3, 10, "body"),  # panel
        box(-CABIN_HALF_WIDTH, 16.3, 9.7, -1, HOOD_TOP_Y - 2, 10, "grille"),  # pad
        box(-11.3, 16.1, 9.5, -10.5, 17.3, 9.7, "rim"),  # windshield latch
        box(-9.6, 15.3, 9.2, -3, 15.7, 9.5, "grille"),  # grab bar
        *[box(x - 0.2, 15.3, 9.5, x + 0.2, 15.7, 9.9, "trim") for x in (-9.3, -3.3)],  # bar posts
        box(-6.6, 13.9, 9.6, -2.4, 14.9, 9.9, "grille"),  # box under the bar
        box(-11.7, 13.3, 9.75, -8.1, 14.9, 9.9, "body"),  # glovebox lid
        box(-9.05, 14.4, 9.65, -8.75, 14.7, 9.75, "rim"),  # glovebox knob
    ]
    translate(passenger_dash, 2, DASH_SHIFT_Z)
    return passenger_dash
