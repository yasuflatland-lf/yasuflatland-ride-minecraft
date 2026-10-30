"""SUV grained dashboard, passenger tray and centre stack."""

import math

from tool_loader import load_tool

globals().update({k: v for k, v in vars(load_tool("suv_dims")).items() if k.isupper()})
suv_cubes = load_tool("suv_cubes")
box = suv_cubes.box
translate = suv_cubes.translate

DASH_STACK_X0 = -3.4
DASH_STACK_X1 = 1.4
LOCAL_FACE_Z = DASH_FACE_Z - DASH_SHIFT_Z
PANEL_Z = 9.85
PASSENGER_TOP_Y = 17
PAD_BOTTOM_Y = 16.3
PAD_FRONT_Z = 9.7
HANDLE_X0, HANDLE_X1 = -9.6, -4.1
HANDLE_Y0, HANDLE_Y1 = 15.3, 15.7
HANDLE_POST_X = (-9.3, -4.4)
HANDLE_POST_HALF = 0.2
HANDLE_FRONT_Z, HANDLE_BACK_Z = 9.2, 9.5
LATCH_BOUNDS = (-11.3, 16.1, 9.5, -10.5, 17.3, 9.7)
TRAY_BOUNDS = (-11.5, 13.35, 9.55, -3.9, 13.55, PANEL_Z)
VENT_CENTERS = (-2.8, 0.8)
VENT_Y, VENT_RADIUS = 18.15, 0.48
RING_WIDTH, RING_SEGMENTS = 0.12, 12
RING_FRONT_Z = 9.6
AUDIO_BOUNDS = (-3, 15.25, 9.55, 1, 16.25, PANEL_Z)
KNOB_CENTERS = (-2.65, 0.65)
KNOB_Y, KNOB_RADIUS = 14.35, 0.28
KNOB_FRONT_Z, KNOB_BACK_Z = 9.6, PANEL_Z
KNOB_ANGLES = (0, 45)
KNOB_TURNED_SETBACK = 0.02
FACES = ("north", "south", "east", "west", "up", "down")


def region_rectangle(name):
    spec = suv_cubes.atlas.region_spec("dash", name)
    return (0, 0, spec.w, spec.h)


def grain_faces():
    return suv_cubes.region_faces("dash", "grain", {
        face: region_rectangle("grain") for face in FACES})


def panel_faces(region):
    return suv_cubes.region_faces("dash", region, {"north": region_rectangle(region)})


def dash_slab_cubes():
    return [box(-CABIN_HALF_WIDTH, DASH_BOTTOM_Y, DASH_FACE_Z,
                CABIN_HALF_WIDTH, HOOD_TOP_Y, HOOD_REAR_Z, grain_faces())]


def vent_ring(cx):
    half_chord = VENT_RADIUS * math.tan(math.pi / RING_SEGMENTS)
    cubes = []
    for segment in range(RING_SEGMENTS):
        cube = box(cx - half_chord, VENT_Y + VENT_RADIUS - RING_WIDTH, RING_FRONT_Z,
                   cx + half_chord, VENT_Y + VENT_RADIUS, PANEL_Z, grain_faces())
        cube["pivot"] = [cx, VENT_Y, LOCAL_FACE_Z]
        cube["rotation"] = [0, 0, segment * 360 / RING_SEGMENTS]
        cubes.append(cube)
    return cubes


def dash_fittings_cubes():
    # Passenger panel, tray, grab handle, centre stack, head unit, vents and knobs, built in
    # the dash-local frame (the slab's rear face at LOCAL_FACE_Z) and moved by DASH_SHIFT_Z
    # at the end. The north faces face the seats and carry the drawn regions; export's
    # 180-degree turn (suv_export.turn_around) renames them south and mirrors their UV.
    cubes = [
        box(-CABIN_HALF_WIDTH, DASH_BOTTOM_Y, PANEL_Z, DASH_STACK_X0,
            PASSENGER_TOP_Y, LOCAL_FACE_Z, panel_faces("passenger")),
        box(-CABIN_HALF_WIDTH, PAD_BOTTOM_Y, PAD_FRONT_Z, DASH_STACK_X0,
            PASSENGER_TOP_Y, LOCAL_FACE_Z, grain_faces()),
        box(*LATCH_BOUNDS, "rim"),
        box(HANDLE_X0, HANDLE_Y0, HANDLE_FRONT_Z, HANDLE_X1, HANDLE_Y1,
            HANDLE_BACK_Z, grain_faces()),
        *[box(x - HANDLE_POST_HALF, HANDLE_Y0, HANDLE_BACK_Z,
              x + HANDLE_POST_HALF, HANDLE_Y1, PANEL_Z, grain_faces())
          for x in HANDLE_POST_X],
        box(*TRAY_BOUNDS, grain_faces()),
        box(DASH_STACK_X0, DASH_BOTTOM_Y, PANEL_Z, DASH_STACK_X1,
            HOOD_TOP_Y, LOCAL_FACE_Z, panel_faces("stack")),
        box(*AUDIO_BOUNDS, panel_faces("audio")),
    ]
    for cx in VENT_CENTERS:
        cubes.extend(vent_ring(cx))
    for cx in KNOB_CENTERS:
        for angle in KNOB_ANGLES:
            front = KNOB_FRONT_Z + (KNOB_TURNED_SETBACK if angle else 0)
            cubes.extend(suv_cubes.disc("z", (cx, KNOB_Y, LOCAL_FACE_Z), KNOB_RADIUS,
                                       front, KNOB_BACK_Z, (angle,), panel_faces("knob")))
    translate(cubes, 2, DASH_SHIFT_Z)
    return cubes
